"use client";

import React from "react";
import { RescueSensorWorkspace } from "../RescueSensorWorkspace";
import { RobotControls } from "../RobotControls";
import { ObservationRecord, RobotInfo, RobotStatus } from "../../lib/types";
import { Radio } from "lucide-react";

interface LiveOperationsViewProps {
  robotInfo: RobotInfo | null;
  robotStatus: RobotStatus | null;
  observations: ObservationRecord[];
  onSelectObservation: (obs: ObservationRecord) => void;
  onRefresh: () => void;
}

export const LiveOperationsView: React.FC<LiveOperationsViewProps> = ({
  robotInfo,
  robotStatus,
  observations,
  onRefresh,
}) => {
  const isUpstreamLive = Boolean(robotInfo?.upstream_connected && !robotStatus?.is_stale);

  return (
    <div className="space-y-5">
      {/* 1. Restrained Top Operational Header */}
      <div className="p-4 rounded-md bg-[#FFFFFF] border border-[#D8D9D1] flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-[#285B49]" />
            <h2 className="text-base font-semibold text-[#242820]">
              Live Operations
            </h2>
          </div>
          <p className="text-xs text-[#6C7068] mt-0.5">
            Rescue sensor workspace • Primary optical reference, thermal evidence, and 3D LiDAR point cloud
          </p>
        </div>

        {/* Compact Right Status Block */}
        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="px-3 py-1.5 rounded bg-[#F3F2ED] border border-[#D8D9D1] text-[#242820] flex items-center gap-2">
            <span>Robot:</span>
            <span className="flex items-center gap-1.5 font-semibold">
              <span
                className={`w-2 h-2 rounded-full ${
                  isUpstreamLive ? "bg-[#285B49]" : "bg-[#B77927]"
                }`}
              />
              <span className={isUpstreamLive ? "text-[#285B49]" : "text-[#B77927]"}>
                {isUpstreamLive ? "Connected" : "Disconnected"}
              </span>
            </span>
          </div>

          <div className="px-3 py-1.5 rounded bg-[#F3F2ED] border border-[#D8D9D1] text-[#6C7068]">
            Telemetry: <span className="text-[#242820]">10 Hz Synced</span>
          </div>
        </div>
      </div>

      {/* 2. Main Feature: Dedicated Rescue Sensor Workspace (Dominant Camera 68%, Stacked Thermal/LiDAR 32%, Evidence Association) */}
      <RescueSensorWorkspace
        isUpstreamLive={isUpstreamLive}
        latestObservation={observations[0] || null}
      />

      {/* 3. Compact Separated Control Area */}
      <div className="max-w-xl">
        <RobotControls
          isLiveMode={Boolean(robotInfo?.upstream_connected)}
          onCommandDispatched={() => onRefresh()}
        />
      </div>
    </div>
  );
};
