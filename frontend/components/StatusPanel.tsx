"use client";

import React from "react";
import { Cpu, AlertCircle, CheckCircle, Clock, DatabaseZap } from "lucide-react";
import { RobotInfo, RobotStatus } from "../lib/types";

interface StatusPanelProps {
  info: RobotInfo | null;
  status: RobotStatus | null;
}

export const StatusPanel: React.FC<StatusPanelProps> = ({ info, status }) => {
  const isUpstreamAvailable = status?.upstream_available ?? false;
  const isStale = status?.is_stale ?? false;
  const stateStr = status?.state || "INITIALIZING";
  const messageStr = status?.message || "Polling status endpoint...";

  return (
    <div className="rounded-lg border border-slate-800 bg-[#0c1220] flex flex-col overflow-hidden shadow-lg">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-semibold tracking-wide text-slate-200 uppercase font-mono">
            Robot Node Telemetry
          </h2>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
          GET /api/robot/status
        </span>
      </div>

      <div className="p-4 space-y-4">
        {/* Core State Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* State Card */}
          <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/60 flex flex-col justify-between">
            <span className="text-[11px] font-mono text-slate-400">ROBOT STATE</span>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isUpstreamAvailable
                    ? "bg-emerald-400 animate-pulse"
                    : isStale
                    ? "bg-amber-400"
                    : "bg-red-400"
                }`}
              />
              <span className="font-mono font-bold text-base text-slate-100 tracking-wide uppercase">
                {stateStr}
              </span>
            </div>
            <div className="mt-2 text-[10px] font-mono text-slate-500">
              Source: {status?.source === "live" ? "Live Upstream Bridge" : "Standby Simulated State"}
            </div>
          </div>

          {/* Stale / Link Health Card */}
          <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/60 flex flex-col justify-between">
            <span className="text-[11px] font-mono text-slate-400">DATA FRESHNESS</span>
            <div className="flex items-center gap-2 mt-1">
              {isStale ? (
                <>
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span className="font-mono font-bold text-sm text-amber-300">
                    STALE CACHED DATA
                  </span>
                </>
              ) : isUpstreamAvailable ? (
                <>
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span className="font-mono font-bold text-sm text-emerald-300">
                    STREAM ACTIVE
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-4 h-4 text-red-400" />
                  <span className="font-mono font-bold text-sm text-red-300">
                    LINK UNREACHABLE
                  </span>
                </>
              )}
            </div>
            <div className="mt-2 text-[10px] font-mono text-slate-500">
              Updated: {status?.last_updated_at ? new Date(status.last_updated_at).toLocaleTimeString() : "N/A"}
            </div>
          </div>
        </div>

        {/* Status Message String */}
        <div className="p-3 rounded-lg border border-slate-800 bg-black/40 font-mono text-xs space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-[11px]">
            <span>ROBOT IDENTITY: {info?.robot || "PIPER"}</span>
            <span>UPSTREAM: {info?.upstream_url || "localhost:8080"}</span>
          </div>
          <p className="text-slate-200 font-medium break-words">
            &ldquo;{messageStr}&rdquo;
          </p>
        </div>

        {/* Telemetry Transparency Notice */}
        <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-950/40 text-[11px] font-mono text-slate-400 space-y-1.5">
          <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
            <DatabaseZap className="w-3.5 h-3.5 text-cyan-400" />
            <span>Telemetry Disclosure &amp; Scope</span>
          </div>
          <p className="leading-relaxed text-slate-400 text-[10px]">
            The existing robot API implements 4 routes (<code>/</code>, <code>/api/robot/status</code>, <code>/api/robot/command</code>, <code>/api/camera/stream</code>).
            Battery %, speed, motor currents, LiDAR pointclouds, and GPS coordinates are <strong>not exposed</strong> by the robot API and are intentionally omitted rather than fabricated.
          </p>
        </div>
      </div>
    </div>
  );
};
