"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Video,
  Maximize2,
  Minimize2,
  Info,
  Pause,
  Play,
  Target,
  RefreshCw,
} from "lucide-react";
import { ObservationRecord } from "../lib/types";
import { api } from "../lib/api";

interface LiveCameraCardProps {
  isUpstreamLive: boolean;
  latestObservation?: ObservationRecord | null;
  onMaximizeToggle?: () => void;
  isMaximized?: boolean;
}

export const LiveCameraCard: React.FC<LiveCameraCardProps> = ({
  isUpstreamLive,
  latestObservation,
  onMaximizeToggle,
  isMaximized = false,
}) => {
  const [useWebSocket, setUseWebSocket] = useState<boolean>(true);
  const [httpStreamUrl, setHttpStreamUrl] = useState<string>(() => api.getStreamUrl());
  const [wsFrameUrl, setWsFrameUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isError, setIsError] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [showTechnicalDrawer, setShowTechnicalDrawer] = useState<boolean>(false);
  const [autoHoldOnDetection, setAutoHoldOnDetection] = useState<boolean>(false);
  const [detectedToast, setDetectedToast] = useState<string | null>(null);
  const [currentTimeUtc, setCurrentTimeUtc] = useState<string>("");
  const [isFullscreenModal, setIsFullscreenModal] = useState<boolean>(false);

  const prevUrlRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const lastObsIdRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const isPausedRef = useRef<boolean>(isPaused);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Live UTC Clock for camera overlay
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTimeUtc(
        now.toISOString().replace("T", " ").substring(0, 19) + " UTC"
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Spacebar toggle pause/resume
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        setIsPaused((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Continuous live feed on face detection: notify without freezing stream
  useEffect(() => {
    if (!latestObservation) return;
    if (
      lastObsIdRef.current !== null &&
      latestObservation.id !== lastObsIdRef.current &&
      latestObservation.review_status === "unreviewed"
    ) {
      // Show HUD alert badge for 4s while stream keeps running smoothly
      setDetectedToast(latestObservation.obs_code || "PERSON DETECTED");
      const timer = setTimeout(() => {
        setDetectedToast(null);
      }, 4000);

      // Never auto-pause unless operator explicitly checked auto-hold
      if (autoHoldOnDetection) {
        setIsPaused(true);
      }
      return () => clearTimeout(timer);
    }
    lastObsIdRef.current = latestObservation.id;
  }, [latestObservation, autoHoldOnDetection]);

  // Clean up object URLs and reconnect timers
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // WebSocket frame connection with continuous auto-reconnect
  const connectWebSocket = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsLoading(true);

    try {
      const wsUrl = api.getWsStreamUrl();
      const ws = new WebSocket(wsUrl);
      ws.binaryType = "blob";
      wsRef.current = ws;

      ws.onopen = () => {
        setIsLoading(false);
        setIsError(false);
      };

      ws.onmessage = (event) => {
        if (isPausedRef.current) return;
        if (event.data instanceof Blob) {
          const url = URL.createObjectURL(event.data);
          const oldUrl = prevUrlRef.current;
          prevUrlRef.current = url;
          setWsFrameUrl(url);

          // Give browser 1000ms to decode and paint before revoking old blob
          if (oldUrl) {
            setTimeout(() => {
              try {
                URL.revokeObjectURL(oldUrl);
              } catch {}
            }, 1000);
          }
          setIsLoading(false);
          setIsError(false);
        }
      };

      let hasScheduledReconnect = false;
      const scheduleReconnect = () => {
        if (hasScheduledReconnect) return;
        hasScheduledReconnect = true;
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, 3000);
      };

      ws.onclose = () => {
        scheduleReconnect();
      };

      ws.onerror = () => {
        scheduleReconnect();
      };
    } catch {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        connectWebSocket();
      }, 3000);
    }
  }, []);

  useEffect(() => {
    if (useWebSocket) {
      connectWebSocket();
    } else {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    }
  }, [useWebSocket, connectWebSocket]);

  const reloadStream = () => {
    if (useWebSocket) {
      connectWebSocket();
    } else {
      setHttpStreamUrl(api.getStreamUrl() + `?t=${Date.now()}`);
      setIsLoading(true);
      setIsError(false);
    }
  };

  const activeImageSource = useWebSocket ? wsFrameUrl : httpStreamUrl;

  return (
    <div className="rounded-md border border-[#D8D9D1] bg-[#FFFFFF] overflow-hidden flex flex-col justify-between shadow-xs">
      {/* Card Header */}
      <div className="px-4 py-2.5 border-b border-[#D8D9D1] flex items-center justify-between gap-3 bg-[#FFFFFF]">
        {/* Left: Camera Icon & Title */}
        <div className="flex items-center gap-2.5">
          <Video className="w-4 h-4 text-[#285B49]" />
          <div>
            <h3 className="text-xs font-semibold text-[#242820] tracking-tight font-sans">
              Optical Camera Stream
            </h3>
            <p className="text-[11px] text-[#6C7068]">
              OAK-D RGB • Primary Scene Reference
            </p>
          </div>
        </div>

        {/* Right: Status badge & Controls */}
        <div className="flex items-center gap-2">
          {/* Status Badge */}
          <span className="px-2 py-0.5 rounded text-[11px] font-mono border border-[#D8D9D1] bg-[#EAE9E2] flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isUpstreamLive ? "bg-[#285B49]" : "bg-[#B77927]"
              }`}
            />
            <span className={isUpstreamLive ? "text-[#285B49] font-medium" : "text-[#6C7068]"}>
              {isUpstreamLive ? "LIVE STREAM" : "STANDBY"}
            </span>
          </span>

          {/* Auto-Hold Toggle Button */}
          <button
            onClick={() => setAutoHoldOnDetection(!autoHoldOnDetection)}
            className={`px-2 py-1 rounded border text-xs font-medium transition cursor-pointer flex items-center gap-1 ${
              autoHoldOnDetection
                ? "bg-[#285B49]/10 border-[#285B49]/40 text-[#285B49]"
                : "bg-[#EAE9E2] border-[#D8D9D1] text-[#6C7068] hover:text-[#242820]"
            }`}
            title="Auto-hold stream upon detection"
          >
            <Target className="w-3 h-3" />
            <span className="text-[10px] hidden sm:inline">Auto-Hold</span>
          </button>

          {/* Pause / Resume Button */}
          <button
            onClick={() => setIsPaused(!isPaused)}
            className={`p-1.5 rounded border text-xs transition cursor-pointer ${
              isPaused
                ? "bg-[#B77927]/10 border-[#B77927]/40 text-[#B77927]"
                : "bg-[#EAE9E2] border-[#D8D9D1] text-[#6C7068] hover:text-[#242820]"
            }`}
            title={isPaused ? "Resume video stream [SPACE]" : "Freeze frame [SPACE]"}
          >
            {isPaused ? (
              <Play className="w-3 h-3 fill-current text-[#285B49]" />
            ) : (
              <Pause className="w-3 h-3 text-[#6C7068]" />
            )}
          </button>

          {/* Technical Specs Toggle */}
          <button
            onClick={() => setShowTechnicalDrawer(!showTechnicalDrawer)}
            className="p-1.5 rounded bg-[#EAE9E2] border border-[#D8D9D1] text-[#6C7068] hover:text-[#242820] transition cursor-pointer"
            title="Toggle Stream Details"
          >
            <Info className="w-3 h-3" />
          </button>

          {/* Fullscreen Button */}
          <button
            onClick={() => setIsFullscreenModal(!isFullscreenModal)}
            className="p-1.5 rounded bg-[#EAE9E2] border border-[#D8D9D1] text-[#6C7068] hover:text-[#242820] transition cursor-pointer"
            title="Toggle Fullscreen"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Technical Information Drawer */}
      {showTechnicalDrawer && (
        <div className="bg-[#EAE9E2] border-b border-[#D8D9D1] px-4 py-2 text-xs font-mono text-[#242820] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[#6C7068]">Topic:</span>
            <span>/oak/rgb/image_raw</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[#6C7068]">Transport:</span>
            <span>{useWebSocket ? "Binary WebSocket" : "HTTP MJPEG"}</span>
            <button
              onClick={() => setUseWebSocket(!useWebSocket)}
              className="text-[10px] px-1.5 py-0.5 rounded border border-[#D8D9D1] bg-[#FFFFFF] text-[#285B49] hover:bg-[#F3F2ED]"
            >
              Switch
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[#6C7068]">Auto-Hold:</span>
            <span className={autoHoldOnDetection ? "text-[#285B49] font-bold" : "text-[#6C7068]"}>
              {autoHoldOnDetection ? "ENABLED" : "DISABLED"}
            </span>
          </div>
          <button
            onClick={reloadStream}
            className="text-xs text-[#6C7068] hover:text-[#242820] flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Reconnect</span>
          </button>
        </div>
      )}

      {/* Camera Viewport */}
      <div className="relative aspect-[16/10] bg-[#121411] overflow-hidden flex items-center justify-center">
        {activeImageSource ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={activeImageSource}
            alt="Live Robot Camera View"
            className="w-full h-full object-cover"
            onLoad={() => {
              setIsLoading(false);
              setIsError(false);
            }}
            onError={() => {
              if (!useWebSocket) {
                setIsError(true);
              }
            }}
          />
        ) : (
          <div className="relative w-full h-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/evidence/obs_person.jpg"
              alt="Disaster Zone Operation Feed"
              className="w-full h-full object-cover"
            />
            <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/70 border border-slate-700 text-[10px] font-mono text-[#DCDDD5]">
              OPTICAL FEED • STANDBY REFERENCE
            </div>
          </div>
        )}

        {/* Detection Notification Banner (Feed Continues Live) */}
        {detectedToast && (
          <div className="absolute top-3 inset-x-0 mx-auto w-fit px-3 py-1.5 rounded bg-[#285B49] border border-white/20 text-white text-xs font-mono font-medium shadow-lg flex items-center gap-2 z-20 animate-fade-in">
            <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
            <span>[SURVIVOR DETECTED] • LOGGED ({detectedToast})</span>
          </div>
        )}

        {/* Stream Paused Banner */}
        {isPaused && (
          <div className="absolute top-3 inset-x-0 mx-auto w-fit px-3 py-1 rounded bg-[#B77927] text-white text-xs font-mono font-medium shadow-md">
            STREAM PAUSED — PRESS SPACE TO RESUME
          </div>
        )}

        {/* Bottom Left Timestamp Overlay */}
        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 text-[#DCDDD5] text-[10px] font-mono pointer-events-none">
          {currentTimeUtc || "2026-10-21 13:01:28 UTC"}
        </div>

        {/* Bottom Right Format/Resolution Overlay */}
        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/60 text-[#DCDDD5] text-[10px] font-mono pointer-events-none">
          640 × 400 • OAK-D RGB
        </div>
      </div>

      {/* Fullscreen Overlay Modal */}
      {isFullscreenModal && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-white">
                Optical Feed Fullscreen • OAK-D RGB
              </span>
            </div>
            <button
              onClick={() => setIsFullscreenModal(false)}
              className="p-1.5 rounded bg-white/10 text-white hover:bg-white/20 transition cursor-pointer"
            >
              <Minimize2 className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 relative rounded overflow-hidden bg-black flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeImageSource && !isError ? activeImageSource : "/evidence/obs_person.jpg"}
              alt="Full Camera View"
              className="w-full h-full object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
};
