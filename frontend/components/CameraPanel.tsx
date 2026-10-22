"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Video,
  RefreshCw,
  AlertTriangle,
  Play,
  Pause,
  Info,
  Zap,
  Target,
} from "lucide-react";
import { ObservationRecord } from "../lib/types";
import { api } from "../lib/api";

interface CameraPanelProps {
  isUpstreamLive: boolean;
  latestObservation?: ObservationRecord | null;
}

export const CameraPanel: React.FC<CameraPanelProps> = ({
  isUpstreamLive,
  latestObservation,
}) => {
  const [useWebSocket, setUseWebSocket] = useState<boolean>(true);
  const [httpStreamUrl, setHttpStreamUrl] = useState<string>(() => api.getStreamUrl());
  const [wsFrameUrl, setWsFrameUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isError, setIsError] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [showInfo, setShowInfo] = useState<boolean>(false);
  const [fps, setFps] = useState<number>(0);

  // Auto-hold on face detection feature
  const [autoHoldOnDetection, setAutoHoldOnDetection] = useState<boolean>(true);
  const [isTargetLocked, setIsTargetLocked] = useState<boolean>(false);
  const [lockedObsCode, setLockedObsCode] = useState<string | null>(null);

  const prevUrlRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const frameCountRef = useRef<number>(0);
  const lastFpsCalcTime = useRef<number>(0);
  const isPausedRef = useRef<boolean>(isPaused);
  const lastObsIdRef = useRef<string | null>(null);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // Keyboard shortcut: Spacebar to toggle Pause / Resume
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        setIsPaused((prev) => {
          const next = !prev;
          if (!next) {
            setIsTargetLocked(false);
          }
          return next;
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Auto-hold stream when a new unreviewed face observation is detected
  useEffect(() => {
    if (!latestObservation) return;

    if (
      lastObsIdRef.current !== null &&
      latestObservation.id !== lastObsIdRef.current &&
      latestObservation.review_status === "unreviewed"
    ) {
      if (autoHoldOnDetection) {
        setIsPaused(true);
        setIsTargetLocked(true);
        setLockedObsCode(latestObservation.obs_code);
      }
    }
    lastObsIdRef.current = latestObservation.id;
  }, [latestObservation, autoHoldOnDetection]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (prevUrlRef.current) {
        URL.revokeObjectURL(prevUrlRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // WebSocket frame connection
  const connectWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsLoading(true);
    setIsError(false);

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

        // Calculate FPS
        frameCountRef.current += 1;
        const now = Date.now();
        if (lastFpsCalcTime.current === 0) {
          lastFpsCalcTime.current = now;
        } else if (now - lastFpsCalcTime.current >= 1000) {
          setFps(frameCountRef.current);
          frameCountRef.current = 0;
          lastFpsCalcTime.current = now;
        }

        // Render binary frame
        const blob = event.data as Blob;
        const url = URL.createObjectURL(blob);
        if (prevUrlRef.current) {
          URL.revokeObjectURL(prevUrlRef.current);
        }
        prevUrlRef.current = url;
        setWsFrameUrl(url);
        setIsLoading(false);
      };

      ws.onerror = () => {
        setIsError(true);
      };

      ws.onclose = () => {
        // Retry logic or standby
      };
    } catch {
      setIsError(true);
      setIsLoading(false);
    }
  }, []);

  // Connect or disconnect WS when toggled
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (useWebSocket) {
      timer = setTimeout(() => {
        connectWebSocket();
      }, 0);
    } else {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      timer = setTimeout(() => {
        setWsFrameUrl(null);
        setHttpStreamUrl(`${api.getStreamUrl()}?t=${Date.now()}`);
        setIsLoading(true);
        setIsError(false);
      }, 0);
    }
    return () => {
      clearTimeout(timer);
    };
  }, [useWebSocket, connectWebSocket]);

  const reloadStream = () => {
    setIsPaused(false);
    setIsTargetLocked(false);
    if (useWebSocket) {
      connectWebSocket();
    } else {
      setIsLoading(true);
      setIsError(false);
      setHttpStreamUrl(`${api.getStreamUrl()}?t=${Date.now()}`);
    }
  };

  const handleResume = () => {
    setIsPaused(false);
    setIsTargetLocked(false);
  };

  const activeImageSource = useWebSocket ? wsFrameUrl : httpStreamUrl;

  return (
    <div className="rounded-lg border border-slate-800 bg-[#0c1220] flex flex-col overflow-hidden shadow-lg">
      {/* Panel Header */}
      <div className="px-4 py-2.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-900/60">
        <div className="flex items-center gap-2">
          <Video className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-semibold tracking-wide text-slate-200 uppercase font-mono">
            Optical Sensor Stream
          </h2>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
            {useWebSocket ? "WS PIPE / LOW-LATENCY" : "HTTP MJPEG"}
          </span>
          {isPaused && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-700 animate-pulse font-bold">
              STREAM PAUSED
            </span>
          )}
        </div>

        {/* Stream Actions */}
        <div className="flex items-center gap-2">
          {/* Auto-Hold on Detection Toggle */}
          <button
            onClick={() => setAutoHoldOnDetection(!autoHoldOnDetection)}
            className={`px-2 py-1 rounded border text-[10px] font-mono transition cursor-pointer flex items-center gap-1.5 ${
              autoHoldOnDetection
                ? "bg-cyan-950 border-cyan-600 text-cyan-200 shadow-[0_0_8px_rgba(6,182,212,0.2)]"
                : "bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200"
            }`}
            title="When active, automatically freezes stream frame when a person is detected for inspection"
          >
            <Target className="w-3 h-3 text-cyan-400" />
            <span>AUTO-HOLD: {autoHoldOnDetection ? "ON" : "OFF"}</span>
          </button>

          {/* Protocol Switcher Button */}
          <button
            onClick={() => setUseWebSocket(!useWebSocket)}
            className={`px-2 py-1 rounded border text-[11px] font-mono transition cursor-pointer flex items-center gap-1 ${
              useWebSocket
                ? "bg-emerald-950/60 border-emerald-600/60 text-emerald-300"
                : "bg-slate-800 border-slate-700 text-slate-300 hover:text-white"
            }`}
            title="Toggle between WebSocket binary pipe and HTTP multipart stream"
          >
            <Zap className="w-3 h-3 text-cyan-400" />
            <span>{useWebSocket ? "WS" : "HTTP"}</span>
          </button>

          {/* Info Button */}
          <button
            onClick={() => setShowInfo(!showInfo)}
            className={`p-1.5 rounded border text-xs transition cursor-pointer ${
              showInfo
                ? "bg-cyan-900/40 border-cyan-700 text-cyan-300"
                : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
            }`}
            title="Stream specifications"
          >
            <Info className="w-3.5 h-3.5" />
          </button>

          {/* Pause / Play Toggle */}
          <button
            onClick={() => {
              if (isPaused) {
                handleResume();
              } else {
                setIsPaused(true);
              }
            }}
            className={`p-1.5 rounded border transition cursor-pointer text-xs flex items-center gap-1 ${
              isPaused
                ? "bg-emerald-950 border-emerald-600 text-emerald-300 hover:bg-emerald-900"
                : "bg-slate-800 border-slate-700 text-slate-300 hover:text-white"
            }`}
            title={isPaused ? "Resume live stream [SPACE]" : "Freeze current frame [SPACE]"}
          >
            {isPaused ? (
              <Play className="w-3.5 h-3.5 fill-current text-emerald-400" />
            ) : (
              <Pause className="w-3.5 h-3.5 text-amber-400" />
            )}
          </button>

          {/* Reload Stream Button */}
          <button
            onClick={reloadStream}
            className="p-1.5 rounded border border-slate-700 bg-slate-800 text-slate-300 hover:text-white transition active:rotate-180 cursor-pointer"
            title="Reconnect video stream"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-300" />
          </button>
        </div>
      </div>

      {/* Info specs drawer */}
      {showInfo && (
        <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-2 text-xs font-mono text-slate-300 space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-400">ROS Topic:</span>
            <span className="text-cyan-300">/oak/rgb/image_raw</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Transport:</span>
            <span className="text-emerald-300">
              {useWebSocket
                ? "Binary WebSocket (Zero HTTP Head-of-line buffering)"
                : "multipart/x-mixed-replace (MJPEG)"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Auto-Hold on Face Detection:</span>
            <span className={autoHoldOnDetection ? "text-cyan-400 font-bold" : "text-slate-400"}>
              {autoHoldOnDetection ? "ENABLED (Holds frame upon detection)" : "DISABLED (Continuous stream)"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Resolution / Quality:</span>
            <span>640px • JPEG Q78 • Face HUD HUD-Overlay</span>
          </div>
        </div>
      )}

      {/* Viewport Area */}
      <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
        {/* Subtle crosshair grid overlay */}
        <div className="absolute inset-0 pointer-events-none tactical-grid-bg opacity-20" />

        {/* Viewport Corners Reticle */}
        <div className="absolute top-3 left-3 w-4 h-4 border-t-2 border-l-2 border-cyan-500/70 pointer-events-none z-10" />
        <div className="absolute top-3 right-3 w-4 h-4 border-t-2 border-r-2 border-cyan-500/70 pointer-events-none z-10" />
        <div className="absolute bottom-3 left-3 w-4 h-4 border-b-2 border-l-2 border-cyan-500/70 pointer-events-none z-10" />
        <div className="absolute bottom-3 right-3 w-4 h-4 border-b-2 border-r-2 border-cyan-500/70 pointer-events-none z-10" />

        {/* Image Display (Always renders the last available frame, even when paused!) */}
        {activeImageSource && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={activeImageSource}
            alt="Robot Live Camera Feed"
            onLoad={() => {
              setIsLoading(false);
              setIsError(false);
            }}
            onError={() => {
              if (!useWebSocket) {
                setIsLoading(false);
                setIsError(true);
              }
            }}
            className={`w-full h-full object-contain select-none transition-opacity duration-200 ${
              isLoading ? "opacity-30" : "opacity-100"
            }`}
          />
        )}

        {/* Target Locked / Auto-Hold Tactical Overlay */}
        {isPaused && (
          <div className="absolute inset-0 z-20 bg-black/40 flex flex-col justify-between p-4 pointer-events-none border-2 border-emerald-500/70">
            {/* Top Bar */}
            <div className="flex items-center justify-between pointer-events-auto">
              <div className="flex items-center gap-2 bg-black/80 border border-emerald-500/80 px-2.5 py-1 rounded text-emerald-300 font-mono text-xs shadow-lg">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="font-bold">
                  {isTargetLocked
                    ? `TARGET DETECTED • STREAM HELD [${lockedObsCode || "OBSERVATION"}]`
                    : "STREAM DISPLAY FROZEN"}
                </span>
              </div>
              <span className="text-[10px] font-mono text-slate-300 bg-black/70 px-2 py-0.5 rounded border border-slate-700">
                PRESS SPACE OR CLICK RESUME
              </span>
            </div>

            {/* Center Quick Resume Button */}
            <div className="flex flex-col items-center justify-center pointer-events-auto gap-2">
              <button
                onClick={handleResume}
                className="px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono font-bold text-xs shadow-[0_0_25px_rgba(16,185,129,0.5)] flex items-center gap-2 cursor-pointer transition active:scale-95"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>RESUME LIVE FEED</span>
              </button>
              <p className="text-[10px] font-mono text-slate-300 bg-black/75 px-3 py-1 rounded text-center">
                Review and verify this survivor in the observation panel on the right.
              </p>
            </div>

            {/* Bottom Status Tag */}
            <div className="text-right text-[10px] font-mono text-emerald-400 self-end bg-black/80 px-2 py-1 rounded border border-emerald-800/60">
              FRAME RETAINED FOR OPERATOR INSPECTION
            </div>
          </div>
        )}

        {/* Loading Spinner */}
        {isLoading && !isError && !isPaused && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 pointer-events-none">
            <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mb-2" />
            <span className="text-xs font-mono text-cyan-300">
              {useWebSocket ? "CONNECTING WEBSOCKET FRAME PIPE..." : "ESTABLISHING MJPEG PIPE..."}
            </span>
          </div>
        )}

        {/* Error / Offline Overlay */}
        {isError && (
          <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center">
            <AlertTriangle className="w-10 h-10 text-red-400 mb-2" />
            <h3 className="text-sm font-mono font-bold text-red-300 uppercase">
              Stream Pipe Disconnected
            </h3>
            <p className="text-xs text-slate-400 max-w-md mt-1 mb-4 font-mono">
              Unable to reach camera stream. If your friend&apos;s tunnel expired, have them restart their tunnel.
            </p>
            <button
              onClick={reloadStream}
              className="px-4 py-1.5 rounded bg-red-900/40 border border-red-700 text-red-200 text-xs font-mono hover:bg-red-800/40 transition cursor-pointer flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>RECONNECT PIPE</span>
            </button>
          </div>
        )}

        {/* Bottom Stream Telemetry Bar */}
        <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between text-[10px] font-mono text-slate-300 bg-black/70 backdrop-blur-xs px-2.5 py-1 rounded border border-slate-800 pointer-events-none">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isPaused
                  ? "bg-amber-400"
                  : isUpstreamLive
                  ? "bg-emerald-400 animate-pulse"
                  : "bg-amber-400"
              }`}
            />
            <span>
              {isPaused
                ? "HOLD / PAUSED"
                : isUpstreamLive
                ? "LIVE ROS 2 LINK"
                : "TEST PATTERN / STANDBY"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span>FPS: {isPaused ? "FROZEN" : fps > 0 ? fps : "~25"}</span>
            <span>RES: 640x480</span>
          </div>
        </div>
      </div>
    </div>
  );
};
