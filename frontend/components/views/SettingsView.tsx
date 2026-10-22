"use client";

import React, { useState } from "react";
import {
  Save,
  CheckCircle2,
  Trash2,
  Sliders,
  ShieldAlert,
} from "lucide-react";
import { api } from "../../lib/api";

interface SettingsViewProps {
  onRefresh: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onRefresh }) => {
  const [incidentCode, setIncidentCode] = useState<string>("INCIDENT 042");
  const [operatorCallsign, setOperatorCallsign] = useState<string>("Lead Operator - Alpha");
  const [streamProtocol, setStreamProtocol] = useState<"ws" | "mjpeg">("ws");
  const [detectionThreshold, setDetectionThreshold] = useState<number>(0.85);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const [clearMessage, setClearMessage] = useState<string | null>(null);

  const handleSave = () => {
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  const handleClearUnreviewed = async () => {
    if (
      !confirm(
        "Purge all unreviewed observations from the queue? Confirmed survivor records will remain intact."
      )
    ) {
      return;
    }
    setIsClearing(true);
    try {
      const res = await api.clearUnreviewedObservations();
      setClearMessage(`Purged ${res.count} unreviewed records.`);
      onRefresh();
      setTimeout(() => setClearMessage(null), 3000);
    } catch (e) {
      console.error("Purge error:", e);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="p-4 rounded-xl bg-white border border-[#DCDDD5] flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#285B49]" />
            <h2 className="text-base font-semibold text-[#252923]">
              Platform & Mission Configuration
            </h2>
          </div>
          <p className="text-xs text-[#70746D] mt-0.5">
            Operational incident identifier, video pipe preferences, and operator session parameters
          </p>
        </div>
        <button
          onClick={handleSave}
          className="px-4 py-2 rounded-lg bg-[#285B49] hover:bg-[#1e4638] text-white text-xs font-medium transition flex items-center gap-2 cursor-pointer shadow-xs"
        >
          {isSaved ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          <span>{isSaved ? "Saved!" : "Save Settings"}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Mission Configuration */}
        <div className="p-5 rounded-xl bg-white border border-[#DCDDD5] space-y-4 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-[#ECEBE5] border border-[#DCDDD5] flex items-center justify-center text-[#285B49]">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-[#252923]">
              Incident Identity
            </h3>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="text-[#70746D] font-medium block mb-1">
                Incident Identifier
              </label>
              <input
                type="text"
                value={incidentCode}
                onChange={(e) => setIncidentCode(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-[#F5F4F0] border border-[#DCDDD5] text-[#252923] focus:outline-none focus:border-[#285B49] font-mono"
              />
              <span className="text-[10px] text-[#70746D] mt-1 block">
                Displayed in tactical headers and exported incident briefs.
              </span>
            </div>

            <div>
              <label className="text-[#70746D] font-medium block mb-1">
                Operator Call-sign
              </label>
              <input
                type="text"
                value={operatorCallsign}
                onChange={(e) => setOperatorCallsign(e.target.value)}
                className="w-full p-2.5 rounded-lg bg-[#F5F4F0] border border-[#DCDDD5] text-[#252923] focus:outline-none focus:border-[#285B49]"
              />
            </div>
          </div>
        </div>

        {/* Vision & Optical Pipe Preferences */}
        <div className="p-5 rounded-xl bg-white border border-[#DCDDD5] space-y-4 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-[#ECEBE5] border border-[#DCDDD5] flex items-center justify-center text-[#285B49]">
              <Sliders className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-[#252923]">
              Optical Stream & AI Tuning
            </h3>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <label className="text-[#70746D] font-medium block mb-1">
                Preferred Video Pipe Protocol
              </label>
              <select
                value={streamProtocol}
                onChange={(e) => setStreamProtocol(e.target.value as "ws" | "mjpeg")}
                className="w-full p-2.5 rounded-lg bg-[#F5F4F0] border border-[#DCDDD5] text-[#252923] focus:outline-none focus:border-[#285B49] font-mono"
              >
                <option value="ws">WebSocket Binary Pipe (Ultra-low latency, recommended)</option>
                <option value="mjpeg">HTTP MJPEG (Multipart replacement)</option>
              </select>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[#70746D] font-medium">
                  Perception Face Persistence Threshold
                </label>
                <span className="font-mono text-[#285B49] font-semibold">
                  {Math.round(detectionThreshold * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="0.6"
                max="0.95"
                step="0.05"
                value={detectionThreshold}
                onChange={(e) => setDetectionThreshold(parseFloat(e.target.value))}
                className="w-full accent-[#285B49] cursor-pointer"
              />
              <span className="text-[10px] text-[#70746D] mt-1 block">
                Higher threshold prevents false positives during rapid camera movement.
              </span>
            </div>
          </div>
        </div>

        {/* Database Maintenance */}
        <div className="p-5 rounded-xl bg-white border border-[#DCDDD5] space-y-4 lg:col-span-2 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-md bg-[#ECEBE5] border border-[#DCDDD5] flex items-center justify-center text-[#B4493F]">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#252923]">
                Evidence Database Maintenance
              </h3>
              <p className="text-xs text-[#70746D]">
                Purge transient unverified detections while preserving confirmed records
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 rounded-lg bg-[#F5F4F0] border border-[#DCDDD5]">
            <div>
              <div className="text-xs font-semibold text-[#252923]">
                Clear Unreviewed Observations Queue
              </div>
              <div className="text-[11px] text-[#70746D]">
                Removes records in &apos;unreviewed&apos; state. Does not alter confirmed survivors or incident dispatches.
              </div>
              {clearMessage && (
                <div className="text-xs text-[#285B49] font-mono mt-1 font-semibold">
                  {clearMessage}
                </div>
              )}
            </div>
            <button
              onClick={handleClearUnreviewed}
              disabled={isClearing}
              className="px-4 py-2 rounded-lg bg-[#B4493F] hover:bg-[#963c33] text-white text-xs font-medium transition cursor-pointer disabled:opacity-50 shadow-xs"
            >
              {isClearing ? "Purging..." : "Purge Unreviewed"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
