"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Map as MapIcon,
  Maximize2,
  ZoomIn,
  ZoomOut,
  Crosshair,
  Layers,
  Flame,
  Users,
  Compass,
} from "lucide-react";
import { MapData, ObservationRecord } from "../lib/types";

interface MissionMapProps {
  mapData: MapData | null;
  isLoading?: boolean;
  observations?: ObservationRecord[];
  selectedObservationId?: string | null;
  onSelectObservation?: (obs: ObservationRecord) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export type MapLayer =
  | "exploration"
  | "hazard"
  | "density"
  | "human_presence"
  | "sensor_coverage";

export const MissionMap: React.FC<MissionMapProps> = ({
  mapData,
  isLoading = false,
  observations = [],
  selectedObservationId,
  onSelectObservation,
  isExpanded = false,
  onToggleExpand,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Active layers state
  const [activeLayers, setActiveLayers] = useState<Record<MapLayer, boolean>>({
    exploration: true,
    hazard: false,
    density: false,
    human_presence: true,
    sensor_coverage: true,
  });

  const [zoom, setZoom] = useState<number>(1.0);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoveredObs, setHoveredObs] = useState<ObservationRecord | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const toggleLayer = (layer: MapLayer) => {
    setActiveLayers((prev) => ({
      ...prev,
      [layer]: !prev[layer],
    }));
  };

  const handleZoomIn = () => setZoom((z) => Math.min(2.5, z + 0.2));
  const handleZoomOut = () => setZoom((z) => Math.max(0.6, z - 0.2));
  const handleResetView = () => {
    setZoom(1.0);
    setPanOffset({ x: 0, y: 0 });
  };

  // Canvas Drawing Engine
  const renderMap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // 1. Clear background to dark terrain inset
    ctx.fillStyle = "#151815";
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    // Apply pan and zoom centered
    ctx.translate(width / 2 + panOffset.x, height / 2 + panOffset.y);
    ctx.scale(zoom, zoom);

    // 2. Subtle Coordinate Grid
    const gridSize = 24;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    for (let x = -width; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, -height);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = -height; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(-width, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // 3. Render Occupancy Grid Map
    const grid = mapData?.grid;
    const cellSize = 10;
    const gridRows = grid?.length || 50;
    const gridCols = grid?.[0]?.length || 50;
    const mapOriginX = -(gridCols * cellSize) / 2;
    const mapOriginY = -(gridRows * cellSize) / 2;

    if (activeLayers.exploration && grid) {
      for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
          const val = grid[r][c];
          const cellX = mapOriginX + c * cellSize;
          const cellY = mapOriginY + r * cellSize;

          if (val === 100) {
            // Obstacle / Wall: Dark slate block
            ctx.fillStyle = "#2a2e28";
            ctx.fillRect(cellX, cellY, cellSize, cellSize);
            ctx.strokeStyle = "rgba(20, 24, 19, 0.9)";
            ctx.lineWidth = 0.5;
            ctx.strokeRect(cellX, cellY, cellSize, cellSize);
          } else if (val === 0) {
            // Explored Navigable Area
            ctx.fillStyle = "#3f463c";
            ctx.fillRect(cellX, cellY, cellSize, cellSize);
            ctx.strokeStyle = "rgba(45, 52, 42, 0.4)";
            ctx.lineWidth = 0.5;
            ctx.strokeRect(cellX, cellY, cellSize, cellSize);
          }
        }
      }
    }

    // 4. Layer 2: Hazard Intensity Heatmap
    if (activeLayers.hazard && grid) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";

      const hazardCenters = [
        { x: mapOriginX + 16 * cellSize, y: mapOriginY + 14 * cellSize, intensity: 0.5, r: 65 },
        { x: mapOriginX + 34 * cellSize, y: mapOriginY + 32 * cellSize, intensity: 0.6, r: 80 },
        { x: mapOriginX + 25 * cellSize, y: mapOriginY + 20 * cellSize, intensity: 0.4, r: 50 },
      ];

      hazardCenters.forEach((h) => {
        const radGrad = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.r);
        radGrad.addColorStop(0, `rgba(183, 121, 39, ${h.intensity})`);
        radGrad.addColorStop(0.5, `rgba(180, 73, 63, ${h.intensity * 0.7})`);
        radGrad.addColorStop(1, "rgba(183, 121, 39, 0)");

        ctx.fillStyle = radGrad;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }

    // 5. Layer 3: Observation Density Heatmap
    if (activeLayers.density && observations.length > 0) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      observations.forEach((obs) => {
        const obsX = obs.pos_x * 80;
        const obsY = -obs.pos_y * 80;
        const radGrad = ctx.createRadialGradient(obsX, obsY, 0, obsX, obsY, 55);
        radGrad.addColorStop(0, "rgba(87, 117, 138, 0.55)");
        radGrad.addColorStop(0.5, "rgba(40, 91, 73, 0.3)");
        radGrad.addColorStop(1, "rgba(40, 91, 73, 0)");

        ctx.fillStyle = radGrad;
        ctx.beginPath();
        ctx.arc(obsX, obsY, 55, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }

    // 6. Layer 5: Sensor Coverage (Directional FOV from Robot)
    const robotX = (mapData?.simulated_robot_pose?.x || 0) * 80;
    const robotY = -(mapData?.simulated_robot_pose?.y || 0) * 80;
    const robotYawDeg = mapData?.simulated_robot_pose?.yaw_deg || 45;
    const robotYawRad = (robotYawDeg * Math.PI) / 180;

    if (activeLayers.sensor_coverage) {
      ctx.save();
      const fovAngle = (55 * Math.PI) / 180;
      const fovRadius = 90;

      const fovGrad = ctx.createRadialGradient(
        robotX,
        robotY,
        0,
        robotX,
        robotY,
        fovRadius
      );
      fovGrad.addColorStop(0, "rgba(40, 91, 73, 0.4)");
      fovGrad.addColorStop(0.7, "rgba(40, 91, 73, 0.12)");
      fovGrad.addColorStop(1, "rgba(40, 91, 73, 0)");

      ctx.fillStyle = fovGrad;
      ctx.beginPath();
      ctx.moveTo(robotX, robotY);
      ctx.arc(
        robotX,
        robotY,
        fovRadius,
        robotYawRad - fovAngle / 2,
        robotYawRad + fovAngle / 2
      );
      ctx.closePath();
      ctx.fill();

      // Arc outline
      ctx.strokeStyle = "rgba(40, 91, 73, 0.5)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    // 7. Layer 4: Observation Pins on Map
    if (activeLayers.human_presence && observations.length > 0) {
      observations.forEach((obs) => {
        const obsX = obs.pos_x * 80;
        const obsY = -obs.pos_y * 80;
        const isSelected = selectedObservationId === obs.id;

        ctx.save();
        if (obs.review_status === "confirmed") {
          ctx.fillStyle = "rgba(40, 91, 73, 0.3)";
          ctx.strokeStyle = "#285B49";
        } else if (obs.review_status === "rejected") {
          ctx.fillStyle = "rgba(180, 73, 63, 0.3)";
          ctx.strokeStyle = "#B4493F";
        } else {
          ctx.fillStyle = "rgba(183, 121, 39, 0.3)";
          ctx.strokeStyle = "#B77927";
        }

        ctx.beginPath();
        ctx.arc(obsX, obsY, isSelected ? 12 : 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.stroke();

        // Pin Center Dot
        ctx.fillStyle =
          obs.review_status === "confirmed"
            ? "#285B49"
            : obs.review_status === "rejected"
            ? "#B4493F"
            : "#B77927";
        ctx.beginPath();
        ctx.arc(obsX, obsY, isSelected ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fill();

        // Label above pin
        ctx.font = "bold 9px monospace";
        ctx.fillStyle = "#ECEBE5";
        ctx.textAlign = "center";
        ctx.fillText(obs.obs_code.replace("OBS-01-", "#"), obsX, obsY - 12);
        ctx.restore();
      });
    }

    // 8. Robot Marker (Deep Forest Directional Chevron)
    ctx.save();
    ctx.translate(robotX, robotY);
    ctx.rotate(robotYawRad);

    // Chevron Arrow
    ctx.fillStyle = "#285B49";
    ctx.strokeStyle = "#ECEBE5";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-8, -8);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-8, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Center Core Dot
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }, [
    mapData,
    activeLayers,
    zoom,
    panOffset,
    observations,
    selectedObservationId,
  ]);

  useEffect(() => {
    renderMap();
  }, [renderMap]);

  // Handle Drag / Pan
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging) {
      setPanOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
      return;
    }

    // Hit test for observation tooltips
    const canvas = canvasRef.current;
    if (!canvas || !activeLayers.human_presence) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const width = canvas.width;
    const height = canvas.height;
    const canvasCenterX = width / 2 + panOffset.x;
    const canvasCenterY = height / 2 + panOffset.y;

    let hit: ObservationRecord | null = null;
    for (const obs of observations) {
      const pinScreenX = canvasCenterX + obs.pos_x * 80 * zoom;
      const pinScreenY = canvasCenterY - obs.pos_y * 80 * zoom;
      const dist = Math.hypot(mouseX - pinScreenX, mouseY - pinScreenY);
      if (dist < 14) {
        hit = obs;
        break;
      }
    }

    if (hit) {
      setHoveredObs(hit);
      setTooltipPos({ x: mouseX, y: mouseY });
    } else {
      setHoveredObs(null);
      setTooltipPos(null);
    }
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleClick = () => {
    if (hoveredObs && onSelectObservation) {
      onSelectObservation(hoveredObs);
    }
  };

  return (
    <div
      className={`rounded-xl border border-[#DCDDD5] bg-white flex flex-col overflow-hidden shadow-xs relative ${
        isExpanded ? "fixed inset-4 z-50 shadow-2xl" : ""
      }`}
    >
      {/* Panel Header */}
      <div className="px-4 py-2.5 border-b border-[#DCDDD5] flex flex-wrap items-center justify-between gap-2 bg-white">
        <div className="flex items-center gap-2">
          <MapIcon className="w-4 h-4 text-[#285B49]" />
          <h3 className="text-sm font-semibold tracking-tight text-[#252923]">
            Mission Map
          </h3>
          <span className="text-[11px] text-[#70746D] font-normal">
            Local Occupancy Grid
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#ECEBE5] text-[#70746D] border border-[#DCDDD5] font-semibold ml-1">
            DEMO DATA
          </span>
        </div>

        {/* Action icons on right */}
        <div className="flex items-center gap-1.5">
          {onToggleExpand && (
            <button
              onClick={onToggleExpand}
              className="p-1 rounded text-[#70746D] hover:text-[#252923] transition cursor-pointer"
              title={isExpanded ? "Exit Fullscreen Map" : "Expand Map View"}
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Multi-Layer Selector Toolbar */}
      <div className="px-3 py-1.5 border-b border-[#DCDDD5] bg-[#F5F4F0] flex flex-wrap items-center justify-between gap-1 text-[11px]">
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
          <span className="text-[10px] text-[#70746D] font-medium mr-1 uppercase">
            Layers:
          </span>

          <button
            onClick={() => toggleLayer("exploration")}
            className={`px-2.5 py-1 rounded-md border text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              activeLayers.exploration
                ? "bg-white border-[#285B49] text-[#285B49] shadow-xs"
                : "bg-transparent border-[#DCDDD5] text-[#70746D] hover:text-[#252923] hover:bg-white"
            }`}
          >
            <Compass className="w-3 h-3 text-[#285B49]" />
            <span>Exploration</span>
          </button>

          <button
            onClick={() => toggleLayer("hazard")}
            className={`px-2.5 py-1 rounded-md border text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              activeLayers.hazard
                ? "bg-white border-[#B77927] text-[#B77927] shadow-xs"
                : "bg-transparent border-[#DCDDD5] text-[#70746D] hover:text-[#252923] hover:bg-white"
            }`}
          >
            <Flame className="w-3 h-3 text-[#B77927]" />
            <span>Hazard Heatmap</span>
          </button>

          <button
            onClick={() => toggleLayer("density")}
            className={`px-2.5 py-1 rounded-md border text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              activeLayers.density
                ? "bg-white border-[#57758A] text-[#57758A] shadow-xs"
                : "bg-transparent border-[#DCDDD5] text-[#70746D] hover:text-[#252923] hover:bg-white"
            }`}
          >
            <Layers className="w-3 h-3 text-[#57758A]" />
            <span>Density</span>
          </button>

          <button
            onClick={() => toggleLayer("human_presence")}
            className={`px-2.5 py-1 rounded-md border text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              activeLayers.human_presence
                ? "bg-white border-[#B4493F] text-[#B4493F] shadow-xs"
                : "bg-transparent border-[#DCDDD5] text-[#70746D] hover:text-[#252923] hover:bg-white"
            }`}
          >
            <Users className="w-3 h-3 text-[#B4493F]" />
            <span>Observations ({observations.length})</span>
          </button>

          <button
            onClick={() => toggleLayer("sensor_coverage")}
            className={`px-2.5 py-1 rounded-md border text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              activeLayers.sensor_coverage
                ? "bg-white border-[#285B49] text-[#285B49] shadow-xs"
                : "bg-transparent border-[#DCDDD5] text-[#70746D] hover:text-[#252923] hover:bg-white"
            }`}
          >
            <Crosshair className="w-3 h-3 text-[#285B49]" />
            <span>Sensor FOV</span>
          </button>
        </div>
      </div>

      {/* Main Canvas Viewport Area */}
      <div className="relative flex-1 aspect-video min-h-[340px] bg-[#151815] flex items-center justify-center overflow-hidden">
        <canvas
          ref={canvasRef}
          width={640}
          height={380}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onClick={handleClick}
          className="w-full h-full cursor-grab active:cursor-grabbing select-none"
        />

        {/* Legend on Top Right */}
        <div className="absolute top-3 right-3 bg-white/95 backdrop-blur-xs border border-[#DCDDD5] rounded-lg p-2.5 space-y-1.5 text-[10px] text-[#252923] pointer-events-none shadow-xs">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#285B49]" />
            <span>P.E.K.A Rover</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#3f463c]" />
            <span>Explored Area</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#2a2e28]" />
            <span>Obstacle</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-xs bg-transparent border border-dashed border-[#70746D]" />
            <span>Unexplored</span>
          </div>
          {activeLayers.hazard && (
            <div className="flex items-center gap-2 pt-1 border-t border-[#DCDDD5] text-[#B77927]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#B77927]" />
              <span>Hazard Heatmap</span>
            </div>
          )}
        </div>

        {/* Zoom Controls on Bottom Left */}
        <div className="absolute bottom-3 left-3 flex flex-col gap-1 z-10">
          <button
            onClick={handleZoomIn}
            className="w-7 h-7 rounded-md bg-white border border-[#DCDDD5] text-[#252923] hover:bg-[#ECEBE5] flex items-center justify-center transition cursor-pointer shadow-xs"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleZoomOut}
            className="w-7 h-7 rounded-md bg-white border border-[#DCDDD5] text-[#252923] hover:bg-[#ECEBE5] flex items-center justify-center transition cursor-pointer shadow-xs"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleResetView}
            className="w-7 h-7 rounded-md bg-white border border-[#DCDDD5] text-[#252923] hover:bg-[#ECEBE5] flex items-center justify-center transition cursor-pointer shadow-xs"
            title="Locate Robot & Fit View"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Scale Indicator on Bottom Right */}
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 text-[10px] font-mono text-[#ECEBE5] pointer-events-none">
          <div className="w-12 h-1 bg-[#ECEBE5]/60 rounded-xs" />
          <span>5 m</span>
        </div>

        {/* Hover Tooltip on Observation Pin */}
        {hoveredObs && tooltipPos && (
          <div
            style={{
              left: `${tooltipPos.x + 12}px`,
              top: `${tooltipPos.y - 40}px`,
            }}
            className="absolute z-30 pointer-events-none bg-white border border-[#DCDDD5] rounded-md p-2 text-xs text-[#252923] shadow-lg font-mono"
          >
            <div className="font-semibold text-[#285B49]">{hoveredObs.obs_code}</div>
            <div className="text-[10px] text-[#252923]">
              {hoveredObs.title || "Observation"}
            </div>
            <div className="text-[9px] text-[#70746D]">
              Coords: ({hoveredObs.pos_x.toFixed(1)}m, {hoveredObs.pos_y.toFixed(1)}m)
            </div>
            <div className="text-[9px] text-[#285B49] font-medium">
              Confidence: {Math.round(hoveredObs.confidence * 100)}%
            </div>
          </div>
        )}

        {/* Loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center pointer-events-none">
            <span className="text-xs font-mono text-white">
              Loading local occupancy grid...
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
