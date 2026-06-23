/** 6-dot grip indicator for draggable panel headers */
export function GripDots() {
  return (
    <svg
      width="8"
      height="14"
      viewBox="0 0 8 14"
      className="text-zinc-500 flex-shrink-0"
    >
      <circle cx="2" cy="2" r="1.2" fill="currentColor" />
      <circle cx="6" cy="2" r="1.2" fill="currentColor" />
      <circle cx="2" cy="7" r="1.2" fill="currentColor" />
      <circle cx="6" cy="7" r="1.2" fill="currentColor" />
      <circle cx="2" cy="12" r="1.2" fill="currentColor" />
      <circle cx="6" cy="12" r="1.2" fill="currentColor" />
    </svg>
  );
}
