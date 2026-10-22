"use client";

import React, { useState, useEffect } from "react";
import { ShieldAlert, Activity, Wifi, WifiOff, Clock } from "lucide-react";
import { RobotInfo, RobotStatus } from "../lib/types";

interface HeaderProps {
  info: RobotInfo | null;
  status: RobotStatus | null;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  info,
  status,
  onRefresh,
  isRefreshing,
}) => {
  const [timeStr, setTimeStr] = useState<string>("");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTimeStr(now.toISOString().replace("T", " ").substring(0, 19) + " UTC");
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const isLive = info?.upstream_connected && !status?.is_stale;
  const isStale = status?.is_stale;
  const isDemo = info?.source === "demo" || !info?.upstream_connected;

  return (
    <header className="border-b border-slate-800 bg-[#090d16]/95 backdrop-blur sticky top-0 z-40">
      {/* Critical Hardware Safety Banner */}
      <div className="bg-amber-950/70 border-b border-amber-800/60 px-4 py-1 text-xs text-amber-200 flex items-center justify-between font-mono">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>
            <strong className="font-semibold text-amber-300">SAFETY PROTOCOL:</strong> Software controls do NOT replace a physical hardware Emergency Stop (E-Stop).
          </span>
        </div>
        <div className="hidden md:flex items-center gap-4 text-[11px] text-amber-300/80">
          <span>OPERATIONAL ZONE: DISASTER INCIDENT A-1</span>
          <span>ROS 2 HUMBLE</span>
        </div>
      </div>

      {/* Main Command Bar */}
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Unit Branding */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded border border-cyan-500/40 bg-cyan-950/40 flex items-center justify-center text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.2)]">
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-base tracking-wider text-slate-100 uppercase">
                P.E.K.A Rescue Intelligence
              </h1>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                Team PIPER
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono">
              UNIT ID: {info?.robot || "PEKA-01"} • ROS 2 NODE: /oak/rgb/image_raw
            </p>
          </div>
        </div>

        {/* Status Indicators & Clock */}
        <div className="flex items-center gap-3 font-mono text-xs">
          {/* Live vs Demo Badge */}
          {isDemo ? (
            <div className="px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span>DEMO / STANDBY MODE</span>
            </div>
          ) : (
            <div className="px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>LIVE ROS 2 BRIDGE</span>
            </div>
          )}

          {/* Upstream Connectivity Badge */}
          <div
            className={`px-2.5 py-1 rounded border flex items-center gap-1.5 ${
              isLive
                ? "bg-emerald-950/40 border-emerald-600/50 text-emerald-300"
                : isStale
                ? "bg-amber-950/40 border-amber-600/50 text-amber-300"
                : "bg-red-950/40 border-red-600/50 text-red-300"
            }`}
          >
            {isLive ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span>LINK ACTIVE</span>
              </>
            ) : isStale ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-amber-400" />
                <span>DATA STALE</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-red-400" />
                <span>LINK OFFLINE</span>
              </>
            )}
          </div>

          {/* Timestamp */}
          <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-slate-300">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>{timeStr || "SYNCING..."}</span>
          </div>

          {/* Manual Refresh Button */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition active:scale-95 disabled:opacity-50 cursor-pointer"
            title="Refresh status polling"
          >
            {isRefreshing ? "POLLING..." : "REFRESH"}
          </button>
        </div>
      </div>
    </header>
  );
};
