"use client";

import React from "react";
import { Bot, Video, Compass, Activity } from "lucide-react";
import { RobotInfo, RobotStatus } from "../lib/types";

interface OperationalSummaryProps {
  info: RobotInfo | null;
  status: RobotStatus | null;
  activeCommandState?: string;
}

export const OperationalSummary: React.FC<OperationalSummaryProps> = ({
  info,
  status,
  activeCommandState,
}) => {
  const isRobotOnline = Boolean(info?.upstream_connected && !status?.is_stale);
  const isCameraLive = Boolean(info?.upstream_connected);

  // Mission state
  let missionTitle = "Standby";
  let missionSubtitle = "No active patrol command";
  let missionDotColor = "bg-[#6C7068]";

  if (activeCommandState === "start_patrol") {
    missionTitle = "Patrolling";
    missionSubtitle = "Autonomous search active";
    missionDotColor = "bg-[#285B49]";
  } else if (activeCommandState === "pause_patrol") {
    missionTitle = "Paused";
    missionSubtitle = "Movement temporarily halted";
    missionDotColor = "bg-[#B77927]";
  } else if (activeCommandState === "return_to_base") {
    missionTitle = "Returning";
    missionSubtitle = "Navigating to home base";
    missionDotColor = "bg-[#6C7068]";
  } else if (status?.state && status.state !== "unknown") {
    missionTitle = status.state.replace("_", " ").toUpperCase();
    missionSubtitle = status.message || "State reported";
    missionDotColor = isRobotOnline ? "bg-[#285B49]" : "bg-[#6C7068]";
  }

  // System Health
  const isHealthGood = isRobotOnline;
  const healthTitle = isHealthGood ? "Nominal" : "Degraded";
  const healthSubtitle = isHealthGood
    ? "All interfaces communicating"
    : "Upstream ROS 2 bridge standby";
  const healthDotColor = isHealthGood ? "bg-[#285B49]" : "bg-[#B77927]";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
      {/* 1. Robot Status */}
      <div className="rounded-md border border-[#D8D9D1] bg-[#FFFFFF] p-3.5 flex items-start justify-between shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-[#6C7068] font-medium">
            <Bot className="w-3.5 h-3.5 text-[#285B49]" />
            <span>Robot Connection</span>
          </div>
          <div className="text-lg font-semibold text-[#242820] tracking-tight">
            {isRobotOnline ? "Online" : "Standby"}
          </div>
          <div className="text-xs text-[#6C7068]">
            {isRobotOnline ? "Ready for operation" : "Awaiting ROS 2 bridge"}
          </div>
        </div>
        <span
          className={`w-2 h-2 rounded-full shrink-0 mt-1 ${
            isRobotOnline ? "bg-[#285B49]" : "bg-[#B77927]"
          }`}
        />
      </div>

      {/* 2. Optical Stream */}
      <div className="rounded-md border border-[#D8D9D1] bg-[#FFFFFF] p-3.5 flex items-start justify-between shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-[#6C7068] font-medium">
            <Video className="w-3.5 h-3.5 text-[#242820]" />
            <span>Optical Stream</span>
          </div>
          <div className="text-lg font-semibold text-[#242820] tracking-tight">
            {isCameraLive ? "Live" : "Offline"}
          </div>
          <div className="text-xs text-[#6C7068] font-mono">
            OAK-D RGB • 640×400
          </div>
        </div>
        <span
          className={`w-2 h-2 rounded-full shrink-0 mt-1 ${
            isCameraLive ? "bg-[#285B49]" : "bg-[#B77927]"
          }`}
        />
      </div>

      {/* 3. Mission Status */}
      <div className="rounded-md border border-[#D8D9D1] bg-[#FFFFFF] p-3.5 flex items-start justify-between shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-[#6C7068] font-medium">
            <Compass className="w-3.5 h-3.5 text-[#6C7068]" />
            <span>Mission Phase</span>
          </div>
          <div className="text-lg font-semibold text-[#242820] tracking-tight capitalize">
            {missionTitle}
          </div>
          <div className="text-xs text-[#6C7068] truncate max-w-[150px]">
            {missionSubtitle}
          </div>
        </div>
        <span className={`w-2 h-2 rounded-full shrink-0 mt-1 ${missionDotColor}`} />
      </div>

      {/* 4. System Health */}
      <div className="rounded-md border border-[#D8D9D1] bg-[#FFFFFF] p-3.5 flex items-start justify-between shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-[#6C7068] font-medium">
            <Activity className="w-3.5 h-3.5 text-[#285B49]" />
            <span>System State</span>
          </div>
          <div className="text-lg font-semibold text-[#242820] tracking-tight">
            {healthTitle}
          </div>
          <div className="text-xs text-[#6C7068] truncate max-w-[150px]">
            {healthSubtitle}
          </div>
        </div>
        <span className={`w-2 h-2 rounded-full shrink-0 mt-1 ${healthDotColor}`} />
      </div>
    </div>
  );
};
