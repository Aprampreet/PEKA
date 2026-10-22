"use client";

import React, { useState } from "react";
import { Terminal, Radio, Shield, Camera, Cpu } from "lucide-react";
import { ActivityEvent } from "../lib/types";

interface ActivityFeedProps {
  events: ActivityEvent[];
  isLoading: boolean;
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({ events, isLoading }) => {
  const [filter, setFilter] = useState<string>("all");

  const categoryIcons: Record<string, React.ReactNode> = {
    connection: <Radio className="w-3.5 h-3.5 text-cyan-400" />,
    command: <Shield className="w-3.5 h-3.5 text-amber-400" />,
    camera: <Camera className="w-3.5 h-3.5 text-blue-400" />,
    system: <Cpu className="w-3.5 h-3.5 text-emerald-400" />,
  };

  const filteredEvents = events.filter((e) => {
    if (filter === "all") return true;
    return e.category === filter;
  });

  return (
    <div className="rounded-lg border border-slate-800 bg-[#0c1220] flex flex-col overflow-hidden shadow-lg">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-semibold tracking-wide text-slate-200 uppercase font-mono">
            Operational Activity Feed
          </h2>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
            OBSERVED AUDIT TRAIL
          </span>
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1 text-[11px] font-mono">
          {["all", "connection", "command", "camera", "system"].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-2 py-0.5 rounded border transition uppercase cursor-pointer ${
                filter === cat
                  ? "bg-cyan-950/60 border-cyan-700 text-cyan-300"
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Events List */}
      <div className="p-3 max-h-72 overflow-y-auto space-y-2 font-mono text-xs">
        {filteredEvents.length === 0 ? (
          <div className="py-6 text-center text-slate-500 text-xs">
            {isLoading ? "Fetching activity stream..." : "No events recorded in this category."}
          </div>
        ) : (
          filteredEvents.map((evt) => (
            <div
              key={evt.id}
              className="p-2 rounded bg-slate-900/50 border border-slate-800/80 flex items-start justify-between gap-3 hover:bg-slate-900/80 transition"
            >
              <div className="flex items-start gap-2.5 flex-1 min-w-0">
                <div className="mt-0.5 shrink-0">
                  {categoryIcons[evt.category] || <Cpu className="w-3.5 h-3.5 text-slate-400" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-slate-500 uppercase">
                      [{evt.category}]
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase ${
                        evt.level === "error"
                          ? "text-red-400"
                          : evt.level === "warning"
                          ? "text-amber-400"
                          : evt.level === "success"
                          ? "text-emerald-400"
                          : "text-slate-300"
                      }`}
                    >
                      {evt.level}
                    </span>
                    {evt.is_simulated && (
                      <span className="text-[9px] px-1 rounded bg-amber-950/60 text-amber-300 border border-amber-800/60">
                        SIMULATED
                      </span>
                    )}
                  </div>
                  <p className="text-slate-200 text-xs mt-0.5 break-words">
                    {evt.message}
                  </p>
                </div>
              </div>
              <span className="text-[10px] text-slate-500 shrink-0 self-start mt-0.5">
                {new Date(evt.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
