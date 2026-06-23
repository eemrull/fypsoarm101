"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Rnd } from "react-rnd";
import { CAMERA_STREAM_URL, CAMERA_STREAM_URL_2 } from "@/config/network";
import {
  panelStyle,
  panelHeaderClass,
  panelCloseButtonClass,
  panelIconButtonClass,
} from "@/components/playground/panelStyle";
import { GripDots } from "@/components/playground/GripDots";
import { useCloseOnEscape } from "@/components/playground/usePanelA11y";
import {
  getPanelPosition,
  setPanelPosition,
  getPanelSize,
  setPanelSize,
  getDefaultPanelPosition,
} from "@/lib/panelSettings";
import {
  Maximize2,
  Minimize2,
  VideoOff,
  LayoutGrid,
  Rows,
  RefreshCw,
} from "lucide-react";

const PANEL_ID = "cameraFeed";

// ─── Reusable single-stream component ──────────────────────────────────────
type CameraStreamProps = {
  url: string;
  label: string;
  className?: string;
  /** When true the image stretches to fill container */
  fill?: boolean;
  envVarName?: string;
};

function CameraStream({ url, label, className = "", fill, envVarName = "NEXT_PUBLIC_CAMERA_URL" }: CameraStreamProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Reset when URL changes
  useEffect(() => {
    setIsLoaded(false);
    setHasError(false);
  }, [url]);

  const retry = useCallback(() => {
    setHasError(false);
    setIsLoaded(false);
  }, []);

  if (!url) {
    return (
      <div
        className={`flex flex-col items-center justify-center py-6 px-3 text-center ${className}`}
      >
        <VideoOff size={24} className="text-zinc-600 mb-1.5" />
        <p className="text-xs text-zinc-500">No URL for {label}</p>
        <p className="text-[10px] text-zinc-600 mt-0.5">
          Set{" "}
          <code className="text-zinc-400 bg-black/30 px-1 rounded">
            {envVarName}
          </code>
        </p>
      </div>
    );
  }

  if (hasError) {
    return (
      <div
        className={`flex flex-col items-center justify-center py-6 px-3 text-center ${className}`}
      >
        <VideoOff size={24} className="text-red-500/60 mb-1.5" />
        <p className="text-xs text-red-400">{label} unavailable</p>
        <p className="text-[10px] text-zinc-600 mt-0.5 font-mono truncate max-w-full">
          {url}
        </p>
        <button
          type="button"
          onClick={retry}
          className="mt-1.5 text-[10px] text-indigo-400 hover:text-indigo-300 underline inline-flex items-center gap-1"
        >
          <RefreshCw size={10} /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* Status dot */}
      <div className="absolute top-1.5 left-1.5 z-10 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm rounded-full px-1.5 py-0.5">
        <div
          className={`w-1.5 h-1.5 rounded-full ${
            isLoaded
              ? "bg-emerald-400 shadow-[0_0_4px_theme(colors.emerald.400)]"
              : "bg-amber-400 animate-pulse"
          }`}
        />
        <span className="text-[9px] text-zinc-300 font-medium">{label}</span>
      </div>

      {/* Loading spinner */}
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <div className="w-5 h-5 rounded-full border-2 border-zinc-700 border-t-indigo-500 animate-spin" />
        </div>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={`Live ${label} feed`}
        className={`block transition-opacity duration-300 ${
          isLoaded ? "opacity-100" : "opacity-0"
        } ${fill ? "w-full h-full object-fill" : "w-full object-contain"}`}
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
      />
    </div>
  );
}

// ─── Status dot helper ─────────────────────────────────────────────────────
function StreamStatusDot({
  url,
  isLoaded,
  hasError,
}: {
  url: string;
  isLoaded: boolean;
  hasError: boolean;
}) {
  if (!url)
    return (
      <div className="w-2 h-2 rounded-full bg-zinc-600" title="Not configured" />
    );
  if (hasError)
    return (
      <div className="w-2 h-2 rounded-full bg-red-400 shadow-[0_0_6px_theme(colors.red.400)]" />
    );
  if (!isLoaded)
    return <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />;
  return (
    <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_theme(colors.emerald.400)]" />
  );
}

// ─── Main Panel ────────────────────────────────────────────────────────────
type CameraFeedProps = {
  show: boolean;
  onHide: () => void;
  robotName: string;
  streamUrl?: string;
  streamUrl2?: string;
};

type LayoutMode = "grid" | "stacked";

export const CameraFeed = React.memo(function CameraFeed({
  show,
  onHide,
  robotName,
  streamUrl,
  streamUrl2,
}: CameraFeedProps) {
  useCloseOnEscape(show, onHide);

  const url1 = streamUrl || CAMERA_STREAM_URL;
  const url2 = streamUrl2 || CAMERA_STREAM_URL_2;
  const hasCam2 = !!url2;
  const camCount = hasCam2 ? 2 : 1;

  const [isLoaded1, setIsLoaded1] = useState(false);
  const [hasError1, setHasError1] = useState(false);
  const [isLoaded2, setIsLoaded2] = useState(false);
  const [hasError2, setHasError2] = useState(false);

  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedCam, setExpandedCam] = useState<1 | 2>(1);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("grid");

  const [position, setPosition] = useState<
    { x: number; y: number } | undefined
  >();
  const [size, setSize] = useState<
    { width: number | string; height: number | string } | undefined
  >();

  // Load saved position/size
  useEffect(() => {
    if (show) {
      const p =
        getPanelPosition(PANEL_ID, robotName) ??
        getDefaultPanelPosition(PANEL_ID);
      const s = getPanelSize(PANEL_ID, robotName);
      setPosition(p);
      setSize(s);
    }
  }, [show, robotName]);

  // Reset stream state when URL changes
  useEffect(() => {
    setIsLoaded1(false);
    setHasError1(false);
  }, [url1]);

  useEffect(() => {
    setIsLoaded2(false);
    setHasError2(false);
  }, [url2]);

  if (!show || !position || !size) return null;

  // ─── Expanded fullscreen overlay ──────────────────────────────────────
  if (isExpanded) {
    const primaryUrl = expandedCam === 1 ? url1 : url2;
    const secondaryUrl = expandedCam === 1 ? url2 : url1;
    const primaryLabel = expandedCam === 1 ? "Cam 1" : "Cam 2";
    const secondaryLabel = expandedCam === 1 ? "Cam 2" : "Cam 1";

    return (
      <>
        <div
          className="fixed inset-0 bg-black/70 z-[9998] backdrop-blur-sm"
          onClick={() => setIsExpanded(false)}
        />
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999] w-[85vw] max-w-[1100px] rounded-2xl overflow-hidden border border-white/20 bg-zinc-950/95 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/80 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-300">
                📹 {primaryLabel} — Expanded
              </span>
              {hasCam2 && (
                <button
                  type="button"
                  onClick={() => setExpandedCam(expandedCam === 1 ? 2 : 1)}
                  className={`${panelIconButtonClass} h-6 px-2 text-[10px] font-medium`}
                >
                  Switch to {secondaryLabel}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setIsExpanded(false)}
              className={`${panelIconButtonClass} h-7 w-7`}
              aria-label="Minimize"
            >
              <Minimize2 size={14} />
            </button>
          </div>

          {/* Main feed */}
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={primaryUrl}
              alt={`${primaryLabel} feed`}
              className="w-full block bg-black"
              onLoad={() =>
                expandedCam === 1
                  ? setIsLoaded1(true)
                  : setIsLoaded2(true)
              }
              onError={() =>
                expandedCam === 1
                  ? setHasError1(true)
                  : setHasError2(true)
              }
            />

            {/* PiP thumbnail of the other camera */}
            {hasCam2 && secondaryUrl && (
              <button
                type="button"
                onClick={() => setExpandedCam(expandedCam === 1 ? 2 : 1)}
                className="absolute bottom-3 right-3 w-[160px] rounded-lg overflow-hidden border-2 border-white/30 shadow-xl hover:border-indigo-400 transition-colors cursor-pointer group"
                title={`Switch to ${secondaryLabel}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={secondaryUrl}
                  alt={`${secondaryLabel} PiP`}
                  className="w-full block bg-black"
                />
                <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                  <span className="text-[9px] text-white font-semibold bg-black/50 px-1.5 py-0.5 rounded">
                    {secondaryLabel}
                  </span>
                </div>
              </button>
            )}
          </div>
        </div>
      </>
    );
  }

  // ─── Normal panel view ────────────────────────────────────────────────
  return (
    <Rnd
      default={{
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
      }}
      position={position}
      size={size}
      minWidth={hasCam2 ? 340 : 240}
      minHeight={hasCam2 ? 220 : 180}
      bounds="window"
      enableResizing={true}
      dragHandleClassName="panel-drag-handle"
      onDragStop={(_e, d) => {
        const nextPos = setPanelPosition(
          PANEL_ID,
          { x: d.x, y: d.y },
          robotName,
        );
        setPosition(nextPos);
      }}
      onResizeStop={(_e, _dir, ref, _delta, pos) => {
        const nextSize = {
          width: ref.offsetWidth,
          height: ref.offsetHeight,
        };
        setPanelSize(PANEL_ID, nextSize, robotName);
        setSize(nextSize);
        const clampedPos = setPanelPosition(
          PANEL_ID,
          { x: pos.x, y: pos.y },
          robotName,
        );
        setPosition(clampedPos);
      }}
      className={`${panelStyle} rnd-viewport-clamp !z-[60]`}
      style={{ position: "absolute" }}
    >
      <div className="flex flex-col h-full relative z-10 panel-scale-content">
        {/* Header — drag handle */}
        <div className={panelHeaderClass}>
          <span className="flex items-center gap-2">
            <GripDots />
            <span>📹 Camera</span>
            {/* Camera count badge */}
            <span className="inline-flex items-center justify-center min-w-[1.25em] h-[1.25em] rounded-full bg-indigo-500/30 border border-indigo-400/40 text-[9px] font-bold text-indigo-300 leading-none px-0.5">
              {camCount}
            </span>
            {/* Status dots */}
            <StreamStatusDot
              url={url1}
              isLoaded={isLoaded1}
              hasError={hasError1}
            />
            {hasCam2 && (
              <StreamStatusDot
                url={url2}
                isLoaded={isLoaded2}
                hasError={hasError2}
              />
            )}
          </span>

          <div className="flex items-center gap-1">
            {/* Layout toggle — only show if 2 cameras */}
            {hasCam2 && (
              <button
                type="button"
                onClick={() =>
                  setLayoutMode(layoutMode === "grid" ? "stacked" : "grid")
                }
                className={`${panelIconButtonClass} h-7 w-7`}
                aria-label={
                  layoutMode === "grid"
                    ? "Switch to stacked layout"
                    : "Switch to grid layout"
                }
                title={
                  layoutMode === "grid" ? "Stacked layout" : "Grid layout"
                }
              >
                {layoutMode === "grid" ? (
                  <Rows size={14} />
                ) : (
                  <LayoutGrid size={14} />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setExpandedCam(1);
                setIsExpanded(true);
              }}
              className={`${panelIconButtonClass} h-7 w-7`}
              aria-label="Expand"
            >
              <Maximize2 size={14} />
            </button>
            <button
              type="button"
              onClick={onHide}
              className={panelCloseButtonClass}
              aria-label="Close panel"
            >
              ×
            </button>
          </div>
        </div>

        {/* Stream content */}
        <div className="flex-1 min-h-0 relative rounded-lg overflow-hidden bg-black/40 border border-white/5">
          {hasCam2 ? (
            // ── Dual-camera layout ──
            <div
              className={`h-full ${
                layoutMode === "grid"
                  ? "grid grid-cols-2 gap-0.5"
                  : "flex flex-col gap-0.5"
              }`}
            >
              <div
                className="relative overflow-hidden bg-black cursor-pointer group"
                onClick={() => {
                  setExpandedCam(1);
                  setIsExpanded(true);
                }}
              >
                <CameraStream url={url1} label="Cam 1" fill />
                <div className="absolute inset-0 bg-transparent group-hover:bg-white/5 transition-colors" />
              </div>
              <div
                className="relative overflow-hidden bg-black cursor-pointer group"
                onClick={() => {
                  setExpandedCam(2);
                  setIsExpanded(true);
                }}
              >
                <CameraStream url={url2} label="Cam 2" fill envVarName="NEXT_PUBLIC_CAMERA_2_URL" />
                <div className="absolute inset-0 bg-transparent group-hover:bg-white/5 transition-colors" />
              </div>
            </div>
          ) : (
            // ── Single-camera layout ──
            <>
              {!url1 ? (
                <div className="flex flex-col items-center justify-center h-full py-8 px-4 text-center">
                  <VideoOff size={28} className="text-zinc-600 mb-2" />
                  <p className="text-xs text-zinc-500">
                    No camera URL configured.
                  </p>
                  <p className="text-[10px] text-zinc-600 mt-1">
                    Set{" "}
                    <code className="text-zinc-400 bg-black/30 px-1 rounded">
                      NEXT_PUBLIC_CAMERA_URL
                    </code>{" "}
                    env var
                  </p>
                </div>
              ) : hasError1 ? (
                <div className="flex flex-col items-center justify-center h-full py-8 px-4 text-center">
                  <VideoOff size={28} className="text-red-500/60 mb-2" />
                  <p className="text-xs text-red-400">
                    Camera stream unavailable
                  </p>
                  <p className="text-[10px] text-zinc-600 mt-1 font-mono">
                    {url1}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setHasError1(false);
                      setIsLoaded1(false);
                    }}
                    className="mt-2 text-[10px] text-indigo-400 hover:text-indigo-300 underline inline-flex items-center gap-1"
                  >
                    <RefreshCw size={10} /> Retry
                  </button>
                </div>
              ) : (
                <>
                  {!isLoaded1 && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <div className="w-6 h-6 rounded-full border-2 border-zinc-700 border-t-indigo-500 animate-spin" />
                    </div>
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url1}
                    alt="Live camera feed"
                    className={`w-full h-full object-fill block transition-opacity duration-300 ${
                      isLoaded1 ? "opacity-100" : "opacity-0"
                    }`}
                    onLoad={() => setIsLoaded1(true)}
                    onError={() => setHasError1(true)}
                  />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </Rnd>
  );
});
