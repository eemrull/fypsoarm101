import { RiLink } from "@remixicon/react";
import { useState } from "react";
import { useLocale } from "./LocaleContext";
import {
  useRobotProfileStore,
  type RobotProfileState,
  type ActuatorConfig,
  type ActuatorType,
  type BaseActuatorConfig,
  type StepperConfig,
  type PwmConfig,
} from "../../../../store/useRobotProfileStore";
import { useMotorBus } from "./MotorBusContext";

type MotorDescriptor = {
  name: string;
  newId: number;
  jointIndex: number;
};

const so101Motors: MotorDescriptor[] = [
  { name: "Jaw", newId: 6, jointIndex: 5 },
  { name: "Wrist_Roll", newId: 5, jointIndex: 4 },
  { name: "Wrist_Pitch", newId: 4, jointIndex: 3 },
  { name: "Elbow", newId: 3, jointIndex: 2 },
  { name: "Pitch", newId: 2, jointIndex: 1 },
  { name: "Rotation", newId: 1, jointIndex: 0 },
];

function isStepperConfig(
  config: ActuatorConfig | undefined,
): config is StepperConfig {
  return (
    config?.hardwareType === "nema17" ||
    config?.hardwareType === "nema23" ||
    config?.hardwareType === "nema34"
  );
}

function isPwmConfig(config: ActuatorConfig | undefined): config is PwmConfig {
  return config?.hardwareType === "pwm";
}

function getImplicitStepperPins(
  jointIndex: number,
): { stepPin: number; dirPin: number } | null {
  if (jointIndex === 0) {
    return { stepPin: 2, dirPin: 3 };
  }

  if (jointIndex === 1) {
    return { stepPin: 4, dirPin: 5 };
  }

  return null;
}

function isGripperLikeJointName(jointName: string): boolean {
  const normalized = jointName.trim().toLowerCase();
  return normalized.includes("jaw") || normalized.includes("gripper");
}

export default function ConfigureMotors({
  robotName = "so-arm101",
}: {
  robotName?: string;
}) {
  type StepperHomingMethod = "manual" | "endstop" | "stall";
  const isStepperHomingMethod = (value: string): value is StepperHomingMethod =>
    value === "manual" || value === "endstop" || value === "stall";
  const toErrorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

  const { t } = useLocale();
  const setActuator = useRobotProfileStore(
    (state: RobotProfileState) => state.setActuator,
  );
  const globalActuators = useRobotProfileStore(
    (state: RobotProfileState) => state.actuators,
  );
  const profileJoints = useRobotProfileStore(
    (state: RobotProfileState) => state.joints,
  ) as string[];

  const activeMotors: MotorDescriptor[] =
    robotName === "custom"
      ? profileJoints.map(
          (name: string, i: number): MotorDescriptor => ({
            name,
            newId: i + 1,
            jointIndex: i,
          }),
        )
      : so101Motors;

  const { scsServoSDK, isConnected, connect, disconnect } = useMotorBus();

  const [actuatorType, setActuatorType] = useState<ActuatorType>("sts3215");
  const [selectedMotorName, setSelectedMotorName] = useState<string | null>(
    null,
  );
  const [fromId, setFromId] = useState<number | string>(1);
  const [toId, setToId] = useState<number | string>("");

  // Base Actuator States
  const [invertDirection, setInvertDirection] = useState<boolean>(false);
  const [limitMin, setLimitMin] = useState<number | string>("");
  const [limitMax, setLimitMax] = useState<number | string>("");
  const [sagOffsetDeg, setSagOffsetDeg] = useState<number | string>("");
  const [digitalTwinOffsetDeg, setDigitalTwinOffsetDeg] = useState<number | string>("");

  // Stepper specific states
  const [stepperMicrosteps, setStepperMicrosteps] = useState<number | string>(
    16,
  );
  const [stepperStepsPerRev, setStepperStepsPerRev] = useState<number | string>(
    200,
  );
  const [stepperGearRatio, setStepperGearRatio] = useState<number | string>(1);
  const [stepperStepPin, setStepperStepPin] = useState<number | string>("");
  const [stepperDirPin, setStepperDirPin] = useState<number | string>("");
  const [stepperEnablePin, setStepperEnablePin] = useState<number | string>("");
  const [stepperHoming, setStepperHoming] =
    useState<StepperHomingMethod>("manual");

  // PWM specific states
  const [pwmPin, setPwmPin] = useState<number | string>(10);
  const [pwmMin, setPwmMin] = useState<number | string>(500);
  const [pwmMax, setPwmMax] = useState<number | string>(2500);

  const [scanFromId, setScanFromId] = useState<number | string>(1);
  const [scanToId, setScanToId] = useState<number | string>(10);
  const [foundMotorData, setFoundMotorData] = useState<
    Map<number, number | null>
  >(new Map());
  const [isScanning, setIsScanning] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [statusLevel, setStatusLevel] = useState<"error" | "success" | "info">(
    "info",
  );
  const selectedMotor = activeMotors.find(
    (motor: MotorDescriptor) => motor.name === selectedMotorName,
  );

  const setStatus = (
    level: "error" | "success" | "info",
    message: string,
  ) => {
    setStatusLevel(level);
    setStatusMessage(message);
  };

  const parseNumber = (value: number | string): number | null => {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }
    const trimmed = String(value).trim();
    if (trimmed.length === 0) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const handleConnect = async () => {
    try {
      await connect();
      setStatus("success", "Connected to motor bus.");
    } catch (err: unknown) {
      setStatus("error", `Failed to connect to motor bus: ${toErrorMessage(err)}`);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
      setSelectedMotorName(null);
      setFoundMotorData(new Map());
      setStatus("info", "Disconnected from motor bus.");
    } catch (err: unknown) {
      setStatus(
        "error",
        `Failed to disconnect from motor bus: ${toErrorMessage(err)}`,
      );
    }
  };

  const handleScan = async () => {
    if (!isConnected) {
      setStatus("error", "Please connect to the motor bus first.");
      return;
    }
    setIsScanning(true);
    setFoundMotorData(new Map());
    try {
      const from = Number(scanFromId);
      const to = Number(scanToId);
      if (from > to) {
        setStatus("error", "From ID cannot be greater than To ID.");
        setIsScanning(false);
        return;
      }

      let anyMotorFound = false;
      for (let id = from; id <= to; id++) {
        try {
          const position = await scsServoSDK.readPosition(id);
          setFoundMotorData((prev) => new Map(prev).set(id, position));
          anyMotorFound = true;
        } catch {
          // Motor not found at this ID, continue to the next.
          setFoundMotorData((prev) => new Map(prev).set(id, null));
        }
      }

      if (!anyMotorFound) {
        setStatus("info", "No motors found in the specified range.");
      } else {
        setStatus("success", "Scan completed.");
      }
    } catch (err: unknown) {
      console.error("Failed to scan for motors", err);
      setStatus("error", `Failed to scan for motors: ${toErrorMessage(err)}`);
    } finally {
      setIsScanning(false);
    }
  };

  const handleSelectMotor = (motor: MotorDescriptor) => {
    const existingConfig = globalActuators[motor.name];
    const implicitPins = getImplicitStepperPins(motor.jointIndex);
    const existingHardwareId =
      typeof existingConfig?.hardwareId === "number" ||
      typeof existingConfig?.hardwareId === "string"
        ? existingConfig.hardwareId
        : motor.newId;

    setSelectedMotorName(motor.name);
    setFromId(existingHardwareId);
    setToId(existingHardwareId);
    setActuatorType(existingConfig?.hardwareType ?? "sts3215");
    setInvertDirection(existingConfig?.invertDirection ?? false);
    setLimitMin(existingConfig?.limitMin ?? "");
    setLimitMax(existingConfig?.limitMax ?? "");
    setSagOffsetDeg(existingConfig?.sagOffsetDeg ?? "");
    setDigitalTwinOffsetDeg(existingConfig?.digitalTwinOffsetDeg ?? "");
    setStepperStepPin(
      isStepperConfig(existingConfig)
        ? (existingConfig.stepPin ?? implicitPins?.stepPin ?? "")
        : (implicitPins?.stepPin ?? ""),
    );
    setStepperDirPin(
      isStepperConfig(existingConfig)
        ? (existingConfig.dirPin ?? implicitPins?.dirPin ?? "")
        : (implicitPins?.dirPin ?? ""),
    );
    setStepperEnablePin(
      isStepperConfig(existingConfig) ? (existingConfig.enablePin ?? "") : "",
    );
    setStepperMicrosteps(
      isStepperConfig(existingConfig) ? existingConfig.microsteps : 16,
    );
    setStepperStepsPerRev(
      isStepperConfig(existingConfig) ? existingConfig.stepsPerRev : 200,
    );
    setStepperGearRatio(
      isStepperConfig(existingConfig) ? existingConfig.gearRatio : 1,
    );
    setStepperHoming(
      isStepperConfig(existingConfig)
        ? (existingConfig.homingMethod ?? "manual")
        : "manual",
    );
    setPwmPin(
      isPwmConfig(existingConfig)
        ? (existingConfig.pwmPin ?? 10)
        : (isGripperLikeJointName(motor.name) ? 9 : 10),
    );
    setPwmMin(isPwmConfig(existingConfig) ? (existingConfig.pwmMin ?? 500) : 500);
    setPwmMax(
      isPwmConfig(existingConfig) ? (existingConfig.pwmMax ?? 2500) : 2500,
    );
    setStatus("info", `Selected ${motor.name.replace(/_/g, " ")} for configuration.`);
  };

  const handleSaveConfig = async () => {
    if (!selectedMotorName) {
      setStatus("error", "Please select a motor to configure.");
      return;
    }
    if (actuatorType === "bldc") {
      setStatus(
        "error",
        "BLDC is not yet supported by firmware. Choose STS3215, NEMA stepper, or PWM.",
      );
      return;
    }

    const parsedToId = parseNumber(toId);
    if (parsedToId === null || parsedToId <= 0) {
      setStatus("error", "Target Hardware ID must be a positive number.");
      return;
    }

    // Feetech physical ID programming if needed and possible
    if (
      actuatorType === "sts3215" &&
      isConnected &&
      fromId &&
      toId &&
      Number(fromId) !== Number(toId)
    ) {
      try {
        await scsServoSDK.setServoId(Number(fromId), Number(toId));
        console.log(
          `Physically set ID for ${selectedMotorName} from ${fromId} to ${toId}`,
        );
      } catch (err: unknown) {
        console.warn(
          `Could not program physical ID for ${selectedMotorName}`,
          err,
        );
        // Continue anyway to save the config to the digital twin
      }
    }

    const baseConfig: BaseActuatorConfig = {
      jointName: selectedMotorName,
      hardwareType: actuatorType,
      hardwareId: parsedToId,
      invertDirection,
    };
    if (limitMin !== "") {
      baseConfig.limitMin = Number(limitMin);
    }
    if (limitMax !== "") {
      baseConfig.limitMax = Number(limitMax);
    }
    const parsedSagOffset = parseNumber(sagOffsetDeg);
    if (parsedSagOffset !== null) {
      baseConfig.sagOffsetDeg = parsedSagOffset;
    }
    const parsedDtOffset = parseNumber(digitalTwinOffsetDeg);
    if (parsedDtOffset !== null) {
      baseConfig.digitalTwinOffsetDeg = parsedDtOffset;
    }
    let configPayload: ActuatorConfig = baseConfig;

    if (
      actuatorType === "nema17" ||
      actuatorType === "nema23" ||
      actuatorType === "nema34"
    ) {
      const parsedMicrosteps = parseNumber(stepperMicrosteps);
      const parsedStepsPerRev = parseNumber(stepperStepsPerRev);
      const parsedGearRatio = parseNumber(stepperGearRatio);
      const parsedStepPin = parseNumber(stepperStepPin);
      const parsedDirPin = parseNumber(stepperDirPin);
      const parsedEnablePin = parseNumber(stepperEnablePin);
      const requiresExplicitPins =
        !selectedMotor ||
        getImplicitStepperPins(selectedMotor.jointIndex) === null;

      if (
        parsedMicrosteps === null ||
        parsedStepsPerRev === null ||
        parsedGearRatio === null ||
        parsedMicrosteps <= 0 ||
        parsedStepsPerRev <= 0 ||
        parsedGearRatio <= 0
      ) {
        setStatus(
          "error",
          "Stepper requires valid microsteps, steps/rev, and gear ratio (> 0).",
        );
        return;
      }

      const hasStepPin = parsedStepPin !== null;
      const hasDirPin = parsedDirPin !== null;
      if (hasStepPin !== hasDirPin) {
        setStatus("error", "Provide both stepPin and dirPin, or leave both empty.");
        return;
      }
      if (requiresExplicitPins && !hasStepPin) {
        setStatus(
          "error",
          "This joint requires explicit stepPin and dirPin for stepper configuration.",
        );
        return;
      }

      const stepperConfig: StepperConfig = {
        ...baseConfig,
        hardwareType: actuatorType,
        microsteps: parsedMicrosteps,
        stepsPerRev: parsedStepsPerRev,
        gearRatio: parsedGearRatio,
        homingMethod: stepperHoming,
      };
      if (hasStepPin && hasDirPin) {
        stepperConfig.stepPin = parsedStepPin;
        stepperConfig.dirPin = parsedDirPin;
      }
      if (parsedEnablePin !== null) {
        stepperConfig.enablePin = parsedEnablePin;
      }
      configPayload = stepperConfig;
    } else if (actuatorType === "pwm") {
      const parsedPwmPin = parseNumber(pwmPin);
      const parsedPwmMin = parseNumber(pwmMin);
      const parsedPwmMax = parseNumber(pwmMax);
      if (
        parsedPwmPin === null ||
        parsedPwmMin === null ||
        parsedPwmMax === null
      ) {
        setStatus(
          "error",
          "PWM requires valid pwmPin, pwmMin, and pwmMax values.",
        );
        return;
      }
      if (parsedPwmMin >= parsedPwmMax) {
        setStatus("error", "PWM min must be less than PWM max.");
        return;
      }

      const pwmConfig: PwmConfig = {
        ...baseConfig,
        hardwareType: "pwm",
        pwmPin: parsedPwmPin,
        pwmMin: parsedPwmMin,
        pwmMax: parsedPwmMax,
      };
      configPayload = pwmConfig;
    } else if (actuatorType === "sts3215") {
      configPayload = {
        ...baseConfig,
        hardwareType: "sts3215",
      };
    }

    // Save to global profile
    setActuator(selectedMotorName, configPayload);

    setStatus(
      "success",
      `Saved configuration for ${selectedMotorName.replace(/_/g, " ")}.`,
    );
    setSelectedMotorName(null);
  };

  return (
    <section className="scroll-mt-32">
      <h2
        id="configure"
        className="group text-3xl font-bold text-white mb-6 scroll-mt-32"
      >
        <a href="#configure" className="flex items-center">
          {t.configureTheMotors}
          <RiLink className="w-5 h-5 ml-2 text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity" />
        </a>
      </h2>

      <div className="space-y-6">
        {statusMessage && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              statusLevel === "error"
                ? "bg-red-950/30 border-red-700 text-red-200"
                : statusLevel === "success"
                  ? "bg-emerald-950/30 border-emerald-700 text-emerald-200"
                  : "bg-blue-950/30 border-blue-700 text-blue-200"
            }`}
          >
            {statusMessage}
          </div>
        )}

        <div className="bg-zinc-800 border border-zinc-600 rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-4 text-white">
            {t.connectToMotorBus}
          </h3>
          <p className="text-zinc-300 mb-3">{t.connectPrompt}</p>
          <button
            onClick={handleConnect}
            disabled={isConnected}
            className={`font-bold py-2 px-4 rounded text-white ${
              isConnected
                ? "bg-green-600 cursor-not-allowed"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {isConnected ? t.connected : t.connect}
          </button>
        </div>

        <div className="bg-zinc-800 border border-zinc-600 rounded-lg p-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-xl font-semibold text-white">
                {t.setupFollowerMotors} (FYP2 Modular Config)
              </h3>
              <p className="text-zinc-300 mt-1">
                Configure your hardware mapping. Choose the actuator type (e.g.,
                Feetech STS3215) and assign the hardware IDs.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <h4 className="text-lg font-semibold text-white mb-2">
                {t.selectMotorToConfigure}
              </h4>
              {activeMotors.map((motor) => {
                const isConfigured = !!globalActuators[motor.name];
                return (
                  <button
                    key={motor.name}
                    onClick={() => handleSelectMotor(motor)}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      selectedMotorName === motor.name
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-900 hover:bg-zinc-700"
                    } ${
                      isConfigured
                        ? "bg-green-600/60 text-white"
                        : ""
                    } text-white`}
                  >
                    <span className="flex items-center justify-between">
                      <span>{motor.name.replace(/_/g, " ")}</span>
                      {isConfigured && (
                        <span className="text-xs text-emerald-300">✓ configured</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="space-y-4">
              <h4 className="text-lg font-semibold text-white">
                Actuator Properties
              </h4>
              <div className="bg-zinc-900 p-4 rounded-lg space-y-4">
                {/* FYP2 Actuator Type Selection */}
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">
                    Actuator Type
                  </label>
                  <select
                    disabled={!selectedMotorName}
                    value={actuatorType}
                    onChange={(e) =>
                      setActuatorType(e.target.value as ActuatorType)
                    }
                    className="w-full bg-zinc-950 text-white p-2 rounded border border-zinc-700 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                  >
                    <option value="sts3215">
                      Feetech STS3215 Servo (Default)
                    </option>
                    <option value="nema17">NEMA 17 Stepper</option>
                    <option value="nema23">NEMA 23 Stepper</option>
                    <option value="nema34">NEMA 34 Stepper</option>
                    <option value="bldc" disabled>
                      Brushless DC Motor (BLDC) - Coming Soon
                    </option>
                    <option value="pwm">Standard PWM Servo</option>
                  </select>
                </div>

                <div className="pt-4 border-t border-zinc-800 space-y-4">
                  <h5 className="text-sm font-semibold text-zinc-400 mb-2">
                    Core Configuration
                  </h5>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-1">
                        Target Hardware ID
                      </label>
                      <input
                        type="number"
                        value={toId}
                        onChange={(e) => setToId(e.target.value)}
                        disabled={!selectedMotorName}
                        className="w-full bg-zinc-950 text-white p-2 rounded border border-zinc-700 focus:ring-blue-500 disabled:opacity-50"
                      />
                    </div>
                    {actuatorType === "sts3215" && (
                      <div>
                        <label className="block text-sm font-medium text-zinc-300 mb-1">
                          Current ID (for flashing)
                        </label>
                        <input
                          type="number"
                          value={fromId}
                          onChange={(e) => setFromId(e.target.value)}
                          disabled={!selectedMotorName || !isConnected}
                          className="w-full bg-zinc-950 text-white p-2 rounded border border-zinc-700 focus:ring-blue-500 disabled:opacity-50"
                        />
                      </div>
                    )}
                  </div>

                  {/* Physics / Kinematics Inversion */}
                  <div className="flex items-center mt-2">
                    <input
                      type="checkbox"
                      id="invertDirection"
                      checked={invertDirection}
                      onChange={(e) => setInvertDirection(e.target.checked)}
                      disabled={!selectedMotorName}
                      className="mr-2"
                    />
                    <label
                      htmlFor="invertDirection"
                      className="text-sm text-zinc-300"
                    >
                      Invert Kinematic Direction
                    </label>
                  </div>

                  {/* Limits */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-1">
                        Min Soft Limit
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 0"
                        value={limitMin}
                        onChange={(e) => setLimitMin(e.target.value)}
                        disabled={!selectedMotorName}
                        className="w-full bg-zinc-950 text-white p-2 rounded border border-zinc-700"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-1">
                        Max Soft Limit
                      </label>
                      <input
                        type="number"
                        placeholder="e.g. 4095"
                        value={limitMax}
                        onChange={(e) => setLimitMax(e.target.value)}
                        disabled={!selectedMotorName}
                        className="w-full bg-zinc-950 text-white p-2 rounded border border-zinc-700"
                      />
                    </div>
                  </div>

                  {/* Gravity Sag Compensation */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1">
                      Gravity Sag Offset (deg)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      placeholder="e.g. -4.5"
                      value={sagOffsetDeg}
                      onChange={(e) => setSagOffsetDeg(e.target.value)}
                      disabled={!selectedMotorName}
                      className="w-full bg-zinc-950 text-white p-2 rounded border border-zinc-700"
                    />
                    <p className="text-xs text-zinc-500 mt-1">
                      Compensates for physical sag due to gravity. Subtracted from commands, added to feedback.
                    </p>
                  </div>

                  {/* Digital Twin Visual Offset */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-1">
                      Digital Twin Visual Offset (deg)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      placeholder="e.g. 4.5"
                      value={digitalTwinOffsetDeg}
                      onChange={(e) => setDigitalTwinOffsetDeg(e.target.value)}
                      disabled={!selectedMotorName}
                      className="w-full bg-zinc-950 text-white p-2 rounded border border-zinc-700"
                    />
                    <p className="text-xs text-zinc-500 mt-1">
                      Bends the 3D model without affecting actual commands. Use this to align the digital twin grid with reality.
                    </p>
                  </div>

                  {/* Dynamic Fields: Stepper */}
                  {(actuatorType === "nema17" ||
                    actuatorType === "nema23" ||
                    actuatorType === "nema34") && (
                    <div className="pt-4 border-t border-zinc-800 space-y-4">
                      <h5 className="text-sm font-semibold text-zinc-400 mb-2">
                        Stepper Parameters
                      </h5>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm text-zinc-300 mb-1">
                            Microsteps (Div)
                          </label>
                          <input
                            type="number"
                            value={stepperMicrosteps}
                            onChange={(e) =>
                              setStepperMicrosteps(e.target.value)
                            }
                            className="w-full bg-zinc-950 text-white p-2 rounded border border-zinc-700"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-zinc-300 mb-1">
                            Steps/Rev
                          </label>
                          <input
                            type="number"
                            value={stepperStepsPerRev}
                            onChange={(e) =>
                              setStepperStepsPerRev(e.target.value)
                            }
                            className="w-full bg-zinc-950 text-white p-2 rounded border border-zinc-700"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-zinc-300 mb-1">
                            Gear Ratio
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            value={stepperGearRatio}
                            onChange={(e) =>
                              setStepperGearRatio(e.target.value)
                            }
                            className="w-full bg-zinc-950 text-white p-2 rounded border border-zinc-700"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-zinc-300 mb-1">
                            Homing
                          </label>
                          <select
                            value={stepperHoming}
                            onChange={(e) => {
                              const value = e.target.value;
                              if (isStepperHomingMethod(value)) {
                                setStepperHoming(value);
                              }
                            }}
                            className="w-full bg-zinc-950 text-white p-2 rounded border border-zinc-700"
                          >
                            <option value="manual">Manual / None</option>
                            <option value="endstop">Endstop Switch</option>
                            <option value="stall">Sensorless StallGuard</option>
                          </select>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm text-zinc-300 mb-1">
                            Step Pin
                          </label>
                          <input
                            type="number"
                            value={stepperStepPin}
                            onChange={(e) => setStepperStepPin(e.target.value)}
                            className="w-full bg-zinc-950 text-white p-2 rounded border border-zinc-700"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-zinc-300 mb-1">
                            Dir Pin
                          </label>
                          <input
                            type="number"
                            value={stepperDirPin}
                            onChange={(e) => setStepperDirPin(e.target.value)}
                            className="w-full bg-zinc-950 text-white p-2 rounded border border-zinc-700"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-zinc-300 mb-1">
                            Enable Pin (optional)
                          </label>
                          <input
                            type="number"
                            value={stepperEnablePin}
                            onChange={(e) => setStepperEnablePin(e.target.value)}
                            className="w-full bg-zinc-950 text-white p-2 rounded border border-zinc-700"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-zinc-400">
                        The first two joints in the active chain can reuse the
                        firmware&apos;s implicit stepper pins (2/3 and 4/5) if
                        left empty. All later joints require explicit Step/Dir
                        pins for steppers.
                      </p>
                    </div>
                  )}

                  {/* Dynamic Fields: PWM */}
                  {actuatorType === "pwm" && (
                    <div className="pt-4 border-t border-zinc-800 space-y-4">
                      <h5 className="text-sm font-semibold text-zinc-400 mb-2">
                        PWM Calibrations
                      </h5>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm text-zinc-300 mb-1">
                            PWM Pin
                          </label>
                          <input
                            type="number"
                            value={pwmPin}
                            onChange={(e) => setPwmPin(e.target.value)}
                            className="w-full bg-zinc-950 text-white p-2 rounded border border-zinc-700"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-zinc-300 mb-1">
                            PWM Min (µs)
                          </label>
                          <input
                            type="number"
                            value={pwmMin}
                            onChange={(e) => setPwmMin(e.target.value)}
                            className="w-full bg-zinc-950 text-white p-2 rounded border border-zinc-700"
                          />
                        </div>
                        <div>
                          <label className="block text-sm text-zinc-300 mb-1">
                            PWM Max (µs)
                          </label>
                          <input
                            type="number"
                            value={pwmMax}
                            onChange={(e) => setPwmMax(e.target.value)}
                            className="w-full bg-zinc-950 text-white p-2 rounded border border-zinc-700"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleSaveConfig}
                    disabled={!selectedMotorName}
                    className="w-full font-bold py-3 px-4 mt-6 rounded text-white bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed shadow transition-colors"
                  >
                    Save{" "}
                    {selectedMotorName
                      ? selectedMotorName.replace(/_/g, " ")
                      : ""}{" "}
                    Config
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-zinc-800 border border-zinc-600 rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-4 text-white">
            {t.motorIdUncertain}
          </h3>
          <p className="text-zinc-300 mb-3">{t.scanForMotorsDesc}</p>
          <div className="flex items-end gap-4 mb-4">
            <div className="flex-1">
              <label
                htmlFor="scanFromId"
                className="block text-sm font-medium text-zinc-300 mb-1"
              >
                {t.fromId}
              </label>
              <input
                type="number"
                id="scanFromId"
                value={scanFromId}
                onChange={(e) => setScanFromId(e.target.value)}
                disabled={!isConnected || isScanning}
                className="w-full bg-zinc-950 text-white p-2 rounded border border-zinc-700 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
              />
            </div>
            <div className="flex-1">
              <label
                htmlFor="scanToId"
                className="block text-sm font-medium text-zinc-300 mb-1"
              >
                {t.toId}
              </label>
              <input
                type="number"
                id="scanToId"
                value={scanToId}
                onChange={(e) => setScanToId(e.target.value)}
                disabled={!isConnected || isScanning}
                className="w-full bg-zinc-950 text-white p-2 rounded border border-zinc-700 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
              />
            </div>
            <button
              onClick={handleScan}
              disabled={!isConnected || isScanning}
              className="font-bold py-2 px-4 rounded text-white bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-500 disabled:cursor-not-allowed"
            >
              {isScanning ? t.scanning : t.scanForMotors}
            </button>
          </div>
          {foundMotorData.size > 0 && (
            <div className="bg-zinc-900 p-4 rounded-lg">
              <h4 className="text-lg font-semibold text-white mb-2">
                {t.scanResults}
              </h4>
              <div className="font-mono text-sm space-y-1">
                {Array.from(foundMotorData.entries()).map(([id, position]) => (
                  <p
                    key={id}
                    className={
                      position !== null ? "text-green-400" : "text-zinc-500"
                    }
                  >
                    ID {id}:{" "}
                    {position !== null
                      ? `${t.position} ${position}`
                      : t.notFound}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="bg-zinc-800 border border-zinc-600 rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-4 text-white">
            {t.disconnectFromMotorBus}
          </h3>
          <p className="text-zinc-300 mb-3">{t.disconnectDesc}</p>
          <button
            onClick={handleDisconnect}
            disabled={!isConnected}
            className={`font-bold py-2 px-4 rounded text-white ${
              !isConnected
                ? "bg-zinc-500 cursor-not-allowed"
                : "bg-red-600 hover:bg-red-700"
            }`}
          >
            {t.disconnect}
          </button>
        </div>
      </div>
    </section>
  );
}
