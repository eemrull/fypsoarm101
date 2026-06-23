import React from "react";
import GlassButton from "./GlassButton";
import { RiRefreshLine } from "@remixicon/react";
import { resetPanelLayout } from "@/lib/panelSettings";

export default function ResetLayoutButton({ robotName }: { robotName: string }) {
  const handleReset = () => {
    if (confirm("Reset all panels to default layout?")) {
      resetPanelLayout(robotName, { resetVisibility: true });
      window.location.reload();
    }
  };
  return (
    <GlassButton
      onClick={handleReset}
      icon={<RiRefreshLine size={24} />}
      tooltip="Reset Layout"
      pressed={false}
    />
  );
}