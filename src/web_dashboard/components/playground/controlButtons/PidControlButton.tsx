"use client";

import GlassButton from "./GlassButton";
import { RiPulseLine } from "@remixicon/react";

interface PidControlButtonProps {
  showControlPanel: boolean;
  onToggleControlPanel: () => void;
}

export function PidControlButton({
  showControlPanel,
  onToggleControlPanel,
}: PidControlButtonProps) {
  return (
    <GlassButton
      onClick={onToggleControlPanel}
      icon={<RiPulseLine size={24} />}
      tooltip="PID Step Response"
      pressed={showControlPanel}
    />
  );
}
