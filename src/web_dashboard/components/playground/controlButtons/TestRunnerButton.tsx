import { FlaskConical } from "lucide-react";
import GlassButton from "./GlassButton";

interface TestRunnerButtonProps {
  showControlPanel: boolean;
  onToggleControlPanel: () => void;
}

export default function TestRunnerButton({
  showControlPanel,
  onToggleControlPanel,
}: TestRunnerButtonProps) {
  return (
    <GlassButton
      onClick={onToggleControlPanel}
      icon={<FlaskConical size={24} />}
      tooltip="FYP Test Suite"
      pressed={showControlPanel}
    />
  );
}
