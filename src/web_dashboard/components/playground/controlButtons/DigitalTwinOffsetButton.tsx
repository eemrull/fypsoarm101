import React from "react";
import { RiPinDistanceLine } from "@remixicon/react";
import GlassButton from "./GlassButton";

type DigitalTwinOffsetButtonProps = {
  isOpen: boolean;
  onClick: () => void;
};

export default function DigitalTwinOffsetButton({ isOpen, onClick }: DigitalTwinOffsetButtonProps) {
  return (
    <GlassButton
      onClick={onClick}
      icon={<RiPinDistanceLine size={24} />}
      tooltip="Digital Twin Calibration"
      pressed={isOpen}
    />
  );
}
