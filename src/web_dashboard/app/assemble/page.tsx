"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  useRobotProfileStore,
  type RobotProfileState,
} from "@/store/useRobotProfileStore";
import { Upload, Cpu } from "lucide-react";

export default function AssembleLanding() {
  const router = useRouter();
  const setBaseUrdfContent = useRobotProfileStore(
    (state: RobotProfileState) => state.setBaseUrdfContent,
  );
  const setProfileName = useRobotProfileStore(
    (state: RobotProfileState) => state.setProfileName,
  );
  const resetProfile = useRobotProfileStore(
    (state: RobotProfileState) => state.resetProfile,
  );
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".urdf") && !file.name.endsWith(".xml")) {
      setError("Please upload a valid .urdf or .xml file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        // Optional: Simple validation that it's XML
        if (!text.includes("<robot")) {
          throw new Error("File does not contain a <robot> tag");
        }

        resetProfile();
        setProfileName(`Custom Robot (${file.name})`);
        setBaseUrdfContent(text);

        // Push to the new assemble custom dashboard
        router.push("/assemble/custom");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setError("Error parsing URDF: " + message);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen bg-zinc-950 p-8 flex flex-col items-center justify-center pt-24">
      <div className="max-w-4xl w-full">
        <h1 className="text-4xl font-bold text-white mb-4 text-center">
          Bring Your Robot to Life
        </h1>
        <p className="text-zinc-400 text-center mb-12 max-w-2xl mx-auto">
          Choose a pre-defined kit to configure and assemble, or upload your own
          custom URDF file to map your hardware to an arbitrary kinematic chain.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Preset Option */}
          <div
            onClick={() => {
              resetProfile();
              router.push("/assemble/so-101");
            }}
            className="group cursor-pointer bg-zinc-900 border border-zinc-800 hover:border-blue-500 rounded-xl p-8 transition-all hover:shadow-[0_0_30px_rgba(59,130,246,0.1)] relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-blue-500 transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform"></div>
            <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-6 text-blue-400 group-hover:scale-110 transition-transform">
              <Cpu size={32} />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              SO-ARM101 Kit
            </h2>
            <p className="text-zinc-400 leading-relaxed mb-6">
              The standard 6-axis robotic arm kit. Complete with step-by-step
              assembly instructions, bill of materials, and pre-tuned
              parameters.
            </p>
            <div className="inline-flex items-center text-blue-400 font-medium">
              Start Configuration →
            </div>
          </div>

          {/* Custom Upload Option */}
          <div className="bg-zinc-900 border border-zinc-800 hover:border-emerald-500 rounded-xl p-8 transition-all hover:shadow-[0_0_30px_rgba(16,185,129,0.1)] relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500 transform origin-left scale-x-0 group-hover:scale-x-100 transition-transform"></div>
            <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-6 text-emerald-400 group-hover:scale-110 transition-transform">
              <Upload size={32} />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              Custom Robot (URDF)
            </h2>
            <p className="text-zinc-400 leading-relaxed mb-6">
              Upload standard URDF files exported from Onshape, SolidWorks, or
              Fusion360. We will automatically extract the joints and let you map
              actuators to them.
            </p>

            <label className="cursor-pointer inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold px-6 py-3 rounded-lg transition-colors shadow-lg">
              <Upload size={18} />
              <span>Select .urdf File</span>
              <input
                type="file"
                accept=".urdf,.xml"
                className="hidden"
                onChange={handleFileUpload}
              />
            </label>

            {error && (
              <p className="mt-4 text-red-400 text-sm font-medium bg-red-400/10 p-2 rounded">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
