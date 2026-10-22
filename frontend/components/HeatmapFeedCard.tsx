"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Flame,
  Maximize2,
  Minimize2,
  Layers,
  Activity,
  Sliders,
  Crosshair,
  Info,
} from "lucide-react";

interface HeatmapFeedCardProps {
  onMaximizeToggle?: () => void;
}

export type HeatmapMode = "thermal" | "hazard" | "structural";

export const HeatmapFeedCard: React.FC<HeatmapFeedCardProps> = () => {
  const [mode, setMode] = useState<HeatmapMode>("hazard");
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [currentTimeUtc, setCurrentTimeUtc] = useState<string>("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

  const renderHeatmap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // 1. Dark base background
    ctx.fillStyle = "#070b13";
    ctx.fillRect(0, 0, width, height);

    // 2. Subtle Coordinate Grid
    const gridSize = 20;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // 3. Render Thermal/Hazard Continuous Density Heatmap
    ctx.save();
    ctx.globalCompositeOperation = "screen";

    const hotspots = [
      {
        x: width * 0.42,
        y: height * 0.38,
        r: Math.min(width, height) * 0.32,
        peak: mode === "thermal" ? "74°C" : "88% Load",
        label: "SECTOR 3 COLLAPSE",
        colorCenter: mode === "thermal" ? "244, 63, 94" : "239, 68, 68",
        colorMid: mode === "thermal" ? "245, 158, 11" : "245, 158, 11",
      },
      {
        x: width * 0.72,
        y: height * 0.62,
        r: Math.min(width, height) * 0.28,
        peak: mode === "thermal" ? "61°C" : "76% Risk",
        label: "RUBBLE VOID B",
        colorCenter: "245, 158, 11",
        colorMid: "16, 185, 129",
      },
      {
        x: width * 0.25,
        y: height * 0.75,
        r: Math.min(width, height) * 0.22,
        peak: mode === "thermal" ? "42°C" : "52% Strain",
        label: "PASSAGEWAY C",
        colorCenter: "56, 189, 248",
        colorMid: "16, 185, 129",
      },
    ];

    hotspots.forEach((h) => {
      const grad = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.r);
      grad.addColorStop(0, `rgba(${h.colorCenter}, 0.75)`);
      grad.addColorStop(0.35, `rgba(${h.colorMid}, 0.45)`);
      grad.addColorStop(0.7, "rgba(6, 182, 212, 0.15)");
      grad.addColorStop(1, "rgba(6, 182, 212, 0)");

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
      ctx.fill();

      // Isothermal contour rings
      ctx.strokeStyle = `rgba(${h.colorCenter}, 0.4)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r * 0.4, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = `rgba(${h.colorMid}, 0.25)`;
      ctx.beginPath();
      ctx.arc(h.x, h.y, h.r * 0.7, 0, Math.PI * 2);
      ctx.stroke();
    });

    ctx.restore();

    // 4. Hotspot Pins & Annotations
    hotspots.forEach((h) => {
      // Small reticle target
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(h.x, h.y, 4, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(h.x - 7, h.y);
      ctx.lineTo(h.x + 7, h.y);
      ctx.moveTo(h.x, h.y - 7);
      ctx.lineTo(h.x, h.y + 7);
      ctx.stroke();

      // Label Pill
      ctx.font = "bold 9px monospace";
      ctx.fillStyle = "rgba(11, 15, 25, 0.85)";
      const textWidth = ctx.measureText(`${h.label} [${h.peak}]`).width;
      ctx.fillRect(h.x + 8, h.y - 12, textWidth + 8, 16);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
      ctx.strokeRect(h.x + 8, h.y - 12, textWidth + 8, 16);

      ctx.fillStyle = "#f8fafc";
      ctx.fillText(`${h.label} [${h.peak}]`, h.x + 12, h.y);
    });

    // 5. Central Optical-Thermal Crosshair
    ctx.strokeStyle = "rgba(245, 158, 11, 0.6)";
    ctx.lineWidth = 1;
    const cx = width / 2;
    const cy = height / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 24, cy);
    ctx.lineTo(cx + 24, cy);
    ctx.moveTo(cx, cy - 24);
    ctx.lineTo(cx, cy + 24);
    ctx.stroke();
  }, [mode]);

  useEffect(() => {
    renderHeatmap();
    window.addEventListener("resize", renderHeatmap);
    return () => window.removeEventListener("resize", renderHeatmap);
  }, [renderHeatmap]);

  return (
    <div className="rounded-xl border border-[#DCDDD5] bg-white overflow-hidden flex flex-col justify-between shadow-xs">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-[#DCDDD5] flex flex-wrap items-center justify-between gap-3 bg-white">
        {/* Left: Icon & Title */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-[#ECEBE5] border border-[#DCDDD5] flex items-center justify-center text-[#B77927]">
            <Flame className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#252923] tracking-tight">
              Disaster Heatmap Feed
            </h3>
            <p className="text-[11px] text-[#70746D]">
              Thermal & Hazard Intensity • Multi-Spectrum
            </p>
          </div>
        </div>

        {/* Right: Mode Switcher & Fullscreen */}
        <div className="flex items-center gap-2">
          {/* Live Heatmap Badge */}
          <span className="px-2 py-0.5 rounded-full bg-[#B77927]/10 border border-[#B77927]/30 text-[#B77927] text-[10px] font-semibold font-mono flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#B77927]" />
            LIVE HEATMAP
          </span>

          {/* Mode Selector */}
          <div className="flex items-center bg-[#F5F4F0] border border-[#DCDDD5] rounded-md p-0.5 text-[10px] font-mono">
            <button
              onClick={() => setMode("hazard")}
              className={`px-2 py-0.5 rounded transition cursor-pointer ${
                mode === "hazard"
                  ? "bg-white text-[#252923] font-semibold border border-[#DCDDD5] shadow-xs"
                  : "text-[#70746D] hover:text-[#252923]"
              }`}
            >
              HAZARD
            </button>
            <button
              onClick={() => setMode("thermal")}
              className={`px-2 py-0.5 rounded transition cursor-pointer ${
                mode === "thermal"
                  ? "bg-white text-[#252923] font-semibold border border-[#DCDDD5] shadow-xs"
                  : "text-[#70746D] hover:text-[#252923]"
              }`}
            >
              THERMAL IR
            </button>
            <button
              onClick={() => setMode("structural")}
              className={`px-2 py-0.5 rounded transition cursor-pointer ${
                mode === "structural"
                  ? "bg-white text-[#252923] font-semibold border border-[#DCDDD5] shadow-xs"
                  : "text-[#70746D] hover:text-[#252923]"
              }`}
            >
              STRESS
            </button>
          </div>

          {/* Fullscreen Button */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1 rounded-md bg-[#F5F4F0] border border-[#DCDDD5] text-[#70746D] hover:text-[#252923] transition cursor-pointer"
            title="Expand Heatmap"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Heatmap Canvas Viewport */}
      <div className="relative aspect-[16/10] bg-black overflow-hidden flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={640}
          height={400}
          className="w-full h-full object-cover"
        />

        {/* Dynamic Thermal / Hazard Gradient Scale Bar */}
        <div className="absolute top-3 right-3 px-2.5 py-1.5 rounded-lg bg-black/80 backdrop-blur-md border border-[#1e293b] text-[10px] font-mono space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-[9px] gap-2">
            <span>AMBIENT</span>
            <span className="text-amber-400">HOTSPOT</span>
            <span className="text-rose-400">CRITICAL</span>
          </div>
          <div className="w-32 h-2 rounded bg-gradient-to-r from-blue-900 via-emerald-500 via-amber-400 to-rose-600 border border-slate-700" />
        </div>

        {/* Bottom Left Timestamp Overlay */}
        <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-md bg-black/75 backdrop-blur-md text-slate-200 text-xs font-mono tracking-tight pointer-events-none">
          {currentTimeUtc || "2026-10-21 13:01:28 UTC"}
        </div>

        {/* Bottom Right Sensor Specs */}
        <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-md bg-black/75 backdrop-blur-md text-amber-300 text-xs font-mono tracking-tight pointer-events-none">
          {mode === "thermal"
            ? "IR RANGE: 18°C - 84°C • FUSED"
            : mode === "structural"
            ? "STRAIN: 0.12 - 0.94 • SENSOR FUSION"
            : "HAZARD INTENSITY: DENSITY V2"}
        </div>
      </div>

      {/* Fullscreen Modal View */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col p-6 animate-in fade-in">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-bold font-mono flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                DISASTER HEATMAP EXPANDED VIEW
              </span>
              <span className="text-xs font-mono text-slate-400">
                Multi-Spectral Spatial Heatmap • Mode: {mode.toUpperCase()}
              </span>
            </div>
            <button
              onClick={() => setIsFullscreen(false)}
              className="p-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
            >
              <Minimize2 className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 relative rounded-2xl overflow-hidden bg-black border border-slate-800 flex items-center justify-center p-2">
            <canvas
              width={1280}
              height={800}
              ref={(node) => {
                if (node) {
                  const ctx = node.getContext("2d");
                  if (ctx) {
                    ctx.drawImage(canvasRef.current!, 0, 0, 1280, 800);
                  }
                }
              }}
              className="w-full h-full object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
};
