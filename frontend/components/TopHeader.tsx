"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { RefreshCw, AlertOctagon } from "lucide-react";
import Link from "next/link";
import { useDashboard } from "../lib/DashboardContext";

interface TopHeaderProps {
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const TopHeader: React.FC<TopHeaderProps> = ({
  onRefresh,
  isRefreshing,
}) => {
  const pathname = usePathname();
  const { robotInfo, robotStatus } = useDashboard();
  const [lastUpdated, setLastUpdated] = useState<string>("Just now");

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setLastUpdated(now.toLocaleTimeString([], { hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const isConnected = Boolean(robotInfo?.upstream_connected && !robotStatus?.is_stale);

  // Derive title from current path
  const getPageMeta = () => {
    if (pathname === "/sos") {
      return {
        title: "Emergency Response & SOS",
        subtitle: "Production emergency incident beacon with OpenStreetMap and verified coordinates",
      };
    }
    if (pathname === "/live-ops") {
      return {
        title: "Live Operations",
        subtitle: "Rescue Sensor Workspace • Multi-Spectrum Sensor Fusion",
      };
    }
    if (pathname === "/map") {
      return {
        title: "Mission Map",
        subtitle: "Spatial intelligence, metric occupancy grid, and exploration zones",
      };
    }
    if (pathname === "/observations") {
      return {
        title: "Observations & Evidence",
        subtitle: "Disaster findings review, survivor identification, and ground dispatch",
      };
    }
    if (pathname === "/history") {
      return {
        title: "Mission History",
        subtitle: "Immutable chronological audit log of all system transitions and commands",
      };
    }
    if (pathname === "/health") {
      return {
        title: "System Health",
        subtitle: "ROS 2 transport diagnostics, bridge latency, and hardware telemetry",
      };
    }
    if (pathname === "/settings") {
      return {
        title: "Settings & Configuration",
        subtitle: "Incident identity, mission profile, and operational thresholds",
      };
    }
    return {
      title: "Operations Overview",
      subtitle: "Primary field summary, optical & thermal feeds, and recent findings",
    };
  };

  const meta = getPageMeta();

  return (
    <header className="px-6 py-3 border-b border-[#D8D9D1] bg-[#FFFFFF] flex items-center justify-between gap-4 sticky top-0 z-30">
      {/* Page Title & Concise Subtitle */}
      <div>
        <h1 className="text-base font-semibold text-[#242820] tracking-tight font-sans">
          {meta.title}
        </h1>
        <p className="text-xs text-[#6C7068]">
          {meta.subtitle}
        </p>
      </div>

      {/* Right: State, Freshness, Refresh, and Operator */}
      <div className="flex items-center gap-3">
        {/* Actual Robot Connection State */}
        <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-[#EAE9E2] border border-[#D8D9D1] text-xs font-mono">
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected ? "bg-[#285B49]" : "bg-[#B77927]"
            }`}
          />
          <span className="text-[#242820] font-medium">
            Robot: {isConnected ? "Connected" : "Disconnected"}
          </span>
        </div>

        {/* Data Freshness Indicator */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#EAE9E2] border border-[#D8D9D1] text-xs font-mono text-[#6C7068]">
          <span>Sync:</span>
          <span className="text-[#242820]">{lastUpdated}</span>
        </div>

        {/* Manual Refresh */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="p-1.5 rounded bg-[#EAE9E2] border border-[#D8D9D1] text-[#6C7068] hover:text-[#242820] hover:border-[#7D8964] transition disabled:opacity-50 cursor-pointer"
            title="Refresh system state"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-[#285B49]" : ""}`}
            />
          </button>
        )}

        {/* Quick Emergency SOS Action */}
        {pathname !== "/sos" && (
          <Link
            href="/sos"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#DC2626] hover:bg-red-700 text-white text-xs font-bold transition shadow-xs cursor-pointer focus-visible:ring-2 focus-visible:ring-red-400"
            title="Open Emergency SOS Interface"
            aria-label="Emergency SOS Beacon"
          >
            <AlertOctagon className="w-3.5 h-3.5 animate-pulse text-white" />
            <span className="tracking-wide">SOS BEACON</span>
          </Link>
        )}

        {/* User / Operator Menu */}
        <div className="flex items-center gap-2 pl-2 border-l border-[#D8D9D1] text-xs text-[#242820]">
          <div className="w-6 h-6 rounded bg-[#EAE9E2] border border-[#D8D9D1] text-[#285B49] font-medium flex items-center justify-center text-[11px]">
            OP
          </div>
          <span className="font-medium hidden md:inline">Operator 1</span>
        </div>
      </div>
    </header>
  );
};
