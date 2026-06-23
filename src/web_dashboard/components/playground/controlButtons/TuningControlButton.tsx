import GlassButton from "./GlassButton";
import { RiSettings3Line } from "@remixicon/react";

type TuningControlButtonProps = {
  showControlPanel: boolean;
  onToggleControlPanel: () => void;
};

export default function TuningControlButton({
  showControlPanel,
  onToggleControlPanel,
}: TuningControlButtonProps) {
  return (
    <GlassButton
      onClick={onToggleControlPanel}
      icon={<RiSettings3Line size={24} />}
      tooltip="Gripper Tuning"
      pressed={showControlPanel}
    />
  );
}
