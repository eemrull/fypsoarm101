import React from "react";
import { Video } from "lucide-react";
import GlassButton from "./GlassButton";

type CameraButtonProps = {
  showControlPanel: boolean;
  onToggleControlPanel: () => void;
};

export default function CameraButton({
  showControlPanel,
  onToggleControlPanel,
}: CameraButtonProps) {
  return (
    <GlassButton
      onClick={onToggleControlPanel}
      icon={<Video size={24} />}
      tooltip="Camera Feed"
      pressed={showControlPanel}
    />
  );
}
