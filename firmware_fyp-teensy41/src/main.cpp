#include <Arduino.h>
#include <micro_ros_platformio.h>
#include <rcl/rcl.h>
#include <rclc/rclc.h>
#include <rclc/executor.h>
#include <std_msgs/msg/float32_multi_array.h>
#include <std_msgs/msg/string.h>
#include <ArduinoJson.h>
#include <ctype.h>
#include <string.h>
#include <math.h>
#include <new>
#include <utility>
#include <atomic>

#include "hardware_interface.h"

// --- CONFIG ---
constexpr int STATUS_LED_PIN = 13;  // Teensy 4.1 built-in LED
constexpr size_t MAX_JOINTS = 10;
constexpr size_t DEFAULT_JOINT_COUNT = 6;
constexpr size_t MAX_JOINT_NAME_LENGTH = 32;
constexpr size_t CONFIG_BUFFER_SIZE = 4096;
constexpr uint32_t COMMAND_APPLY_INTERVAL_MS = 20;
constexpr uint32_t FEEDBACK_INTERVAL_MS = 25;
constexpr uint32_t COMMAND_STALE_TIMEOUT_MS = 2000;
constexpr int SERVO_ID_MIN = 1;
constexpr int SERVO_ID_MAX = 253;
constexpr int PWM_MIN_US_LIMIT = 300;
constexpr int PWM_MAX_US_LIMIT = 3000;

// --- GLOBAL VARIABLES ---
SMS_STS st;
Joint* robot_joints[MAX_JOINTS] = {nullptr};
// NOTE: new_data_available must be std::atomic because micro-ROS callbacks
// run on the same thread as loop() via rclc_executor_spin_some, but the
// variables are written in ISR context (serial receive) and read in main loop.
// Using atomic ensures memory ordering is correct.
std::atomic<bool> new_data_available(false);
bool has_received_joint_command = false;
bool command_stream_stale = false;
bool is_synced = false;
uint32_t last_command_rx_ms = 0;
constexpr float SYNC_TOLERANCE_RAD = 0.15f; // ~8.5 degrees
constexpr uint8_t JOINT_BANK_COUNT = 2;
size_t active_joint_count = DEFAULT_JOINT_COUNT;

enum class JointKind : uint8_t {
  None = 0,
  Stepper,
  Servo,
  Pwm,
};

// Showcase Version: Static Joint definition instead of placement new dynamic allocator
JointKind robot_joint_kinds[MAX_JOINTS] = {JointKind::None};

// --- ROS VARIABLES ---
rcl_subscription_t subscriber;
rcl_subscription_t config_subscriber;
rcl_publisher_t feedback_publisher;
rcl_publisher_t load_publisher;
rcl_publisher_t pid_response_publisher;
rcl_publisher_t config_status_publisher;
rclc_executor_t executor;
rcl_allocator_t allocator;
rcl_node_t node;
rclc_support_t support;

// --- STATE MACHINE ---
enum class RosState {
  WAITING_AGENT,
  AGENT_AVAILABLE,
  AGENT_CONNECTED,
  AGENT_DISCONNECTED
};
RosState current_state = RosState::WAITING_AGENT;

std_msgs__msg__Float32MultiArray msg;
std_msgs__msg__String config_msg;
std_msgs__msg__String config_status_msg;
std_msgs__msg__Float32MultiArray feedback_msg;
std_msgs__msg__Float32MultiArray load_msg;
std_msgs__msg__Float32MultiArray pid_response_msg;
JsonDocument config_doc;

char config_buffer[CONFIG_BUFFER_SIZE];
char config_status_buffer[192];

float joint_data_buffer[MAX_JOINTS] = {0};
float feedback_data_buffer[MAX_JOINTS + 1] = {0};
float load_data_buffer[MAX_JOINTS] = {0};
float pid_response_buffer[MAX_JOINTS * 2] = {0}; // [target0, actual0, target1, actual1, ...]
float last_target_radians[MAX_JOINTS] = {0};
float joint_command_bias_radians[MAX_JOINTS] = {0};
float active_tcp_offset[3] = {0};
uint8_t servo_sync_ids[MAX_JOINTS] = {0};
s16 servo_sync_positions[MAX_JOINTS] = {0};
u16 servo_sync_speeds[MAX_JOINTS] = {0};
u8 servo_sync_acc[MAX_JOINTS] = {0};

const char* kDefaultJointNames[DEFAULT_JOINT_COUNT] = {
  "Rotation",
  "Pitch",
  "Elbow",
  "Wrist_Pitch",
  "Wrist_Roll",
  "Jaw"
};

char joint_name_storage[MAX_JOINTS][MAX_JOINT_NAME_LENGTH] = {};
const char* active_joint_names[MAX_JOINTS] = {};

void stage_default_joint_names(
    char staged_names[MAX_JOINTS][MAX_JOINT_NAME_LENGTH],
    size_t& staged_count) {
  staged_count = DEFAULT_JOINT_COUNT;
  for (size_t i = 0; i < MAX_JOINTS; i++) {
    staged_names[i][0] = '\0';
  }
  for (size_t i = 0; i < DEFAULT_JOINT_COUNT; i++) {
    strlcpy(staged_names[i], kDefaultJointNames[i], MAX_JOINT_NAME_LENGTH);
  }
}

void build_joint_name_pointer_array(
    char staged_names[MAX_JOINTS][MAX_JOINT_NAME_LENGTH],
    const char* staged_joint_names[MAX_JOINTS]) {
  for (size_t i = 0; i < MAX_JOINTS; i++) {
    staged_joint_names[i] = staged_names[i];
  }
}

bool string_contains_ignore_case(const char* haystack, const char* needle) {
  if (haystack == nullptr || needle == nullptr || needle[0] == '\0') {
    return false;
  }

  const size_t needle_length = strlen(needle);
  for (size_t start = 0; haystack[start] != '\0'; start++) {
    size_t offset = 0;
    while (offset < needle_length && haystack[start + offset] != '\0') {
      const char lhs = static_cast<char>(
          tolower(static_cast<unsigned char>(haystack[start + offset])));
      const char rhs = static_cast<char>(
          tolower(static_cast<unsigned char>(needle[offset])));
      if (lhs != rhs) {
        break;
      }
      offset++;
    }

    if (offset == needle_length) {
      return true;
    }
  }

  return false;
}

bool is_gripper_joint_name(const char* joint_name) {
  return string_contains_ignore_case(joint_name, "jaw") ||
         string_contains_ignore_case(joint_name, "gripper");
}

float infer_default_command_bias_radians(const char* joint_name) {
  if (joint_name == nullptr) {
    return 0.0f;
  }

  if (string_contains_ignore_case(joint_name, "shoulder") ||
      string_contains_ignore_case(joint_name, "pitch") ||
      string_contains_ignore_case(joint_name, "elbow")) {
    return PI / 180.0f;
  }

  return 0.0f;
}

void update_joint_message_sizes() {
  feedback_msg.data.size = active_joint_count;
  pid_response_msg.data.size = active_joint_count * 2;
}

void reset_joint_runtime_metadata() {
  active_joint_count = DEFAULT_JOINT_COUNT;
  memset(joint_command_bias_radians, 0, sizeof(joint_command_bias_radians));
  active_tcp_offset[0] = 0.0f;
  active_tcp_offset[1] = 0.0f;
  active_tcp_offset[2] = 0.0f;

  for (size_t i = 0; i < MAX_JOINTS; i++) {
    joint_name_storage[i][0] = '\0';
    active_joint_names[i] = joint_name_storage[i];
  }

  for (size_t i = 0; i < DEFAULT_JOINT_COUNT; i++) {
    strlcpy(
        joint_name_storage[i],
        kDefaultJointNames[i],
        sizeof(joint_name_storage[i]));
  }
}

int joint_index_from_name(
    const char* joint_name,
    const char* const joint_names[] = active_joint_names,
    size_t joint_count = active_joint_count) {
  if (joint_name == nullptr) {
    return -1;
  }

  for (size_t i = 0; i < joint_count; i++) {
    if (joint_names[i] != nullptr && strcmp(joint_name, joint_names[i]) == 0) {
      return static_cast<int>(i);
    }
  }

  return -1;
}

bool validate_joint_order(
    JsonVariantConst joint_order_variant,
    char staged_names[MAX_JOINTS][MAX_JOINT_NAME_LENGTH],
    size_t& staged_count) {
  if (!joint_order_variant.is<JsonArrayConst>()) {
    Serial.println("[config] jointOrder must be an array");
    return false;
  }

  JsonArrayConst joint_order = joint_order_variant.as<JsonArrayConst>();
  if (joint_order.size() == 0 || joint_order.size() > MAX_JOINTS) {
    Serial.printf(
        "[config] jointOrder size mismatch: got %u, allowed 1..%u\n",
        static_cast<unsigned>(joint_order.size()),
        static_cast<unsigned>(MAX_JOINTS));
    return false;
  }

  staged_count = joint_order.size();
  for (size_t i = 0; i < MAX_JOINTS; i++) {
    staged_names[i][0] = '\0';
  }

  for (size_t i = 0; i < staged_count; i++) {
    JsonVariantConst entry = joint_order[i];
    if (!entry.is<const char*>()) {
      Serial.printf(
          "[config] jointOrder[%u] is not a string\n",
          static_cast<unsigned>(i));
      return false;
    }

    const char* joint_name = entry.as<const char*>();
    if (joint_name == nullptr || joint_name[0] == '\0') {
      Serial.printf(
          "[config] jointOrder[%u] is empty\n",
          static_cast<unsigned>(i));
      return false;
    }

    if (strlen(joint_name) >= MAX_JOINT_NAME_LENGTH) {
      Serial.printf(
          "[config] jointOrder[%u] exceeds %u chars\n",
          static_cast<unsigned>(i),
          static_cast<unsigned>(MAX_JOINT_NAME_LENGTH - 1));
      return false;
    }

    for (size_t previous = 0; previous < i; previous++) {
      if (strcmp(joint_name, staged_names[previous]) == 0) {
        Serial.printf(
            "[config] jointOrder contains duplicate joint name \"%s\"\n",
            joint_name);
        return false;
      }
    }

    strlcpy(staged_names[i], joint_name, MAX_JOINT_NAME_LENGTH);
  }

  return true;
}

bool json_key_present(JsonObjectConst object, const char* key) {
  return !object[key].isUnbound();
}

bool json_is_number(JsonVariantConst value) {
  return value.is<int>() || value.is<unsigned int>() || value.is<long>() ||
         value.is<unsigned long>() || value.is<float>() || value.is<double>();
}

bool json_is_integer(JsonVariantConst value) {
  if (!json_is_number(value)) {
    return false;
  }
  const double raw = value.as<double>();
  if (!isfinite(raw)) {
    return false;
  }
  const double truncated = static_cast<double>(static_cast<int>(raw));
  return fabs(raw - truncated) < 1e-6;
}

bool json_to_int(JsonVariantConst value, int& out) {
  if (!json_is_integer(value)) {
    return false;
  }
  out = static_cast<int>(value.as<double>());
  return true;
}

bool parse_tcp_offset(
    JsonVariantConst tcp_offset_variant,
    float tcp_offset_out[3]) {
  tcp_offset_out[0] = 0.0f;
  tcp_offset_out[1] = 0.0f;
  tcp_offset_out[2] = 0.0f;

  if (tcp_offset_variant.isUnbound() || tcp_offset_variant.isNull()) {
    return true;
  }

  if (!tcp_offset_variant.is<JsonArrayConst>()) {
    Serial.println("[config] tcpOffset must be an array of 3 numbers");
    return false;
  }

  JsonArrayConst tcp_offset = tcp_offset_variant.as<JsonArrayConst>();
  if (tcp_offset.size() != 3) {
    Serial.printf(
        "[config] tcpOffset size mismatch: got %u, expected 3\n",
        static_cast<unsigned>(tcp_offset.size()));
    return false;
  }

  for (size_t i = 0; i < 3; i++) {
    JsonVariantConst component = tcp_offset[i];
    if (!json_is_number(component)) {
      Serial.printf(
          "[config] tcpOffset[%u] is not numeric\n",
          static_cast<unsigned>(i));
      return false;
    }

    const float value = component.as<float>();
    if (!isfinite(value)) {
      Serial.printf(
          "[config] tcpOffset[%u] is not finite\n",
          static_cast<unsigned>(i));
      return false;
    }

    tcp_offset_out[i] = value;
  }

  return true;
}

bool is_valid_pin_number(int pin) {
  return pin >= 0 && pin < static_cast<int>(NUM_DIGITAL_PINS);
}

bool claim_pin_or_fail(
    int pin,
    int owner_joint_index,
    const char* field_name,
    int pin_owner[],
    const char* const joint_names[]) {
  if (!is_valid_pin_number(pin)) {
    Serial.printf(
        "[config] Joint %s has out-of-range %s=%d (valid 0..%d)\n",
        joint_names[owner_joint_index], field_name, pin, NUM_DIGITAL_PINS - 1);
    return false;
  }

  const int previous_owner = pin_owner[pin];
  if (previous_owner >= 0 && previous_owner != owner_joint_index) {
    Serial.printf(
        "[config] Pin %d conflict: %s (%s) collides with %s\n",
        pin, joint_names[owner_joint_index], field_name,
        joint_names[previous_owner]);
    return false;
  }

  pin_owner[pin] = owner_joint_index;
  return true;
}

bool is_allowed_common_key(const char* key) {
  return strcmp(key, "hardwareType") == 0 ||
         strcmp(key, "hardwareId") == 0 ||
         strcmp(key, "commandBiasDeg") == 0;
}

bool is_allowed_key_for_type(const char* type, const char* key) {
  if (is_allowed_common_key(key)) {
    return true;
  }

  if (strcmp(type, "sts3215") == 0) {
    return strcmp(key, "torqueLimit") == 0;
  }

  if (strcmp(type, "nema17") == 0 || strcmp(type, "nema23") == 0 ||
      strcmp(type, "nema34") == 0) {
    return strcmp(key, "stepPin") == 0 || strcmp(key, "dirPin") == 0 ||
           strcmp(key, "enablePin") == 0 || strcmp(key, "stepsPerRev") == 0 ||
           strcmp(key, "microsteps") == 0 || strcmp(key, "gearRatio") == 0;
  }

  if (strcmp(type, "pwm") == 0) {
    return strcmp(key, "pwmPin") == 0 || strcmp(key, "pwmMin") == 0 ||
           strcmp(key, "pwmMax") == 0;
  }

  return false;
}

bool validate_actuator_schema(
    const char* joint_name, int joint_index, JsonObjectConst actuator) {
  JsonVariantConst type_variant = actuator["hardwareType"];
  if (type_variant.isUnbound() || !type_variant.is<const char*>()) {
    Serial.printf("[config] Joint %s missing or invalid hardwareType\n",
                  joint_name);
    return false;
  }

  const char* type = type_variant.as<const char*>();
  if (type == nullptr || type[0] == '\0') {
    Serial.printf("[config] Joint %s has empty hardwareType\n", joint_name);
    return false;
  }

  if (strcmp(type, "sts3215") != 0 && strcmp(type, "nema17") != 0 &&
      strcmp(type, "nema23") != 0 && strcmp(type, "nema34") != 0 &&
      strcmp(type, "pwm") != 0) {
    Serial.printf("[config] Unsupported hardwareType \"%s\" for joint %s\n",
                  type, joint_name);
    return false;
  }

  for (JsonPairConst kv : actuator) {
    const char* key = kv.key().c_str();
    if (!is_allowed_key_for_type(type, key)) {
      Serial.printf(
          "[config] Unknown key \"%s\" for joint %s (%s)\n", key, joint_name,
          type);
      return false;
    }
  }

  JsonVariantConst hardware_id = actuator["hardwareId"];
  int hardware_id_value = 0;
  if (hardware_id.isUnbound() || !json_to_int(hardware_id, hardware_id_value)) {
    Serial.printf("[config] Joint %s missing integer hardwareId\n", joint_name);
    return false;
  }
  if (hardware_id_value < 0) {
    Serial.printf("[config] Joint %s has negative hardwareId\n", joint_name);
    return false;
  }

  JsonVariantConst command_bias = actuator["commandBiasDeg"];
  if (!command_bias.isUnbound() && !json_is_number(command_bias)) {
    Serial.printf("[config] Joint %s has invalid commandBiasDeg\n", joint_name);
    return false;
  }

  if (strcmp(type, "sts3215") == 0) {
    if (hardware_id_value < SERVO_ID_MIN || hardware_id_value > SERVO_ID_MAX) {
      Serial.printf(
          "[config] Joint %s has out-of-range servo hardwareId=%d (valid %d..%d)\n",
          joint_name, hardware_id_value, SERVO_ID_MIN, SERVO_ID_MAX);
      return false;
    }

    JsonVariantConst torque_limit = actuator["torqueLimit"];
    if (!torque_limit.isUnbound()) {
      int torque_limit_value = 0;
      if (!json_to_int(torque_limit, torque_limit_value)) {
        Serial.printf("[config] Joint %s has invalid torqueLimit\n", joint_name);
        return false;
      }
      if (torque_limit_value < 0 || torque_limit_value > 1000) {
        Serial.printf(
            "[config] Joint %s torqueLimit=%d out of range (0..1000)\n",
            joint_name, torque_limit_value);
        return false;
      }
    }
    return true;
  }

  if (strcmp(type, "nema17") == 0 || strcmp(type, "nema23") == 0 ||
      strcmp(type, "nema34") == 0) {
    JsonVariantConst steps_per_rev = actuator["stepsPerRev"];
    JsonVariantConst microsteps = actuator["microsteps"];
    JsonVariantConst gear_ratio = actuator["gearRatio"];

    if (steps_per_rev.isUnbound() || microsteps.isUnbound() ||
        gear_ratio.isUnbound()) {
      Serial.printf(
          "[config] Joint %s missing required stepper kinematic keys\n",
          joint_name);
      return false;
    }

    if (!json_is_number(steps_per_rev) || !json_is_number(microsteps) ||
        !json_is_number(gear_ratio)) {
      Serial.printf("[config] Joint %s has non-numeric stepper fields\n",
                    joint_name);
      return false;
    }
    if (steps_per_rev.as<float>() <= 0.0f || gear_ratio.as<float>() <= 0.0f) {
      Serial.printf("[config] Joint %s has non-positive stepper fields\n",
                    joint_name);
      return false;
    }
    int microsteps_value = 0;
    if (!json_to_int(microsteps, microsteps_value) || microsteps_value <= 0) {
      Serial.printf("[config] Joint %s has invalid microsteps\n", joint_name);
      return false;
    }

    const bool has_step_pin = json_key_present(actuator, "stepPin");
    const bool has_dir_pin = json_key_present(actuator, "dirPin");
    if (has_step_pin != has_dir_pin) {
      Serial.printf("[config] Joint %s must provide both stepPin and dirPin\n",
                    joint_name);
      return false;
    }

    if (!has_step_pin && joint_index != 0 && joint_index != 1) {
      Serial.printf(
          "[config] Joint %s requires explicit stepPin and dirPin\n",
          joint_name);
      return false;
    }

    int step_pin_value = -1;
    int dir_pin_value = -1;
    if (has_step_pin && !json_to_int(actuator["stepPin"], step_pin_value)) {
      Serial.printf("[config] Joint %s has invalid integer stepPin\n", joint_name);
      return false;
    }
    if (has_dir_pin && !json_to_int(actuator["dirPin"], dir_pin_value)) {
      Serial.printf("[config] Joint %s has invalid integer dirPin\n", joint_name);
      return false;
    }
    if (has_step_pin && has_dir_pin && step_pin_value == dir_pin_value) {
      Serial.printf("[config] Joint %s uses same pin for stepPin and dirPin\n",
                    joint_name);
      return false;
    }

    JsonVariantConst enable_pin = actuator["enablePin"];
    if (!enable_pin.isUnbound()) {
      int enable_pin_value = -1;
      if (!json_to_int(enable_pin, enable_pin_value)) {
        Serial.printf("[config] Joint %s has invalid integer enablePin\n", joint_name);
        return false;
      }
      if (enable_pin_value == step_pin_value || enable_pin_value == dir_pin_value) {
        Serial.printf("[config] Joint %s enablePin conflicts with step/dir pins\n",
                      joint_name);
        return false;
      }
    }

    return true;
  }

  JsonVariantConst pwm_pin = actuator["pwmPin"];
  JsonVariantConst pwm_min = actuator["pwmMin"];
  JsonVariantConst pwm_max = actuator["pwmMax"];
  if (pwm_pin.isUnbound() || pwm_min.isUnbound() || pwm_max.isUnbound()) {
    Serial.printf("[config] Joint %s missing required PWM keys\n", joint_name);
    return false;
  }

  int pwm_pin_value = -1;
  int pwm_min_value = 0;
  int pwm_max_value = 0;
  if (!json_to_int(pwm_pin, pwm_pin_value) ||
      !json_to_int(pwm_min, pwm_min_value) ||
      !json_to_int(pwm_max, pwm_max_value)) {
    Serial.printf("[config] Joint %s has invalid integer PWM fields\n", joint_name);
    return false;
  }
  if (pwm_min_value >= pwm_max_value) {
    Serial.printf("[config] Joint %s has invalid PWM range\n", joint_name);
    return false;
  }
  if (pwm_min_value < PWM_MIN_US_LIMIT || pwm_max_value > PWM_MAX_US_LIMIT) {
    Serial.printf(
        "[config] Joint %s PWM range out of safe bounds (%d..%d)\n",
        joint_name, PWM_MIN_US_LIMIT, PWM_MAX_US_LIMIT);
    return false;
  }

  return true;
}

bool publish_ros_message(
    rcl_publisher_t* publisher,
    const void* ros_message,
    const char* topic_name,
    uint32_t* last_error_log_ms = nullptr) {
  if (current_state != RosState::AGENT_CONNECTED) {
    return false;
  }
  
  const rcl_ret_t rc = rcl_publish(publisher, ros_message, NULL);
  if (rc == RCL_RET_OK) {
    return true;
  }

  const uint32_t now_ms = millis();
  if (last_error_log_ms == nullptr || (now_ms - *last_error_log_ms) >= 1000) {
    Serial.printf("[ros] Publish failed on %s (rc=%d)\n", topic_name, static_cast<int>(rc));
    if (last_error_log_ms != nullptr) {
      *last_error_log_ms = now_ms;
    }
  }

  return false;
}

void publish_config_status(const char* status) {
  if (status == nullptr) return;
  const size_t max_len = sizeof(config_status_buffer) - 1;
  const size_t len = strnlen(status, max_len);
  memcpy(config_status_buffer, status, len);
  config_status_buffer[len] = '\0';
  config_status_msg.data.size = len;
  publish_ros_message(
      &config_status_publisher, &config_status_msg, "fyp2/config_status");
}

constexpr uint32_t BUS_SETTLE_MS = 3; // RS-485 half-duplex bus settle time

void enable_all_joints(bool enabled) {
  for (size_t i = 0; i < active_joint_count; i++) {
    if (robot_joints[i] != nullptr) {
      robot_joints[i]->enable(enabled);
      delay(BUS_SETTLE_MS);
    }
  }
}

void setup_robot_hardware() {
  reset_joint_runtime_metadata();
  Serial1.begin(1000000);
  st.pSerial = &Serial1;

  // Showcase Version: Static Joint definition instead of placement new dynamic allocator
  static ServoJoint j1(&st, 1, 2048, 1000);
  static ServoJoint j2(&st, 2, 2048, 1000);
  static ServoJoint j3(&st, 3, 2048, 1000);
  static ServoJoint j4(&st, 4, 2048, 1000);
  static ServoJoint j5(&st, 5, 2048, 1000);
  static ServoJoint j6(&st, 6, 2048, 500); // Gripper

  robot_joints[0] = &j1;
  robot_joints[1] = &j2;
  robot_joints[2] = &j3;
  robot_joints[3] = &j4;
  robot_joints[4] = &j5;
  robot_joints[5] = &j6;

  for (size_t i = 0; i < 6; i++) {
    robot_joint_kinds[i] = JointKind::Servo;
  }

  active_joint_count = 6;
  enable_all_joints(false);  // Stay floppy until dashboard syncs
}

// Showcase Version: Removed dynamic allocator helpers for IP protection

void apply_joint_targets(const float source_radians[MAX_JOINTS], bool apply_bias) {
  size_t servo_count = 0;

  for (size_t i = 0; i < active_joint_count; i++) {
    Joint* joint = robot_joints[i];
    if (joint == nullptr) {
      continue;
    }

    float target = source_radians[i];
    if (apply_bias) {
      target += joint_command_bias_radians[i];
    }

    last_target_radians[i] = target;
    if (robot_joint_kinds[i] == JointKind::Servo) {
      ServoJoint* servo = static_cast<ServoJoint*>(robot_joints[i]);
      servo->stageTarget(target);
      servo_sync_ids[servo_count] = static_cast<uint8_t>(servo->getId());
      servo_sync_positions[servo_count] =
          static_cast<s16>(servo->getLastTargetPos());
      servo_sync_speeds[servo_count] = servo->getSpeedLimit();
      servo_sync_acc[servo_count] = servo->getAccelLimit();
      servo_count++;
    } else {
      joint->setTarget(target);
    }
  }

  if (servo_count > 0) {
    st.SyncWritePosEx(
        servo_sync_ids,
        static_cast<u8>(servo_count),
        servo_sync_positions,
        servo_sync_speeds,
        servo_sync_acc);
    delayMicroseconds(300);
    // Ensure bus has settled before any read cycle begins
  }
}

void config_callback(const void * msglin) {
  const std_msgs__msg__String * incoming = (const std_msgs__msg__String *)msglin;
  if (incoming == nullptr || incoming->data.data == nullptr || incoming->data.size == 0) {
    Serial.println("[config] Ignored empty configuration payload");
    publish_config_status("error: empty configuration payload");
    return;
  }

  if (incoming->data.size >= CONFIG_BUFFER_SIZE) {
    Serial.printf("[config] Payload too large: %u bytes (max %u)\n",
                  static_cast<unsigned>(incoming->data.size),
                  static_cast<unsigned>(CONFIG_BUFFER_SIZE - 1));
    publish_config_status("error: configuration payload too large");
    return;
  }

  // Showcase Version: Configuration is statically locked for security and patent IP protection.
  // We parse the JSON to validate it, but do not reconstruct hardware classes.
  config_doc.clear();
  DeserializationError error =
      deserializeJson(config_doc, incoming->data.data, incoming->data.size);

  if (error) {
    Serial.printf("[config] JSON parse error: %s\n", error.c_str());
    publish_config_status("error: invalid JSON payload");
    return;
  }

  if (!config_doc["actuators"].is<JsonObjectConst>()) {
    Serial.println("[config] Missing or invalid \"actuators\" object");
    publish_config_status("error: missing or invalid actuators object");
    return;
  }

  // Setup the showcase status metadata
  for (size_t i = 0; i < MAX_JOINTS; i++) {
    joint_data_buffer[i] = 0.0f;
    feedback_data_buffer[i] = 0.0f;
    load_data_buffer[i] = 0.0f;
    last_target_radians[i] = 0.0f;
    pid_response_buffer[i * 2] = 0.0f;
    pid_response_buffer[i * 2 + 1] = 0.0f;
  }

  // Read current positions
  for (size_t i = 0; i < active_joint_count; i++) {
    if (robot_joints[i] == nullptr) continue;
    float position = robot_joints[i]->readPosition();
    if (!isfinite(position)) position = 0.0f;

    joint_data_buffer[i] = position;
    feedback_data_buffer[i] = position;
    last_target_radians[i] = position;
    pid_response_buffer[i * 2] = position;
    pid_response_buffer[i * 2 + 1] = position;
  }

  update_joint_message_sizes();

  is_synced = false;
  new_data_available.store(false, std::memory_order_release);
  has_received_joint_command = false;
  command_stream_stale = false;
  enable_all_joints(false); // Stay floppy until dashboard re-syncs

  Serial.println("[config] Applied showcase static configuration");
  publish_config_status("ok: hardware configuration applied");
}

void subscription_callback(const void * msgin) {
  const std_msgs__msg__Float32MultiArray * incoming =
      (const std_msgs__msg__Float32MultiArray *)msgin;

  if (incoming == nullptr || incoming->data.size < active_joint_count) {
    return;
  }

  // Data is already in joint_data_buffer because we linked it in setup().
  last_command_rx_ms = millis();
  has_received_joint_command = true;
  new_data_available.store(true, std::memory_order_release);
}

// --- LED HEARTBEAT ---
// Provides visual firmware state via the built-in LED (pin 13).
// Pattern encodes the current ROS connection state so you can tell
// at a glance whether the Teensy is alive and what it's doing.
void update_heartbeat_led() {
  const uint32_t t = millis();
  bool led_on = false;

  switch (current_state) {
    case RosState::WAITING_AGENT: {
      // Slow pulse: 1 Hz (500ms on / 500ms off)
      led_on = (t % 1000) < 500;
      break;
    }
    case RosState::AGENT_AVAILABLE: {
      // Quick double-blink every second
      const uint32_t phase = t % 1000;
      led_on = (phase < 100) || (phase > 200 && phase < 300);
      break;
    }
    case RosState::AGENT_CONNECTED: {
      if (is_synced && !command_stream_stale) {
        // Heartbeat: solid ON with a brief off-pulse every 2s
        led_on = (t % 2000) > 50;
      } else {
        // Fast blink ~4 Hz: connected but waiting for dashboard sync
        led_on = (t % 250) < 125;
      }
      break;
    }
    case RosState::AGENT_DISCONNECTED: {
      // Rapid triple-flash burst every 600ms
      const uint32_t phase = t % 600;
      led_on = (phase < 60) || (phase > 120 && phase < 180) ||
               (phase > 240 && phase < 300);
      break;
    }
  }

  digitalWriteFast(STATUS_LED_PIN, led_on ? HIGH : LOW);
}

void setup() {
  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWriteFast(STATUS_LED_PIN, HIGH);  // LED on during init

  setup_robot_hardware();

  // Pre-read actual positions so targets match physical state
  for (size_t i = 0; i < active_joint_count; i++) {
    if (robot_joints[i] != nullptr) {
      float pos = robot_joints[i]->readPosition();
      if (isfinite(pos)) {
        last_target_radians[i] = pos;
      }
    }
  }

  Serial.begin(921600);
  set_microros_serial_transports(Serial);
  delay(1000);

  Serial.println("========================================");
  Serial.println("  SO-ARM101 Firmware  v1.0");
  Serial.printf( "  CPU: %lu MHz\n", F_CPU / 1000000UL);
  Serial.printf( "  Joints: %u  |  Servo bus: 1 Mbps\n",
                 static_cast<unsigned>(active_joint_count));
  Serial.println("========================================");
  Serial.println("[safety] Torque OFF. Waiting for ROS 2 agent...");
}

bool create_entities() {
  allocator = rcl_get_default_allocator();
  rclc_support_init(&support, 0, NULL, &allocator);
  rclc_node_init_default(&node, "teensy_modular_node", "", &support);

  msg.data.capacity = MAX_JOINTS;
  msg.data.size = 0;
  msg.data.data = joint_data_buffer;

  rcl_ret_t ret = rclc_subscription_init_default(
      &subscriber, &node,
      ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs, msg, Float32MultiArray),
      "joint_commands");
  if (ret != RCL_RET_OK) return false;

  config_msg.data.capacity = CONFIG_BUFFER_SIZE;
  config_msg.data.size = 0;
  config_msg.data.data = config_buffer;

  ret = rclc_subscription_init_default(
      &config_subscriber, &node,
      ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs, msg, String),
      "fyp2/hardware_config");
  if (ret != RCL_RET_OK) return false;

  feedback_msg.data.capacity = MAX_JOINTS + 1;
  feedback_msg.data.size = active_joint_count + 1;
  feedback_msg.data.data = feedback_data_buffer;

  ret = rclc_publisher_init_best_effort(
      &feedback_publisher, &node,
      ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs, msg, Float32MultiArray),
      "servo_feedback");
  if (ret != RCL_RET_OK) return false;

  load_msg.data.capacity = MAX_JOINTS;
  load_msg.data.size = active_joint_count;
  load_msg.data.data = load_data_buffer;

  ret = rclc_publisher_init_best_effort(
      &load_publisher, &node,
      ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs, msg, Float32MultiArray),
      "servo_load");
  if (ret != RCL_RET_OK) return false;

  pid_response_msg.data.capacity = MAX_JOINTS * 2;
  pid_response_msg.data.size = active_joint_count * 2;
  pid_response_msg.data.data = pid_response_buffer;

  ret = rclc_publisher_init_best_effort(
      &pid_response_publisher, &node,
      ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs, msg, Float32MultiArray),
      "pid_response");
  if (ret != RCL_RET_OK) return false;

  config_status_msg.data.capacity = sizeof(config_status_buffer);
  config_status_msg.data.size = 0;
  config_status_msg.data.data = config_status_buffer;

  ret = rclc_publisher_init_best_effort(
      &config_status_publisher, &node,
      ROSIDL_GET_MSG_TYPE_SUPPORT(std_msgs, msg, String),
      "fyp2/config_status");
  if (ret != RCL_RET_OK) return false;

  ret = rclc_executor_init(&executor, &support.context, 2, &allocator);
  if (ret != RCL_RET_OK) return false;

  ret = rclc_executor_add_subscription(
      &executor, &subscriber, &msg, &subscription_callback, ON_NEW_DATA);
  if (ret != RCL_RET_OK) return false;

  ret = rclc_executor_add_subscription(
      &executor, &config_subscriber, &config_msg, &config_callback, ON_NEW_DATA);
  if (ret != RCL_RET_OK) return false;

  return true;
}

void destroy_entities() {
  rmw_context_t * rmw_context = rcl_context_get_rmw_context(&support.context);
  (void) rmw_uros_set_context_entity_destroy_session_timeout(rmw_context, 0);

  const rcl_ret_t feedback_fini_rc = rcl_publisher_fini(&feedback_publisher, &node);
  const rcl_ret_t load_fini_rc = rcl_publisher_fini(&load_publisher, &node);
  const rcl_ret_t pid_response_fini_rc =
      rcl_publisher_fini(&pid_response_publisher, &node);
  const rcl_ret_t config_status_fini_rc =
      rcl_publisher_fini(&config_status_publisher, &node);
  const rcl_ret_t subscriber_fini_rc =
      rcl_subscription_fini(&subscriber, &node);
  const rcl_ret_t config_subscriber_fini_rc =
      rcl_subscription_fini(&config_subscriber, &node);
  const rcl_ret_t executor_fini_rc = rclc_executor_fini(&executor);
  const rcl_ret_t node_fini_rc = rcl_node_fini(&node);
  const rcl_ret_t support_fini_rc = rclc_support_fini(&support);

  (void)feedback_fini_rc;
  (void)load_fini_rc;
  (void)pid_response_fini_rc;
  (void)config_status_fini_rc;
  (void)subscriber_fini_rc;
  (void)config_subscriber_fini_rc;
  (void)executor_fini_rc;
  (void)node_fini_rc;
  (void)support_fini_rc;
}

void loop() {
  switch (current_state) {
    case RosState::WAITING_AGENT:
      // Joints already disabled on entry (by AGENT_DISCONNECTED or setup).
      // Removed redundant enable_all_joints(false) that was sending 6x
      // torque-disable commands with 3ms delays every loop iteration.
      if (rmw_uros_ping_agent(100, 1) == RMW_RET_OK) {
        current_state = RosState::AGENT_AVAILABLE;
      }
      break;

    case RosState::AGENT_AVAILABLE:
      if (create_entities()) {
        current_state = RosState::AGENT_CONNECTED;
        publish_config_status("ok: firmware connected (default profile)");
      } else {
        destroy_entities();
        current_state = RosState::WAITING_AGENT;
      }
      break;

    case RosState::AGENT_CONNECTED: {
      // Only ping every 500ms instead of every loop() iteration.
      // The original 10ms-timeout ping blocked the main loop on every tick,
      // starving stepper updates and adding ~10ms latency per cycle.
      static uint32_t last_ping_ms = 0;
      const uint32_t now_ping = millis();
      const uint32_t ping_period = is_synced ? 2000 : 500;
      if (now_ping - last_ping_ms >= ping_period) {
        last_ping_ms = now_ping;
        if (rmw_uros_ping_agent(5, 1) != RMW_RET_OK) {
          current_state = RosState::AGENT_DISCONNECTED;
          break;
        }
      }
      // Keep spin non-blocking so stepper updates remain responsive.
      rclc_executor_spin_some(&executor, 0);
      break;
    }

    case RosState::AGENT_DISCONNECTED:
      enable_all_joints(false);  // Disable once on disconnect
      is_synced = false;
      destroy_entities();
      current_state = RosState::WAITING_AGENT;
      break;
  }

  if (current_state == RosState::AGENT_CONNECTED) {
    if (has_received_joint_command) {
      const bool stale_now =
          (millis() - last_command_rx_ms) > COMMAND_STALE_TIMEOUT_MS;
      if (stale_now && !command_stream_stale) {
        command_stream_stale = true;
        new_data_available.store(false, std::memory_order_release);
        float hold_positions[MAX_JOINTS] = {0};
        for (size_t i = 0; i < active_joint_count; i++) {
          if (robot_joints[i] == nullptr) {
            hold_positions[i] = last_target_radians[i];
            continue;
          }
          float hold_position = robot_joints[i]->readPosition();
          if (!isfinite(hold_position)) {
            hold_position = last_target_radians[i];
          }
          hold_positions[i] = hold_position;
        }
        apply_joint_targets(hold_positions, false);
        enable_all_joints(false);
        is_synced = false;
        Serial.printf(
            "[safety] joint_commands stale for >%lums, joints disabled\n",
            static_cast<unsigned long>(COMMAND_STALE_TIMEOUT_MS));
      } else if (!stale_now && command_stream_stale) {
        command_stream_stale = false;
        // Don't re-enable yet - require re-sync.
        Serial.println("[safety] joint_commands stream restored, waiting for re-sync...");
      }
    }
  }

  // --- Sync Gate: enable torque on first received command ---
  // Dashboard-side sync ensures sliders match physical arm before publishing.
  if (!is_synced && new_data_available.load(std::memory_order_acquire) && !command_stream_stale) {
    is_synced = true;
    enable_all_joints(true);
    Serial.println("[safety] First command received - torque enabled");
  }

  // --- Alternating bus access: never read and write in the same cycle ---
  // The STS3215 uses half-duplex RS-485. Reading position and writing commands
  // in the same loop iteration causes bus collisions - garbled packets that the
  // servo can interpret as wild position commands, causing "random drop" issues.
  static uint32_t last_update_ms = 0;
  static uint32_t last_feedback_ms = 0;
  static uint32_t feedback_publish_error_ms = 0;
  static uint32_t pid_publish_error_ms = 0;
  static size_t feedback_read_index = 0;  // Read one servo at a time

  const uint32_t now_loop_ms = millis();
  const bool command_due = is_synced &&
      !command_stream_stale &&
      new_data_available.load(std::memory_order_acquire) &&
      (now_loop_ms - last_update_ms >= COMMAND_APPLY_INTERVAL_MS);

  if (command_due) {
    // WRITE cycle: send position commands to all servos via SyncWrite.
    // No reads happen during this cycle.
    apply_joint_targets(joint_data_buffer, true);
    new_data_available.store(false, std::memory_order_release);
    last_update_ms = now_loop_ms;
  } else if (current_state == RosState::AGENT_CONNECTED &&
             (now_loop_ms - last_feedback_ms >= FEEDBACK_INTERVAL_MS)) {
    // READ cycle: read position from ONE servo per cycle to keep bus window short.
    // This spreads the servo reads across consecutive feedback intervals
    // instead of blocking the bus for all servos at once.
    update_joint_message_sizes();

    if (feedback_read_index < active_joint_count) {
      const size_t i = feedback_read_index;
      if (robot_joints[i] != nullptr) {
        const float actual = robot_joints[i]->readPosition();
        feedback_data_buffer[i] = actual;
        load_data_buffer[i] = robot_joints[i]->readLoad();
        pid_response_buffer[i * 2] = last_target_radians[i];
        pid_response_buffer[i * 2 + 1] = actual;
      }
      feedback_read_index++;
    }

    // Once all servos have been read, publish the full feedback frame
    if (feedback_read_index >= active_joint_count) {
      feedback_read_index = 0;
      feedback_data_buffer[active_joint_count] = (float)millis(); // Timestamp
      publish_ros_message(
          &feedback_publisher, &feedback_msg, "servo_feedback",
          &feedback_publish_error_ms);
      publish_ros_message(
          &load_publisher, &load_msg, "servo_load",
          &feedback_publish_error_ms);
      publish_ros_message(
          &pid_response_publisher, &pid_response_msg, "pid_response",
          &pid_publish_error_ms);
    }
    last_feedback_ms = now_loop_ms;
  }

  for (size_t i = 0; i < active_joint_count; i++) {
    if (robot_joints[i] != nullptr) {
      robot_joints[i]->update();
    }
  }

  // --- Heartbeat LED ---
  update_heartbeat_led();
}
