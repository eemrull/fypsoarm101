"use client";
import React, { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { useMetricsStore } from "@/store/useMetricsStore";

function SystemHealthBadge() {
  const bridgeLatency = useMetricsStore((state) => {
    const log = state.latencyLog;
    if (log.length === 0) return null;
    const last = log[log.length - 1];
    // If the last ping is older than 3 seconds, consider it offline
    if (Date.now() - last.timestamp > 3000) return null;
    return last.latencyMs;
  });

  // Force re-render to check timestamp staleness even if store hasn't updated
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  if (bridgeLatency === null) {
    return (
      <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-2.5 py-1 rounded-md pointer-events-auto" title="System Disconnected">
        <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
        <span className="text-[10px] text-zinc-400 font-mono tracking-widest uppercase">Offline</span>
      </div>
    );
  }

  const getStatusColor = () => {
    if (bridgeLatency < 30) return "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]";
    if (bridgeLatency < 100) return "bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.6)]";
    return "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]";
  };

  return (
    <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-2.5 py-1 rounded-md pointer-events-auto" title="System Health">
      <div className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
      <span className="text-[10px] text-zinc-300 font-mono tracking-widest uppercase truncate min-w-[36px]">
        {bridgeLatency.toFixed(0)} ms
      </span>
    </div>
  );
}

/** Auto-hide delay in ms — header hides after being idle this long on playground pages */
const AUTO_HIDE_DELAY_MS = 2000;
/** Height of the invisible hover trigger zone at the top of the viewport (px) */
const HOVER_TRIGGER_ZONE_PX = 16;

export default function Header() {
  const pathname = usePathname();
  const isPlayground = pathname?.startsWith("/play");

  // --- Auto-hide logic (only active on playground pages) ---
  const [visible, setVisible] = useState(true);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    if (!isPlayground) return;
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => setVisible(false), AUTO_HIDE_DELAY_MS);
  }, [isPlayground, clearHideTimer]);

  // Show header and reset timer on mouse enter
  const handleMouseEnter = useCallback(() => {
    clearHideTimer();
    setVisible(true);
  }, [clearHideTimer]);

  // Schedule hide on mouse leave (playground only)
  const handleMouseLeave = useCallback(() => {
    scheduleHide();
  }, [scheduleHide]);

  // On mount and route change: show header, schedule hide if playground
  useEffect(() => {
    setVisible(true);
    if (isPlayground) {
      scheduleHide();
    }
    return clearHideTimer;
  }, [isPlayground, scheduleHide, clearHideTimer]);

  // Global listener: reveal header when mouse is in the top trigger zone
  useEffect(() => {
    if (!isPlayground) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientY <= HOVER_TRIGGER_ZONE_PX) {
        clearHideTimer();
        setVisible(true);
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [isPlayground, clearHideTimer]);

  // --- Breadcrumbs ---
  // Build breadcrumb segments. On /play/* routes, skip the bare "play" segment
  // since /play has no page — link directly to the slug's full path instead.
  const rawSegments = pathname?.split("/").filter(Boolean) || [];
  const breadcrumbSegments = isPlayground
    ? rawSegments.filter((seg) => seg !== "play")
    : rawSegments;

  return (
    <>
      {/* Invisible hover trigger zone at the very top of the viewport */}
      {isPlayground && !visible && (
        <div
          className="fixed top-0 left-0 right-0 z-[60] pointer-events-auto"
          style={{ height: HOVER_TRIGGER_ZONE_PX }}
          onMouseEnter={handleMouseEnter}
        />
      )}

      <header
        ref={headerRef}
        className={`fixed top-0 left-0 right-0 z-50 pointer-events-auto h-14 transition-transform duration-300 ease-in-out ${
          isPlayground && !visible ? "-translate-y-full" : "translate-y-0"
        }`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <div className="absolute inset-0 bg-black/40 backdrop-blur-md border-b justify-center items-center flex border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.5)] pointer-events-none" />
        <div className="relative w-full h-full px-4 sm:px-6 flex justify-between items-center max-w-[1400px] mx-auto">
          
          {/* Left: Breadcrumbs */}
          <nav className="flex items-center space-x-1.5 text-sm font-medium tracking-wide">
            <Link
              href="/"
              className="flex items-center justify-center w-8 h-8 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Home"
            >
              <Home className="w-4 h-4" />
            </Link>
            
            {breadcrumbSegments.length > 0 && (
              <ChevronRight className="w-4 h-4 text-zinc-600" />
            )}

            {breadcrumbSegments.map((segment, index) => {
              const isLast = index === breadcrumbSegments.length - 1;
              // Reconstruct the actual href from the original raw path
              const rawIndex = rawSegments.indexOf(segment);
              const href = "/" + rawSegments.slice(0, rawIndex + 1).join("/");
              const label = segment.charAt(0).toUpperCase() + segment.slice(1).replace("-", " ");

              return (
                <div key={href} className="flex items-center space-x-1.5">
                  {isLast ? (
                    <span className="text-zinc-100 px-2 py-1 bg-white/5 rounded-md border border-white/5">
                      {label}
                    </span>
                  ) : (
                    <>
                      <Link
                        href={href}
                        className="text-zinc-400 hover:text-white transition-colors px-2 py-1 rounded-md hover:bg-white/5"
                      >
                        {label}
                      </Link>
                      <ChevronRight className="w-4 h-4 text-zinc-600" />
                    </>
                  )}
                </div>
              );
            })}
          </nav>

          {/* Right: Global Navigation Links & System Health */}
          <div className="flex gap-3 items-center">
            {isPlayground && <SystemHealthBadge />}
            <div className="flex gap-1 items-center ml-2 border-l border-white/10 pl-3">
              <Link
                href="/docs"
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  pathname === "/docs" ? "text-indigo-300 bg-indigo-500/10" : "text-zinc-400 hover:text-white hover:bg-white/10"
                }`}
              >
                Docs
              </Link>
              <Link
                href="/methodology"
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  pathname === "/methodology" ? "text-indigo-300 bg-indigo-500/10" : "text-zinc-400 hover:text-white hover:bg-white/10"
                }`}
              >
                Methodology
              </Link>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
