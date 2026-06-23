import { RiEye2Line } from "@remixicon/react";
import GlassButton from "./GlassButton";

interface DisplayControlButtonProps {
  showControlPanel: boolean;
  onToggleControlPanel: () => void;
}

export default function DisplayControlButton({
  showControlPanel,
  onToggleControlPanel,
}: DisplayControlButtonProps) {
  return (
    <GlassButton
      onClick={onToggleControlPanel}
      icon={<RiEye2Line size={24} />}
      tooltip="Display Settings"
      pressed={showControlPanel}
    />
  );
}
