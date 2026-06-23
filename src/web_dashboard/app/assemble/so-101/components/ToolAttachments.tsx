"use client";

import { RiLink, RiCloseLine } from "@remixicon/react";
import React, { useState } from "react";
import {
  useRobotProfileStore,
  type ActuatorConfig,
  type ActuatorType,
  type RobotProfileState,
} from "../../../../store/useRobotProfileStore";
import dynamic from "next/dynamic";

const RobotPreview = dynamic(() => import("./RobotPreview"), { ssr: false });

export default function ToolAttachments() {
  const activeTool = useRobotProfileStore(
    (state: RobotProfileState) => state.activeTool,
  );
  const setActiveTool = useRobotProfileStore(
    (state: RobotProfileState) => state.setActiveTool,
  );
  const profileLinks = useRobotProfileStore(
    (state: RobotProfileState) => state.links,
  ) as string[];
  const globalActuators = useRobotProfileStore(
    (state: RobotProfileState) => state.actuators,
  );
  const setBaseUrdfContent = useRobotProfileStore(
    (state: RobotProfileState) => state.setBaseUrdfContent,
  );
  const setProfileName = useRobotProfileStore(
    (state: RobotProfileState) => state.setProfileName,
  );

  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [customUrdfInput, setCustomUrdfInput] = useState("");

  const handleSaveCustomTool = () => {
    if (!customUrdfInput.trim()) return;

    // We update the active tool properties to a custom variant
    setActiveTool({
      ...activeTool,
      type: "custom",
      name: "Custom URDF Tool",
      tcpOffset: [0, 0, 0.1], // basic default
    });

    // Update the base URDF content so the ThreeJS viewer parses the new geometry
    setBaseUrdfContent(customUrdfInput);
    setProfileName("Custom Configured Robot");
    setIsCustomModalOpen(false);
  };

  const isConflict = React.useMemo(() => {
    // Return true if another joint (that isn't the active tool) is using this hardware ID
    const actuatorEntries = Object.entries(globalActuators) as [
      string,
      ActuatorConfig,
    ][];
    return actuatorEntries.some(
      ([jointName, config]) =>
        config.hardwareId === activeTool.hardwareId &&
        jointName !== activeTool.name,
    );
  }, [globalActuators, activeTool]);

  return (
    <section className="scroll-mt-32">
      <h2
        id="tools"
        className="group text-3xl font-bold text-white mb-6 scroll-mt-32"
      >
        <a href="#tools" className="flex items-center">
          Configure End-Effector (FYP2)
          <RiLink className="w-5 h-5 ml-2 text-zinc-500 opacity-0 group-hover:opacity-100 transition-opacity" />
        </a>
      </h2>

      <div className="space-y-6">
        <div className="bg-zinc-800 border border-zinc-600 rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-4 text-white">
            Select Active Tool Head
          </h3>
          <p className="text-zinc-300 mb-6">
            Swapping the physical tool head? Select the corresponding digital
            definition below so the kinematics and 3D visualization update
            automatically.
          </p>

          <div className="mb-6">
            <RobotPreview />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Standard Gripper */}
            <button
              onClick={() =>
                setActiveTool({
                  ...activeTool,
                  type: "gripper",
                  name: "Standard Gripper",
                  tcpOffset: [0, 0, 0.12],
                })
              }
              className={`p-6 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-3 ${
                activeTool.type === "gripper"
                  ? "bg-blue-600/20 border-blue-500"
                  : "bg-zinc-900 border-zinc-700 hover:border-zinc-500"
              }`}
            >
              <div className="text-4xl text-white">🤏</div>
              <div className="text-center">
                <div className="font-bold text-white text-lg">
                  Standard Gripper
                </div>
                <div className="text-xs text-zinc-400 mt-1">
                  SO-ARM101 Default
                </div>
              </div>
            </button>

            {/* Rotary Drill */}
            <button
              onClick={() =>
                setActiveTool({
                  ...activeTool,
                  type: "drill",
                  name: "Rotary Drill",
                  tcpOffset: [0, 0, 0.15],
                })
              }
              className={`p-6 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-3 ${
                activeTool.type === "drill"
                  ? "bg-blue-600/20 border-blue-500"
                  : "bg-zinc-900 border-zinc-700 hover:border-zinc-500"
              }`}
            >
              <div className="text-4xl text-white">🔧</div>
              <div className="text-center">
                <div className="font-bold text-white text-lg">Rotary Drill</div>
                <div className="text-xs text-zinc-400 mt-1">
                  Continuous Rotation
                </div>
              </div>
            </button>

            {/* Add Custom */}
            <button
              onClick={() => setIsCustomModalOpen(true)}
              className={`p-6 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-3 group ${
                activeTool.type === "custom"
                  ? "bg-blue-600/20 border-blue-500"
                  : "border-dashed border-zinc-600 bg-zinc-900/50 hover:bg-zinc-800"
              }`}
            >
              <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-white transition-colors">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 4v16m8-8H4"
                  ></path>
                </svg>
              </div>
              <div className="text-center">
                <div className="font-bold text-zinc-400 group-hover:text-white transition-colors text-lg">
                  {activeTool.type === "custom"
                    ? "Custom Active"
                    : "Add Custom"}
                </div>
                <div className="text-xs text-zinc-500 mt-1">Paste URDF XML</div>
              </div>
            </button>
          </div>
        </div>

        {/* Hardware Map for Tool */}
        <div className="bg-zinc-800 border border-zinc-600 rounded-lg p-6">
          <h3 className="text-xl font-semibold mb-4 text-white">
            Tool Hardware Configuration
          </h3>
          <p className="text-zinc-300 mb-4">
            Map your selected tool head to the physical output controller.
          </p>
          <div className="bg-zinc-900 p-4 rounded-lg flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Motor / Actuator Type
              </label>
              <select
                value={activeTool.hardwareType}
                onChange={(e) =>
                  setActiveTool({
                    ...activeTool,
                    hardwareType: e.target.value as ActuatorType,
                  })
                }
                className="w-full bg-zinc-950 text-white p-2 rounded border border-zinc-700 focus:ring-blue-500"
              >
                <option value="sts3215">Feetech STS3215 Servo</option>
                <option value="pwm">DC Motor (PWM)</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Pin / ID Number
              </label>
              <input
                type="number"
                value={activeTool.hardwareId}
                onChange={(e) =>
                  setActiveTool({
                    ...activeTool,
                    hardwareId: Number(e.target.value),
                  })
                }
                className={`w-full bg-zinc-950 text-white p-2 rounded border focus:ring-blue-500 ${
                  isConflict ? "border-amber-500" : "border-zinc-700"
                }`}
              />
              {isConflict && (
                <p className="text-amber-500 text-xs mt-1">
                  Warning: ID {activeTool.hardwareId} is currently assigned to
                  another joint in Motor Config. You must physically swap the
                  wire.
                </p>
              )}
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-zinc-300 mb-1">
                Kinematic Mount Link
              </label>
              <select
                value={activeTool.mountLink || ""}
                onChange={(e) =>
                  setActiveTool({
                    ...activeTool,
                    mountLink: e.target.value,
                  })
                }
                className="w-full bg-zinc-950 text-white p-2 rounded border border-zinc-700 focus:ring-blue-500"
              >
                <option value="">(Default / Auto-detect)</option>
                {profileLinks.map((link: string) => (
                  <option key={link} value={link}>
                    {link}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* TCP Offset Configuration */}
          <div className="mt-8 border-t border-zinc-700 pt-6">
            <h4 className="text-lg font-semibold mb-3 text-white">
              Tool Center Point (TCP) Offset
            </h4>
            <p className="text-sm text-zinc-400 mb-4">
              Define the physical distance from the robot wrist mounting
              flange to the operational tip of the tool. This is critical for
              accurate Inverse Kinematics (IK) calculations.
            </p>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  X Offset (meters)
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={activeTool.tcpOffset?.[0] ?? 0}
                  onChange={(e) =>
                    setActiveTool({
                      ...activeTool,
                      tcpOffset: [
                        Number(e.target.value),
                        activeTool.tcpOffset?.[1] ?? 0,
                        activeTool.tcpOffset?.[2] ?? 0,
                      ],
                    })
                  }
                  className="w-full bg-zinc-950 text-white p-2 text-sm rounded border border-zinc-700 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Y Offset (meters)
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={activeTool.tcpOffset?.[1] ?? 0}
                  onChange={(e) =>
                    setActiveTool({
                      ...activeTool,
                      tcpOffset: [
                        activeTool.tcpOffset?.[0] ?? 0,
                        Number(e.target.value),
                        activeTool.tcpOffset?.[2] ?? 0,
                      ],
                    })
                  }
                  className="w-full bg-zinc-950 text-white p-2 text-sm rounded border border-zinc-700 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Z Offset (meters)
                </label>
                <input
                  type="number"
                  step="0.001"
                  value={activeTool.tcpOffset?.[2] ?? 0.12}
                  onChange={(e) =>
                    setActiveTool({
                      ...activeTool,
                      tcpOffset: [
                        activeTool.tcpOffset?.[0] ?? 0,
                        activeTool.tcpOffset?.[1] ?? 0,
                        Number(e.target.value),
                      ],
                    })
                  }
                  className="w-full bg-zinc-950 text-white p-2 text-sm rounded border border-zinc-700 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="mt-6 border-t border-zinc-800 pt-6">
              <h4 className="text-lg font-semibold mb-3 text-white">
                Payload Mass
              </h4>
              <p className="text-sm text-zinc-400 mb-4">
                Specify the weight of the end-effector. The robot controller
                uses this for gravity compensation and dynamic feed-forward
                torques.
              </p>
              <div className="w-1/3">
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Mass (kg)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={activeTool.payloadMass ?? 0.2}
                  onChange={(e) =>
                    setActiveTool({
                      ...activeTool,
                      payloadMass: Number(e.target.value),
                    })
                  }
                  className="w-full bg-zinc-950 text-white p-2 text-sm rounded border border-zinc-700 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Custom URDF Modal */}
      {isCustomModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center p-4 border-b border-zinc-800">
              <h3 className="text-lg font-bold text-white">Add Custom URDF</h3>
              <button
                onClick={() => setIsCustomModalOpen(false)}
                className="text-zinc-400 hover:text-white p-1"
              >
                <RiCloseLine className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <p className="text-sm text-zinc-400 mb-4">
                Paste the full URDF XML describing your robot arm and custom
                tool attachment. The 3D preview will attempt to parse and render
                this new configuration. Make sure all `&lt;mesh
                filename=&quot;...&quot;/&gt;` tags use remote HTTP URLs if you have
                custom meshes, as local filesystem paths cannot be resolved by
                the browser.
              </p>
              <textarea
                value={customUrdfInput}
                onChange={(e) => setCustomUrdfInput(e.target.value)}
                placeholder='&lt;robot name="custom_arm"&gt;...&lt;/robot&gt;'
                className="w-full h-64 bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-300 font-mono text-xs focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="p-4 border-t border-zinc-800 bg-zinc-900/50 flex justify-end gap-3">
              <button
                onClick={() => setIsCustomModalOpen(false)}
                className="px-4 py-2 font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCustomTool}
                disabled={!customUrdfInput.trim()}
                className="px-4 py-2 font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Apply Custom URDF
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
