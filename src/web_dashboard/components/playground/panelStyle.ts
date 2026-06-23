// Shared glassmorphism tokens for floating panels.
// Keep these centralized so all playground panels feel consistent.

export const panelStyle = [
  "panel-scale-container",
  "bg-zinc-950/24",
  "backdrop-blur-xl",
  "rounded-2xl",
  "border",
  "border-white/30",
  "shadow-[inset_0_1px_0px_rgba(255,255,255,0.28),0_16px_40px_rgba(0,0,0,0.35)]",
  "p-4",
  "text-white",
  "relative",
  "isolate",
  "overflow-hidden",
  "will-change-transform",
  "before:absolute",
  "before:inset-0",
  "before:rounded-[inherit]",
  "before:bg-gradient-to-br",
  "before:from-white/14",
  "before:via-transparent",
  "before:to-transparent",
  "before:opacity-70",
  "before:pointer-events-none",
  "after:absolute",
  "after:inset-0",
  "after:rounded-[inherit]",
  "after:bg-gradient-to-tl",
  "after:from-white/16",
  "after:via-transparent",
  "after:to-transparent",
  "after:opacity-32",
  "after:pointer-events-none",
].join(" ");

export const panelHeaderClass =
  "panel-drag-handle mb-3 border-b border-white/30 pb-2 font-semibold text-base flex justify-between items-center cursor-grab active:cursor-grabbing";

export const panelIconButtonClass =
  "inline-flex items-center justify-center rounded-md border border-white/20 bg-white/5 text-zinc-200 hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/80 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent transition-colors";

export const panelCloseButtonClass = `${panelIconButtonClass} h-8 w-8 text-lg leading-none`;

export const panelButtonClass =
  "rounded-md border border-white/20 bg-white/10 px-3 py-2 text-xs font-medium text-white hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/80 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent transition-colors";

export const panelPrimaryButtonClass =
  "rounded-md border border-blue-400/40 bg-blue-500/70 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500/85 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/80 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent transition-colors";

export const panelDangerButtonClass =
  "rounded-md border border-red-400/40 bg-red-500/70 px-3 py-2 text-xs font-semibold text-white hover:bg-red-500/85 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/80 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent transition-colors";

export const panelInputClass =
  "w-full rounded-md border border-white/20 bg-black/30 px-2 py-1.5 text-xs text-white outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/80 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent";

export const panelSelectClass = `${panelInputClass} appearance-none`;
