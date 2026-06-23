import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface DisplayState {
  physicsDebug: boolean;
  showGrid: boolean;
  showShadows: boolean;
  showPerf: boolean;
  renderQuality: "low" | "balanced" | "high";
  environment: "studio" | "warehouse" | "apartment" | "city";
  robotOpacity: number;
  preferredUnit: "m" | "cm" | "mm";
  showIKTarget: boolean;
  showIKMarker: boolean;
  showLinkLabels: boolean;
  showGripperCoords: boolean;
  setPhysicsDebug: (show: boolean) => void;
  setShowGrid: (show: boolean) => void;
  setShowShadows: (show: boolean) => void;
  setRenderQuality: (quality: DisplayState["renderQuality"]) => void;
  setEnvironment: (env: DisplayState["environment"]) => void;
  setRobotOpacity: (opacity: number) => void;
  setPreferredUnit: (unit: DisplayState["preferredUnit"]) => void;
  setShowPerf: (show: boolean) => void;
  setShowIKTarget: (show: boolean) => void;
  setShowIKMarker: (show: boolean) => void;
  setShowLinkLabels: (show: boolean) => void;
  setShowGripperCoords: (show: boolean) => void;
}

export const useDisplayStore = create<DisplayState>()(
  persist(
    (set) => ({
      physicsDebug: false,
      showGrid: true,
      showShadows: true,
      showPerf: false,
      renderQuality: "balanced",
      environment: "city",
      robotOpacity: 1.0,
      preferredUnit: "m",
      showIKTarget: true,
      showIKMarker: false,
      showLinkLabels: false,
      showGripperCoords: true,
      setPhysicsDebug: (show) => set({ physicsDebug: show }),
      setShowGrid: (show) => set({ showGrid: show }),
      setShowShadows: (show) => set({ showShadows: show }),
      setRenderQuality: (quality) => set({ renderQuality: quality }),
      setEnvironment: (env) => set({ environment: env }),
      setRobotOpacity: (opacity) => set({ robotOpacity: opacity }),
      setShowPerf: (show) => set({ showPerf: show }),
      setPreferredUnit: (unit) => set({ preferredUnit: unit }),
      setShowIKTarget: (show) => set({ showIKTarget: show }),
      setShowIKMarker: (show) => set({ showIKMarker: show }),
      setShowLinkLabels: (show) => set({ showLinkLabels: show }),
      setShowGripperCoords: (show) => set({ showGripperCoords: show }),
    }),
    {
      name: "display-settings",
    },
  ),
);
