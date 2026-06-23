#ifndef HARDWARE_INTERFACE_H
#define HARDWARE_INTERFACE_H

#include <Arduino.h>
#include <AccelStepper.h>
#include <SCServo.h>

// --- BASE CLASS ---
class Joint {
  public:
    virtual ~Joint() = default;
    virtual void setTarget(float angle_radians) = 0;
    virtual void update() = 0;
    virtual void enable(bool state) = 0;
    virtual float readPosition() = 0; // Read current position in radians
    virtual float readLoad() { return 0.0f; }
};

// --- STEPPER JOINT ---
class StepperJoint : public Joint {
  private:
    AccelStepper _stepper;
    float _steps_per_rad;
    int _enable_pin;
    
  public:
    StepperJoint(int step_pin, int dir_pin, float steps_per_rev)
      : StepperJoint(step_pin, dir_pin, -1, steps_per_rev, 4000.0f, 2000.0f) {}

    StepperJoint(
      int step_pin,
      int dir_pin,
      int enable_pin,
      float steps_per_rev,
      float max_speed,
      float acceleration
    )
      : _stepper(AccelStepper::DRIVER, step_pin, dir_pin),
        _steps_per_rad(steps_per_rev / (2.0f * PI)),
        _enable_pin(enable_pin) {
      if (_enable_pin >= 0) {
        pinMode(_enable_pin, OUTPUT);
        digitalWrite(_enable_pin, HIGH); // Active LOW enable standard, start disabled
      }
      
      _stepper.setMaxSpeed(max_speed > 0 ? max_speed : 4000);
      _stepper.setAcceleration(acceleration > 0 ? acceleration : 2000);
      _stepper.setMinPulseWidth(20);
    }

    ~StepperJoint() override = default;

    void setTarget(float angle_radians) override {
      long target_steps = (long)(angle_radians * _steps_per_rad);
      _stepper.moveTo(target_steps);
    }

    void update() override {
      _stepper.run();
    }
    
    void enable(bool state) override {
      if (_enable_pin >= 0) {
        digitalWrite(_enable_pin, state ? LOW : HIGH);
      }
    }

    float readPosition() override {
      return (float)_stepper.currentPosition() / _steps_per_rad;
    }
};

#include <Servo.h>

// --- PWM SERVO JOINT (Hobby Servos) ---
class PwmServoJoint : public Joint {
  private:
    Servo _servo;
    int _pin;
    int _min_us;
    int _max_us;
    float _current_rad;

  public:
    PwmServoJoint(int pin, int min_us = 500, int max_us = 2500) {
      _pin = pin;
      _min_us = min_us;
      _max_us = max_us;
      _current_rad = 0.0f;
    }

    ~PwmServoJoint() override {
      if (_servo.attached()) {
        _servo.detach();
      }
    }

    void setTarget(float angle_radians) override {
      _current_rad = angle_radians;
      // Map radians (assume -PI/2 to PI/2 map to min_us and max_us)
      // -1.57 rad -> min_us, +1.57 rad -> max_us
      float normalized = (angle_radians + PI/2.0) / PI;
      if (normalized < 0.0f) normalized = 0.0f;
      if (normalized > 1.0f) normalized = 1.0f;
      
      int target_us = _min_us + (int)(normalized * (_max_us - _min_us));
      if (_servo.attached()) {
        _servo.writeMicroseconds(target_us);
      }
    }

    void update() override {
      // Nothing needed for standard PWM
    }

    void enable(bool state) override {
      if (state && !_servo.attached()) {
        _servo.attach(_pin, _min_us, _max_us);
      } else if (!state && _servo.attached()) {
        _servo.detach();
      }
    }

    float readPosition() override {
      return _current_rad; // Open loop, just report commanded target
    }
};


// --- SERVO JOINT (STS3215 Smart Servo) ---
constexpr float STS3215_STEPS_PER_RAD = 4096.0f / 6.283185f;
constexpr int STS3215_CENTER_POS = 2048;
constexpr int STS3215_POS_MIN = 0;
constexpr int STS3215_POS_MAX = 4095;

// STS3215 PID register addresses (RAM region)
constexpr uint8_t STS3215_REG_P = 21;  // Proportional gain
constexpr uint8_t STS3215_REG_I = 22;  // Integral gain
constexpr uint8_t STS3215_REG_D = 23;  // Derivative gain

// Aggressive defaults to resist gravity sag and backdrive.
// Factory defaults are typically P~15-32 which is too soft for loaded joints.
constexpr uint8_t STS3215_DEFAULT_P = 32;  // Stiffer position hold
constexpr uint8_t STS3215_DEFAULT_I = 0;   // No integral (avoids windup)
constexpr uint8_t STS3215_DEFAULT_D = 32;   // Light damping to reduce overshoot

class ServoJoint : public Joint {
  private:
    SMS_STS* _driver;
    int _id;
    int _center_offset;
    int _torque_limit;
    uint8_t _p_gain;
    uint8_t _i_gain;
    uint8_t _d_gain;
    uint16_t _speed_limit;
    uint8_t _accel_limit;
    float _last_good_rad = 0.0f;
    int _last_target_pos = STS3215_CENTER_POS;
    uint16_t _read_error_count = 0;

    void _applyPidAndTorque() {
      _driver->writeByte(_id, STS3215_REG_P, _p_gain);
      _driver->writeByte(_id, STS3215_REG_I, _i_gain);
      _driver->writeByte(_id, STS3215_REG_D, _d_gain);
      _driver->writeWord(_id, 48, _torque_limit);
    }

  public:
    ServoJoint(SMS_STS* driver, int id, int center_pos, int torque_limit,
               uint8_t p_gain = STS3215_DEFAULT_P,
               uint8_t i_gain = STS3215_DEFAULT_I,
               uint8_t d_gain = STS3215_DEFAULT_D,
               uint16_t speed_limit = 600,
               uint8_t accel_limit = 20) {
      _driver = driver;
      _id = id;
      _center_offset = center_pos;
      _torque_limit = torque_limit;
      _p_gain = p_gain;
      _i_gain = i_gain;
      _d_gain = d_gain;
      _speed_limit = speed_limit;
      _accel_limit = accel_limit;
      _last_target_pos = center_pos;

      _applyPidAndTorque();
    }

    ~ServoJoint() override {
      _driver->EnableTorque(_id, 0);
    }

    void stageTarget(float angle_radians) {
      int target_pos = _center_offset + (int)(angle_radians * STS3215_STEPS_PER_RAD);
      
      if (target_pos < STS3215_POS_MIN) target_pos = STS3215_POS_MIN;
      if (target_pos > STS3215_POS_MAX) target_pos = STS3215_POS_MAX;
      
      _last_target_pos = target_pos;
    }

    void setTarget(float angle_radians) override {
      stageTarget(angle_radians);
      _driver->RegWritePosEx(_id, _last_target_pos, 0, 0); 
    }

    void update() override {
    }

    void enable(bool state) override {
        if(state) {
            _driver->EnableTorque(_id, 1);
            // Re-apply PID gains and torque limit when enabling
            _applyPidAndTorque();
        } else {
            _driver->EnableTorque(_id, 0);
        }
    }

    float readPosition() override {
      int raw_pos = _driver->ReadPos(_id);
      if (raw_pos < 0) {
        _read_error_count++;
        return _last_good_rad; // Hold last known good position on read failure
      }
      _read_error_count = 0;
      _last_good_rad = (float)(raw_pos - _center_offset) / STS3215_STEPS_PER_RAD;
      return _last_good_rad;
    }

    float readLoad() override {
      int raw_load = _driver->ReadLoad(_id);
      return (float)raw_load;
    }

    uint16_t getReadErrorCount() const { return _read_error_count; }
    int getId() const { return _id; }
    int getLastTargetPos() const { return _last_target_pos; }
    uint16_t getSpeedLimit() const { return _speed_limit; }
    uint8_t getAccelLimit() const { return _accel_limit; }
};

#endif
