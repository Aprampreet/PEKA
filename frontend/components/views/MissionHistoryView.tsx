"use client";

import React, { useState } from "react";
import {
  Download,
  Search,
  Radio,
  Video,
  Shield,
  Cpu,
} from "lucide-react";
import { ActivityEvent } from "../../lib/types";

interface MissionHistoryViewProps {
  events: ActivityEvent[];
}

export const MissionHistoryView: React.FC<MissionHistoryViewProps> = ({ events }) => {
  const [searchQuery, setSearchQuery] = useState<string>("" );
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  const filteredEvents = events.filter((e) => {
    const matchesCategory =
      selectedCategory === "all" || e.category === selectedCategory;
    const matchesSearch =
      searchQuery.trim() === "" ||
      e.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleExportJson = () => {
    const dataStr =
      "data:text/json;charset=utf-8," +
      encodeURIComponent(JSON.stringify(events, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `piper_mission_audit_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "connection":
        return <Radio className="w-4 h-4 text-[#57758A]" />;
      case "camera":
        return <Video className="w-4 h-4 text-[#285B49]" />;
      case "command":
        return <Shield className="w-4 h-4 text-[#B77927]" />;
      default:
        return <Cpu className="w-4 h-4 text-[#7D8964]" />;
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
              Mission Event History & Operational Audit Trail
            </h2>
          </div>
          <p className="text-xs text-[#70746D] mt-0.5">
            Chronological audit log of all navigation commands, sensor perception alerts, and operator actions
          </p>
        </div>
        <button
          onClick={handleExportJson}
          className="px-3.5 py-2 rounded-lg bg-[#ECEBE5] hover:bg-[#e2e0d8] border border-[#DCDDD5] text-xs font-medium text-[#252923] transition flex items-center gap-2 cursor-pointer shadow-xs"
        >
          <Download className="w-4 h-4 text-[#285B49]" />
          <span>Export Audit (JSON)</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-xl bg-white border border-[#DCDDD5] flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-[#70746D] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search activity events, keywords, topics..."
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-[#F5F4F0] border border-[#DCDDD5] text-xs text-[#252923] placeholder-[#70746D] focus:outline-none focus:border-[#285B49]"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {["all", "connection", "command", "camera", "system"].map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition cursor-pointer ${
                selectedCategory === cat
                  ? "bg-[#285B49] text-white shadow-xs"
                  : "bg-[#F5F4F0] border border-[#DCDDD5] text-[#70746D] hover:text-[#252923]"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Events List */}
      <div className="rounded-xl bg-white border border-[#DCDDD5] p-5 shadow-xs">
        <div className="space-y-2.5">
          {filteredEvents.length === 0 ? (
            <div className="py-12 text-center text-[#70746D] text-xs">
              No matching mission activity events found.
            </div>
          ) : (
            filteredEvents.map((evt) => (
              <div
                key={evt.id}
                className="p-3 rounded-lg bg-[#F5F4F0] border border-[#DCDDD5] flex items-start justify-between gap-4 hover:border-[#70746D] hover:bg-[#ECEBE5] transition"
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-md bg-white border border-[#DCDDD5] flex items-center justify-center shrink-0 mt-0.5">
                    {getCategoryIcon(evt.category)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white text-[#70746D] border border-[#DCDDD5] uppercase">
                        {evt.category}
                      </span>
                      <span
                        className={`text-[10px] font-mono font-semibold uppercase ${
                          evt.level === "error"
                            ? "text-[#B4493F]"
                            : evt.level === "warning"
                            ? "text-[#B77927]"
                            : evt.level === "success"
                            ? "text-[#285B49]"
                            : "text-[#70746D]"
                        }`}
                      >
                        {evt.level}
                      </span>
                      {evt.is_simulated && (
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[#ECEBE5] text-[#70746D] border border-[#DCDDD5]">
                          DEMO
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#252923] font-medium mt-1">
                      {evt.message}
                    </p>
                  </div>
                </div>
                <div className="text-[11px] font-mono text-[#70746D] shrink-0">
                  {new Date(evt.timestamp).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
