import { RiDownload2Line, RiLink } from "@remixicon/react";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useLocale } from "./LocaleContext";
import {
  useRobotProfileStore,
  type ActuatorConfig,
  type RobotProfileState,
} from "../../../../store/useRobotProfileStore";

const RobotPreview = dynamic(() => import("./RobotPreview"), { ssr: false });
import { Button } from "@/components/ui/button";
import { useMotorBus } from "./MotorBusContext";

export default function Calibrate() {
  const { t } = useLocale();
  const actuators = useRobotProfileStore(
    (state: RobotProfileState) => state.actuators,
  );
  const setActuator = useRobotProfileStore(
    (state: RobotProfileState) => state.setActuator,
  );
  const exportProfile = useRobotProfileStore(
    (state: RobotProfileState) => state.exportProfile,
  );

  const { scsServoSDK, isConnected } = useMotorBus();

  const [logs, setLogs] = useState<string[]>([]);
  const [isFindingLimits, setIsFindingLimits] = useState(false);
  const [minPositions, setMinPositions] = useState<Map<number, number>>(
    new Map(),
  );
  const [maxPositions, setMaxPositions] = useState<Map<number, number>>(
    new Map(),
  );
  const [currentPositions, setCurrentPositions] = useState<Map<number, number>>(
    new Map(),
  );
  const [limitFindingIntervalId, setLimitFindingIntervalId] =
    useState<NodeJS.Timeout | null>(null);
  const [robotConfig, setRobotConfig] = useState<
    ReturnType<typeof useRobotProfileStore.getState> | null
  >(null);
  const limitsTableRef = useRef<HTMLDivElement>(null);

  const toErrorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

  useEffect(
    () => () => {
      if (limitFindingIntervalId) {
        clearInterval(limitFindingIntervalId);
      }
    },
    [limitFindingIntervalId],
  );

  const actuatorEntries = Object.entries(actuators) as [string, ActuatorConfig][];
  const stsActuators = actuatorEntries.filter(
    ([, config]) => config.hardwareType === "sts3215",
  );
  const servoIds = stsActuators.map(([, config]) =>
    Number(config.hardwareId),
  );

  const handleStartFindingLimits = async () => {
    setIsFindingLimits(true);
    console.log(
      "Starting to find position limits. Move each servo to its extremes.",
    );

    const initialMin = new Map<number, number>();
    const initialMax = new Map<number, number>();
    servoIds.forEach((id) => {
      initialMin.set(id, 4095); // Max possible value
      initialMax.set(id, 0); // Min possible value
    });
    setMinPositions(initialMin);
    setMaxPositions(initialMax);

    setTimeout(() => {
      limitsTableRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 100);

    const intervalId = setInterval(async () => {
      try {
        const readPositions = await scsServoSDK.syncReadPositions(servoIds);
        setCurrentPositions(readPositions);
        setMinPositions((prevMin) => {
          const newMin = new Map(prevMin);
          readPositions.forEach((pos, id) => {
            if (pos < (newMin.get(id) ?? 4095)) {
              newMin.set(id, pos);
            }
          });
          return newMin;
        });
        setMaxPositions((prevMax) => {
          const newMax = new Map(prevMax);
          readPositions.forEach((pos, id) => {
            if (pos > (newMax.get(id) ?? 0)) {
              newMax.set(id, pos);
            }
          });
          return newMax;
        });
      } catch (err: unknown) {
        console.error(`Error reading positions: ${toErrorMessage(err)}`, err);
      }
    }, 100);
    setLimitFindingIntervalId(intervalId);
  };

  const handleStopAndSetLimits = async () => {
    if (limitFindingIntervalId) {
      clearInterval(limitFindingIntervalId);
      setLimitFindingIntervalId(null);
    }
    setIsFindingLimits(false);
    console.log("Stopped finding limits.");

    try {
      console.log(
        `Setting min position limits: ${JSON.stringify(
          Object.fromEntries(minPositions),
        )}`,
      );
      await scsServoSDK.syncWriteMinPosLimits(minPositions);
      console.log("Min position limits set successfully.");

      console.log(
        `Setting max position limits: ${JSON.stringify(
          Object.fromEntries(maxPositions),
        )}`,
      );
      await scsServoSDK.syncWriteMaxPosLimits(maxPositions);
      console.log("Max position limits set successfully.");

      console.log("Position limits configuration complete!");

      stsActuators.forEach(([name, config]) => {
        const id = Number(config.hardwareId);
        if (minPositions.has(id) && maxPositions.has(id)) {
          setActuator(name, {
            ...config,
            limitMin: minPositions.get(id),
            limitMax: maxPositions.get(id),
          });
        }
      });

      setRobotConfig(useRobotProfileStore.getState());
      console.log("Robot profile store updated with new limits.");
    } catch (err: unknown) {
      console.error("Failed to set limits:", err);
      alert("Failed to set limits. Check logs for details.");
    }
  };

  const handleCalibrate = async () => {
    setLogs([]);
    const addLog = (message: string) => {
      console.log(message);
      setLogs((prev) => [...prev, message]);
    };

    const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

    const targetPosition = 2047;
    addLog("Starting calibration...");

    try {
      // 1. Reset all position corrections to 0
      addLog("Resetting all position corrections to 0...");
      const zeroCorrections = new Map<number, number>();
      servoIds.forEach((id) => zeroCorrections.set(id, 0));
      await scsServoSDK.syncWritePosCorrection(zeroCorrections);
      addLog("Position corrections reset.");
      await delay(20);

      // 2. Read current positions (which are now physical positions)
      addLog(`Reading current positions for servos: [${servoIds.join(", ")}]`);
      const physicalPositions = await scsServoSDK.syncReadPositions(servoIds);
      addLog(
        `Current physical positions: ${JSON.stringify(
          Object.fromEntries(physicalPositions),
        )}`,
      );
      await delay(20);

      // 3. Calculate new corrections and apply them
      const newCorrections = new Map<number, number>();
      for (const [id, physicalPosition] of physicalPositions.entries()) {
        // We want New Reported (target) = Physical - newCorrection
        // So, newCorrection = Physical - target
        const correction = physicalPosition - targetPosition;
        newCorrections.set(id, correction);
      }
      addLog(
        `Calculated new corrections: ${JSON.stringify(
          Object.fromEntries(newCorrections),
        )}`,
      );

      addLog("Applying new position corrections...");
      await scsServoSDK.syncWritePosCorrection(newCorrections);
      addLog("Position corrections applied.");
      await delay(20);

      // 4. Verify new positions
      addLog("Verifying new positions...");
      const newPositions = await scsServoSDK.syncReadPositions(servoIds);
      addLog(
        `New positions after calibration: ${JSON.stringify(
          Object.fromEntries(newPositions),
        )}`,
      );

      addLog("Calibration complete!");
    } catch (err: unknown) {
      const errorMessage = `Calibration failed: ${toErrorMessage(err)}`;
      addLog(errorMessage);
      console.error("Calibration failed:", err);
      alert("Calibration failed. Check logs for details.");
    }
  };

  const handleDownloadConfig = () => {
    const jsonString = exportProfile();
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "robot_profile.json";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <section className="scroll-mt-32">
      <h2
        id="calibrate"
        className="group text-3xl font-bold text-white mb-6 scroll-mt-32"
      >
        <a href="#calibrate" className="flex items-center">
          {t.calibrate}
          <RiLink className="w-5 h-5 ml-2 text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity" />
        </a>
      </h2>

      <div className="bg-green-900/50 border border-green-700 rounded-lg p-4 mb-6">
        <p className="text-green-300">{t.calibrationDesc}</p>
      </div>

      {/* Profile Import/Export — always available */}
      <div className="bg-zinc-800 border border-zinc-600 rounded-lg p-6 mb-6">
        <h3 className="text-xl font-semibold mb-2 text-white">
          Robot Profile
        </h3>
        <p className="text-zinc-300 mb-4 text-sm">
          Export your current robot profile (including actuator configs, sag offsets, and limits) or import a previously saved profile.
        </p>
        <div className="flex gap-3">
          <button
            onClick={handleDownloadConfig}
            className="flex items-center font-bold py-2 px-4 rounded text-white bg-blue-600 hover:bg-blue-700"
          >
            <RiDownload2Line className="w-5 h-5 mr-2" />
            Export Profile
          </button>
          <label>
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (event) => {
                  const content = event.target?.result as string;
                  if (useRobotProfileStore.getState().importProfile(content)) {
                    setRobotConfig(useRobotProfileStore.getState());
                    alert("Profile imported successfully!");
                  } else {
                    alert("Failed to import profile. Check the JSON format.");
                  }
                };
                reader.readAsText(file);
              }}
            />
            <div className="font-bold py-2 px-4 rounded text-white bg-emerald-600 hover:bg-emerald-700 cursor-pointer">
              Import Profile
            </div>
          </label>
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-zinc-800 border border-zinc-600 rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-4 text-white">
            {t.calibrateButton}
          </h3>
          <p className="text-zinc-300 mb-3">{t.calibrateDesc}</p>
          <RobotPreview />
          <div className="mt-4">
            <button
              onClick={handleCalibrate}
              disabled={!isConnected}
              className={`font-bold py-2 px-4 rounded text-white ${
                !isConnected
                  ? "bg-zinc-500 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {t.calibrateButton}
            </button>
          </div>
          {logs.length > 0 && (
            <div className="mt-4 bg-zinc-900 border border-zinc-700 rounded-lg p-4 font-mono text-sm text-zinc-300 max-h-68 overflow-y-auto">
              {logs.map((log, index) => (
                <p key={index} className="whitespace-pre-wrap break-words">
                  {log}
                </p>
              ))}
            </div>
          )}
        </div>

        <div className="bg-zinc-800 border border-zinc-600 rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-4 text-white">
            {t.setMotorPositionLimits}
          </h3>
          <p className="text-zinc-300 mb-3">{t.setMotorPositionLimitsDesc}</p>

          {minPositions.size > 0 && (
            <div
              ref={limitsTableRef}
              className="mt-4 text-zinc-300 font-mono text-sm"
            >
              <div className="grid grid-cols-4 gap-4 font-semibold text-center pb-2 border-b border-zinc-700">
                <span>{t.jointId}</span>
                <span>{t.min}</span>
                <span>{t.current}</span>
                <span>{t.max}</span>
              </div>
              {servoIds.map((id) => (
                <div
                  key={id}
                  className="grid grid-cols-4 gap-4 text-center py-2 border-b border-zinc-800"
                >
                  <span>{id}</span>
                  <span>{minPositions.get(id)}</span>
                  <span>{currentPositions.get(id) ?? "N/A"}</span>
                  <span>{maxPositions.get(id)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center space-x-4">
            <button
              onClick={handleStartFindingLimits}
              disabled={!isConnected || isFindingLimits}
              className={`font-bold py-2 px-4 rounded text-white ${
                !isConnected || isFindingLimits
                  ? "bg-zinc-500 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {isFindingLimits ? t.finding : t.start}
            </button>
            <button
              onClick={handleStopAndSetLimits}
              disabled={!isFindingLimits}
              className={`font-bold py-2 px-4 rounded text-white ${
                !isFindingLimits
                  ? "bg-zinc-500 cursor-not-allowed"
                  : "bg-red-600 hover:bg-red-700"
              }`}
            >
              {t.setLimits}
            </button>
          </div>
        </div>

        {robotConfig && (
          <div className="bg-zinc-800 border border-zinc-600 rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-white">
                {t.calibrationResult}
              </h3>
              <button
                onClick={handleDownloadConfig}
                className="flex items-center font-bold py-2 px-4 rounded text-white bg-blue-600 hover:bg-blue-700"
              >
                <RiDownload2Line className="w-5 h-5 mr-2" />
                {t.downloadJson}
              </button>
            </div>
            <p className="text-zinc-300 mb-3">{t.calibrationResultDesc}</p>
            <pre className="bg-zinc-900 p-4 rounded text-sm text-zinc-300 overflow-x-auto">
              {JSON.stringify(robotConfig, null, 2)}
            </pre>
          </div>
        )}

        <div className="bg-blue-900/50 border border-blue-700 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-blue-200 mb-2">
            {t.congratulations}
          </h3>
          <p className="text-blue-300">{t.congratulationsDesc}</p>
          <Link href="/play/so-arm101" className="mt-4 inline-block">
            <Button>{t.goToControlPage}</Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
