import React from "react";
import { Maximize } from "lucide-react";
import GlassButton from "./GlassButton";

type CollisionControlButtonProps = {
  showControlPanel: boolean;
  onToggleControlPanel: () => void;
};

export default function CollisionControlButton({
  showControlPanel,
  onToggleControlPanel,
}: CollisionControlButtonProps) {
  return (
    <GlassButton
      onClick={onToggleControlPanel}
      icon={<Maximize size={24} />}
      tooltip="Collision Bounding Box Editor"
      pressed={showControlPanel}
    />
  );
}
