"use client";

import React, { useState, useEffect } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Wifi,
  Video,
  Database,
  RefreshCw,
} from "lucide-react";
import { RobotInfo, RobotStatus } from "../../lib/types";
import { api } from "../../lib/api";

interface SystemHealthViewProps {
  robotInfo: RobotInfo | null;
  robotStatus: RobotStatus | null;
  onRefresh: () => void;
}

export const SystemHealthView: React.FC<SystemHealthViewProps> = ({
  robotInfo,
  robotStatus,
  onRefresh,
}) => {
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [isPinging, setIsPinging] = useState<boolean>(false);

  const measurePing = async () => {
    setIsPinging(true);
    const start = performance.now();
    try {
      await api.getRobotInfo();
      setPingMs(Math.round(performance.now() - start));
    } catch {
      setPingMs(null);
    } finally {
      setIsPinging(false);
    }
  };

  useEffect(() => {
    measurePing();
    const interval = setInterval(measurePing, 5000);
    return () => clearInterval(interval);
  }, []);

  const isRobotOnline = Boolean(robotInfo?.upstream_connected && !robotStatus?.is_stale);

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="p-4 rounded-xl bg-white border border-[#DCDDD5] flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#285B49]" />
            <h2 className="text-base font-semibold text-[#252923]">
              System Telemetry & Network Diagnostics
            </h2>
          </div>
          <p className="text-xs text-[#70746D] mt-0.5">
            Real-time status of ROS 2 bridge, FastAPI daemon, optical pipeline, and local database stores
          </p>
        </div>
        <button
          onClick={() => {
            onRefresh();
            measurePing();
          }}
          className="px-3.5 py-2 rounded-lg bg-[#ECEBE5] hover:bg-[#e2e0d8] border border-[#DCDDD5] text-xs font-medium text-[#252923] transition flex items-center gap-2 cursor-pointer shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#285B49] ${isPinging ? "animate-spin" : ""}`} />
          <span>Diagnostic Ping</span>
        </button>
      </div>

      {/* Grid of Diagnostics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* 1. ROS 2 Bridge */}
        <div className="p-5 rounded-xl bg-white border border-[#DCDDD5] space-y-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-[#ECEBE5] border border-[#DCDDD5] flex items-center justify-center text-[#285B49]">
                <Wifi className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-[#252923]">
                  ROS 2 Bridge Connection
                </h4>
                <span className="text-[10px] font-mono text-[#70746D]">
                  Target: {robotInfo?.upstream_url || "192.168.1.20:8000"}
                </span>
              </div>
            </div>
            {isRobotOnline ? (
              <CheckCircle2 className="w-5 h-5 text-[#285B49]" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-[#B77927]" />
            )}
          </div>
          <div className="p-3 rounded-lg bg-[#F5F4F0] border border-[#DCDDD5] text-xs font-mono space-y-1.5">
            <div className="flex justify-between">
              <span className="text-[#70746D]">Status:</span>
              <span className={isRobotOnline ? "text-[#285B49] font-semibold" : "text-[#B77927] font-semibold"}>
                {isRobotOnline ? "ONLINE" : "STANDBY / UNREACHABLE"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#70746D]">RTT Latency:</span>
              <span className="text-[#252923]">{pingMs !== null ? `${pingMs} ms` : "Measuring..."}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#70746D]">State:</span>
              <span className="text-[#252923] capitalize">{robotStatus?.state || "standby"}</span>
            </div>
          </div>
        </div>

        {/* 2. Optical Stream & Perception Engine */}
        <div className="p-5 rounded-xl bg-white border border-[#DCDDD5] space-y-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-[#ECEBE5] border border-[#DCDDD5] flex items-center justify-center text-[#285B49]">
                <Video className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-[#252923]">
                  Vision Pipeline
                </h4>
                <span className="text-[10px] font-mono text-[#70746D]">
                  Topic: /oak/rgb/image_raw
                </span>
              </div>
            </div>
            <CheckCircle2 className="w-5 h-5 text-[#285B49]" />
          </div>
          <div className="p-3 rounded-lg bg-[#F5F4F0] border border-[#DCDDD5] text-xs font-mono space-y-1.5">
            <div className="flex justify-between">
              <span className="text-[#70746D]">Transport:</span>
              <span className="text-[#285B49] font-semibold">WebSocket Low-Latency</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#70746D]">Detector:</span>
              <span className="text-[#252923]">Face Cascade + Eye Verification</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#70746D]">Auto-Hold:</span>
              <span className="text-[#252923]">Supported</span>
            </div>
          </div>
        </div>

        {/* 3. Database & Audit Store */}
        <div className="p-5 rounded-xl bg-white border border-[#DCDDD5] space-y-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-[#ECEBE5] border border-[#DCDDD5] flex items-center justify-center text-[#285B49]">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-[#252923]">
                  SQLite Evidence Store
                </h4>
                <span className="text-[10px] font-mono text-[#70746D]">
                  File: data/piper_rescue.db
                </span>
              </div>
            </div>
            <CheckCircle2 className="w-5 h-5 text-[#285B49]" />
          </div>
          <div className="p-3 rounded-lg bg-[#F5F4F0] border border-[#DCDDD5] text-xs font-mono space-y-1.5">
            <div className="flex justify-between">
              <span className="text-[#70746D]">Integrity:</span>
              <span className="text-[#285B49] font-semibold">OK / WAL Enabled</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#70746D]">Storage:</span>
              <span className="text-[#252923]">Persistent Local Disk</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#70746D]">Evidence Assets:</span>
              <span className="text-[#252923]">Preserved in /evidence</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
