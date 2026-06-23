import GlassButton from "./GlassButton";
import { RiPlayListAddLine } from "@remixicon/react";

interface ArmTestButtonProps {
  showControlPanel: boolean;
  onToggleControlPanel: () => void;
}

export default function ArmTestButton({
  showControlPanel,
  onToggleControlPanel,
}: ArmTestButtonProps) {
  return (
    <GlassButton
      onClick={onToggleControlPanel}
      icon={<RiPlayListAddLine size={24} />}
      tooltip="Waypoints"
      pressed={showControlPanel}
    />
  );
}
