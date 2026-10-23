"use client";

import React, { useEffect, useRef, useState } from "react";
import { Compass, ZoomIn, ZoomOut, RotateCcw, FileText, AlertCircle } from "lucide-react";
import { MapData, ObservationRecord } from "../lib/types";

interface MapPanelProps {
  mapData: MapData | null;
  isLoading: boolean;
  observations?: ObservationRecord[];
  selectedObservationId?: string | null;
  onSelectObservation?: (obs: ObservationRecord) => void;
}

export const MapPanel: React.FC<MapPanelProps> = ({
  mapData,
  isLoading,
  observations = [],
  selectedObservationId = null,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState<number>(1.0);
  const [showContractDocs, setShowContractDocs] = useState<boolean>(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mapData) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.fillStyle = "#070b14";
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    // Center coordinate frame and apply zoom
    ctx.translate(width / 2, height / 2);
    ctx.scale(zoom, zoom);

    const grid = mapData.grid;
    const rows = grid.length;
    const cols = grid[0]?.length || 0;
    const resolution = mapData.metadata.resolution; // 0.05 m/cell
    const cellSize = (width * 0.75) / Math.max(cols, rows, 1);

    const startX = -((cols * cellSize) / 2);
    const startY = -((rows * cellSize) / 2);

    // 1. Draw Occupancy Grid Cells
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const val = grid[r][c];
        const cellX = startX + c * cellSize;
        const cellY = startY + (rows - 1 - r) * cellSize;

        if (val >= 100) {
          // Occupied / Obstacle / Rubble
          ctx.fillStyle = "rgba(245, 158, 11, 0.85)"; // Amber obstacle
          ctx.fillRect(cellX, cellY, cellSize, cellSize);
          ctx.strokeStyle = "rgba(180, 83, 9, 0.6)";
          ctx.strokeRect(cellX, cellY, cellSize, cellSize);
        } else if (val > 0) {
          // Obstacle probability (1-99)
          const alpha = 0.2 + (val / 100) * 0.65;
          ctx.fillStyle = `rgba(245, 158, 11, ${alpha})`;
          ctx.fillRect(cellX, cellY, cellSize, cellSize);
        } else if (val === 0) {
          // Free navigable floor
          ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
          ctx.fillRect(cellX, cellY, cellSize, cellSize);
          ctx.strokeStyle = "rgba(30, 41, 59, 0.4)";
          ctx.strokeRect(cellX, cellY, cellSize, cellSize);
        } else {
          // Unknown / Unexplored space (-1)
          ctx.fillStyle = "rgba(8, 12, 22, 0.6)";
          ctx.fillRect(cellX, cellY, cellSize, cellSize);
        }
      }
    }

    // 2. Draw Metric Grid Ticks and Axes
    ctx.strokeStyle = "rgba(56, 189, 248, 0.25)";
    ctx.lineWidth = 1;
    // X Axis
    ctx.beginPath();
    ctx.moveTo(-width / 2, 0);
    ctx.lineTo(width / 2, 0);
    ctx.stroke();
    // Y Axis
    ctx.beginPath();
    ctx.moveTo(0, -height / 2);
    ctx.lineTo(0, height / 2);
    ctx.stroke();

    // 3. Draw Simulated Robot Pose Indicator
    const pose = mapData.simulated_robot_pose;
    if (pose) {
      // Metric (x,y) to pixel offset
      const pxX = pose.x * (cellSize / resolution);
      const pxY = -pose.y * (cellSize / resolution); // Invert Y for canvas

      ctx.save();
      ctx.translate(pxX, pxY);
      ctx.rotate((-pose.yaw_deg * Math.PI) / 180);

      // Robot Base Circle
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(6, 182, 212, 0.3)";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#06b6d4";
      ctx.stroke();

      // Heading Arrow
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(16, 0);
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Heading arrowhead
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(11, -4);
      ctx.lineTo(11, 4);
      ctx.closePath();
      ctx.fillStyle = "#38bdf8";
      ctx.fill();

      ctx.restore();

      // Draw Pose Label
      ctx.fillStyle = "#38bdf8";
      ctx.font = "10px monospace";
      ctx.fillText(
        `SIMULATED POSE (${pose.x.toFixed(1)}m, ${pose.y.toFixed(1)}m, ${pose.yaw_deg}°)`,
        pxX + 14,
        pxY - 8
      );
    }

    // 4. Draw Survivor Observation Pins
    for (const obs of observations) {
      const pxX = obs.pos_x * (cellSize / resolution);
      const pxY = -obs.pos_y * (cellSize / resolution);
      const isSelected = selectedObservationId === obs.id;

      ctx.save();
      ctx.translate(pxX, pxY);

      const color =
        obs.review_status === "confirmed"
          ? "#10b981" // emerald
          : obs.review_status === "rejected"
          ? "#ef4444" // red
          : "#f59e0b"; // amber

      // Outer target reticle for unreviewed or selected
      if (isSelected || obs.review_status === "unreviewed") {
        ctx.beginPath();
        ctx.arc(0, 0, isSelected ? 16 : 12, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.stroke();
      }

      // Diamond Pin
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(8, 0);
      ctx.lineTo(0, 9);
      ctx.lineTo(-8, 0);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label
      ctx.fillStyle = color;
      ctx.font = "bold 9px monospace";
      ctx.fillText(obs.obs_code, 11, -4);
      if (obs.person_name) {
        ctx.fillStyle = "#cbd5e1";
        ctx.font = "8px monospace";
        ctx.fillText(obs.person_name.split(" ")[0], 11, 6);
      }

      ctx.restore();
    }

    ctx.restore();

    // 5. Draw Canvas Watermark
    ctx.fillStyle = "rgba(245, 158, 11, 0.4)";
    ctx.font = "bold 11px monospace";
    ctx.fillText("LOCAL METRIC OCCUPANCY GRID [DEMO DATA]", 14, 22);
    ctx.fillStyle = "rgba(148, 163, 184, 0.4)";
    ctx.font = "9px monospace";
    ctx.fillText("FRAME: map (REP-103) • RESOLUTION: 0.05m/cell", 14, 36);
  }, [mapData, zoom, observations, selectedObservationId]);

  return (
    <div className="rounded-lg border border-slate-800 bg-[#0c1220] flex flex-col overflow-hidden shadow-lg">
      {/* Panel Header */}
      <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-semibold tracking-wide text-slate-200 uppercase font-mono">
            Local Occupancy Grid
          </h2>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-bold">
            DEMO DATA - NOT CONNECTED
          </span>
        </div>

        {/* Map Actions */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowContractDocs(!showContractDocs)}
            className={`p-1.5 rounded border text-xs transition cursor-pointer flex items-center gap-1 font-mono ${
              showContractDocs
                ? "bg-cyan-900/40 border-cyan-700 text-cyan-300"
                : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
            }`}
            title="Inspect ROS 2 Occupancy Grid Contract"
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-[11px]">ROS 2 SPEC</span>
          </button>
          <button
            onClick={() => setZoom((z) => Math.min(z + 0.2, 2.5))}
            className="p-1.5 rounded border border-slate-700 bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(z - 0.2, 0.6))}
            className="p-1.5 rounded border border-slate-700 bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoom(1.0)}
            className="p-1.5 rounded border border-slate-700 bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
            title="Reset View"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Contract Specification Drawer */}
      {showContractDocs && (
        <div className="bg-slate-900/95 border-b border-slate-800 px-4 py-3 text-xs font-mono text-slate-300 space-y-2">
          <div className="flex items-center gap-2 text-cyan-300 font-bold">
            <AlertCircle className="w-4 h-4 text-cyan-400" />
            <span>ROS 2 Occupancy Grid Architecture Specification</span>
          </div>
          <p className="text-[11px] text-slate-400">
            The upstream robot API currently supplies no map or pose endpoints. This interface implements a strict adapter boundary awaiting the following ROS 2 node integration:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] bg-black/40 p-2.5 rounded border border-slate-800">
            <div>
              <span className="text-slate-400">Target Message:</span>{" "}
              <code className="text-cyan-300 font-bold">nav_msgs/msg/OccupancyGrid</code>
            </div>
            <div>
              <span className="text-slate-400">Recommended Topic:</span>{" "}
              <code className="text-cyan-300 font-bold">/map</code>
            </div>
            <div>
              <span className="text-slate-400">Pose & TF Frames:</span>{" "}
              <code className="text-cyan-300">map → odom → base_link</code>
            </div>
            <div>
              <span className="text-slate-400">Occupancy Semantics:</span>{" "}
              <span>0=Free, 100=Obstacle, -1=Unknown</span>
            </div>
          </div>
        </div>
      )}

      {/* Canvas Viewport */}
      <div className="relative w-full aspect-video sm:aspect-[4/3] bg-[#070b14] flex items-center justify-center overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
            <span className="text-xs font-mono text-cyan-400">LOADING MAP ADAPTER...</span>
          </div>
        )}

        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className="w-full h-full object-contain cursor-crosshair select-none"
        />

        {/* Legend */}
        <div className="absolute bottom-3 right-3 bg-black/75 px-3 py-1.5 rounded border border-slate-800 text-[10px] font-mono text-slate-300 flex items-center gap-3 pointer-events-none">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-slate-900 border border-slate-700" />
            <span>Free</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-amber-500" />
            <span>Obstacle / Rubble</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-[#080c16] border border-slate-800" />
            <span>Unexplored</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
            <span className="text-cyan-300">Sim. Pose</span>
          </div>
        </div>
      </div>
    </div>
  );
};
