"use client";

import React from "react";
import { MissionMap } from "../MissionMap";
import { LidarViewer } from "../LidarViewer";
import { MapData, ObservationRecord } from "../../lib/types";

interface MissionMapViewProps {
  mapData: MapData | null;
  isLoading: boolean;
  observations: ObservationRecord[];
  selectedObservationId: string | null;
  onSelectObservation: (obs: ObservationRecord) => void;
}

export const MissionMapView: React.FC<MissionMapViewProps> = ({
  mapData,
  isLoading,
  observations,
  selectedObservationId,
  onSelectObservation,
}) => {
  const [viewMode, setViewMode] = React.useState<"2d" | "3d">("2d");

  return (
    <div className="space-y-5">
      {/* Map Header */}
      <div className="p-4 rounded-md bg-white border border-[#D8D9D1] flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#285B49]" />
            <h2 className="text-base font-semibold text-[#242820]">
              Spatial Disaster Map &amp; 3D Odometry
            </h2>
          </div>
          <p className="text-xs text-[#6C7068] mt-0.5">
            2D metric occupancy grid and real-time 3D Point-LIO registered spatial point cloud
          </p>
        </div>

        {/* View Mode Toggle & Metrics */}
        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center p-0.5 rounded bg-[#F3F2ED] border border-[#D8D9D1]">
            <button
              onClick={() => setViewMode("2d")}
              className={`px-3 py-1 rounded text-xs transition cursor-pointer font-sans ${
                viewMode === "2d"
                  ? "bg-[#285B49] text-white font-medium shadow-xs"
                  : "text-[#6C7068] hover:text-[#242820]"
              }`}
            >
              2D Occupancy Grid
            </button>
            <button
              onClick={() => setViewMode("3d")}
              className={`px-3 py-1 rounded text-xs transition cursor-pointer font-sans ${
                viewMode === "3d"
                  ? "bg-[#285B49] text-white font-medium shadow-xs"
                  : "text-[#6C7068] hover:text-[#242820]"
              }`}
            >
              3D Point-LIO Cloud
            </button>
          </div>

          <div className="hidden sm:block px-3 py-1.5 rounded bg-[#F3F2ED] border border-[#D8D9D1] text-[#242820]">
            Frame: <span className="font-semibold text-[#242820]">{viewMode === "3d" ? "camera_init" : "ROS 2 /map"}</span>
          </div>
        </div>
      </div>

      {/* Main Map Component with 2D/3D Mode */}
      <div className="grid grid-cols-1 gap-6">
        {viewMode === "2d" ? (
          <MissionMap
            mapData={mapData}
            isLoading={isLoading}
            observations={observations}
            selectedObservationId={selectedObservationId}
            onSelectObservation={onSelectObservation}
          />
        ) : (
          <div className="rounded-md border border-[#D8D9D1] bg-[#121411] p-1">
            <LidarViewer />
          </div>
        )}
      </div>

      {/* Spatial Intelligence Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-md bg-white border border-[#D8D9D1] space-y-1 shadow-xs">
          <span className="text-[10px] font-mono text-[#6C7068] uppercase tracking-wider">
            Explored Perimeter
          </span>
          <div className="text-xl font-semibold text-[#242820]">
            184 m²
          </div>
          <p className="text-[11px] text-[#285B49] font-medium">
            36% of Sector 3 mapped
          </p>
        </div>

        <div className="p-4 rounded-md bg-white border border-[#D8D9D1] space-y-1 shadow-xs">
          <span className="text-[10px] font-mono text-[#6C7068] uppercase tracking-wider">
            Hazard Hotspots
          </span>
          <div className="text-xl font-semibold text-[#242820]">
            3 Clusters
          </div>
          <p className="text-[11px] text-[#B77927] font-medium">
            Rubble collapse &amp; unstable walls
          </p>
        </div>

        <div className="p-4 rounded-md bg-white border border-[#D8D9D1] space-y-1 shadow-xs">
          <span className="text-[10px] font-mono text-[#6C7068] uppercase tracking-wider">
            Observation Pins
          </span>
          <div className="text-xl font-semibold text-[#242820]">
            {observations.length} Registered
          </div>
          <p className="text-[11px] text-[#285B49] font-medium">
            Optical evidence geo-tagged
          </p>
        </div>

        <div className="p-4 rounded-md bg-white border border-[#D8D9D1] space-y-1 shadow-xs">
          <span className="text-[10px] font-mono text-[#6C7068] uppercase tracking-wider">
            Robot Staging Pose
          </span>
          <div className="text-xl font-semibold text-[#242820] font-mono">
            X: 0.0m Y: 0.0m
          </div>
          <p className="text-[11px] text-[#6C7068] font-medium">
            Orientation: Heading 45° NE
          </p>
        </div>
      </div>
    </div>
  );
};
