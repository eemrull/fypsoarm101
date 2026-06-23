import React from "react";
import { Box } from "lucide-react";
import GlassButton from "./GlassButton";

type PhysicsControlButtonProps = {
  showControlPanel: boolean;
  onToggleControlPanel: () => void;
};

export default function PhysicsControlButton({
  showControlPanel,
  onToggleControlPanel,
}: PhysicsControlButtonProps) {
  return (
    <GlassButton
      onClick={onToggleControlPanel}
      icon={<Box size={24} />}
      tooltip="Physics Box Config"
      pressed={showControlPanel}
    />
  );
}
