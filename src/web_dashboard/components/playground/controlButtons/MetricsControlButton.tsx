import { RiBarChartLine } from "@remixicon/react";
import GlassButton from "./GlassButton";

interface MetricsControlButtonProps {
  showControlPanel: boolean;
  onToggleControlPanel: () => void;
}

export default function MetricsControlButton({
  showControlPanel,
  onToggleControlPanel,
}: MetricsControlButtonProps) {
  return (
    <GlassButton
      onClick={onToggleControlPanel}
      icon={<RiBarChartLine size={24} />}
      tooltip="IK Analyser"
      pressed={showControlPanel}
    />
  );
}
