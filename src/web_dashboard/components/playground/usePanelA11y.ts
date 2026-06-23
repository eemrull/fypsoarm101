"use client";

import { useEffect } from "react";

/**
 * Adds a consistent Escape-to-close behavior to floating panels.
 */
export function useCloseOnEscape(
  enabled: boolean,
  onClose: () => void,
): void {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabled, onClose]);
}
