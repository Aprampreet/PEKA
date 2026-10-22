"use client";

import React, { useState } from "react";
import {
  Clock,
  Video,
  Wifi,
  MapPin,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  Filter,
} from "lucide-react";
import { ActivityEvent } from "../lib/types";

interface ActivityTimelineProps {
  events: ActivityEvent[];
  isLoading?: boolean;
  onSelectEvent?: (event: ActivityEvent) => void;
}

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({
  events,
  isLoading = false,
  onSelectEvent,
}) => {
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [showFilterDropdown, setShowFilterDropdown] = useState<boolean>(false);

  // Baseline reference events
  const baselineEvents = [
    {
      id: "ev-ref-1",
      timestamp: "13:01:28",
      category: "camera",
      title: "Camera connected",
      message: "Live feed from /oak/rgb/image_raw",
      icon: Video,
      iconColor: "text-[#285B49]",
      bgColor: "bg-[#EAE9E2] border border-[#D8D9D1]",
    },
    {
      id: "ev-ref-2",
      timestamp: "13:01:25",
      category: "connection",
      title: "Robot API connected",
      message: "Successfully connected to FastAPI service",
      icon: Wifi,
      iconColor: "text-[#57758A]",
      bgColor: "bg-[#EAE9E2] border border-[#D8D9D1]",
    },
    {
      id: "ev-ref-3",
      timestamp: "13:01:20",
      category: "system",
      title: "Map updated",
      message: "Received new occupancy grid (demo)",
      icon: MapPin,
      iconColor: "text-[#7D8964]",
      bgColor: "bg-[#EAE9E2] border border-[#D8D9D1]",
    },
    {
      id: "ev-ref-4",
      timestamp: "12:58:14",
      category: "command",
      title: "Command sent",
      message: '"start_patrol" published to ROS 2',
      icon: UploadCloud,
      iconColor: "text-[#B77927]",
      bgColor: "bg-[#EAE9E2] border border-[#D8D9D1]",
    },
    {
      id: "ev-ref-5",
      timestamp: "12:58:14",
      category: "command",
      title: "Command acknowledged",
      message: "Command published successfully",
      icon: CheckCircle2,
      iconColor: "text-[#285B49]",
      bgColor: "bg-[#EAE9E2] border border-[#D8D9D1]",
    },
    {
      id: "ev-ref-6",
      timestamp: "12:56:03",
      category: "perception",
      title: "Possible human detected",
      message: "Confidence: 87% • Sector 3",
      icon: AlertTriangle,
      iconColor: "text-[#B4493F]",
      bgColor: "bg-[#EAE9E2] border border-[#D8D9D1]",
    },
  ];

  // Map live API events to display items
  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts);
      return d.toTimeString().substring(0, 8);
    } catch {
      return ts.substring(11, 19) || ts;
    }
  };

  const getEventVisuals = (evt: ActivityEvent) => {
    if (evt.category === "camera") {
      return {
        icon: Video,
        iconColor: "text-[#285B49]",
        bgColor: "bg-[#EAE9E2] border border-[#D8D9D1]",
        title: "Camera connected",
      };
    }
    if (evt.category === "connection") {
      return {
        icon: Wifi,
        iconColor: "text-[#57758A]",
        bgColor: "bg-[#EAE9E2] border border-[#D8D9D1]",
        title: "Robot API connected",
      };
    }
    if (evt.category === "command") {
      if (evt.level === "success") {
        return {
          icon: CheckCircle2,
          iconColor: "text-[#285B49]",
          bgColor: "bg-[#EAE9E2] border border-[#D8D9D1]",
          title: "Command acknowledged",
        };
      }
      return {
        icon: UploadCloud,
        iconColor: "text-[#B77927]",
        bgColor: "bg-[#EAE9E2] border border-[#D8D9D1]",
        title: "Command sent",
      };
    }
    if (evt.level === "error" || evt.category === "perception") {
      return {
        icon: AlertTriangle,
        iconColor: "text-[#B4493F]",
        bgColor: "bg-[#EAE9E2] border border-[#D8D9D1]",
        title: "Possible human detected",
      };
    }
    return {
      icon: MapPin,
      iconColor: "text-[#7D8964]",
      bgColor: "bg-[#EAE9E2] border border-[#D8D9D1]",
      title: "Map updated",
    };
  };

  // Deduplicate consecutive repeated messages
  const deduplicatedEvents: ActivityEvent[] = [];
  events.forEach((evt) => {
    const last = deduplicatedEvents[deduplicatedEvents.length - 1];
    if (
      last &&
      (last.message === evt.message ||
        (last.category === "connection" &&
          evt.category === "connection" &&
          last.level === "error" &&
          evt.level === "error"))
    ) {
      return;
    }
    deduplicatedEvents.push(evt);
  });

  const dynamicEvents = deduplicatedEvents.slice(0, 6).map((evt) => {
    const visuals = getEventVisuals(evt);
    return {
      id: evt.id,
      timestamp: formatTime(evt.timestamp),
      category: evt.category,
      title: visuals.title,
      message: evt.message,
      icon: visuals.icon,
      iconColor: visuals.iconColor,
      bgColor: visuals.bgColor,
      rawEvent: evt,
    };
  });

  const displayList = dynamicEvents.length >= 4 ? dynamicEvents : baselineEvents;

  const filteredItems = displayList.filter((item) => {
    if (filterCategory === "all") return true;
    return item.category === filterCategory;
  });

  return (
    <div className="rounded-md border border-[#D8D9D1] bg-white p-4 flex flex-col justify-between shadow-xs">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-3 relative">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-[#EAE9E2] border border-[#D8D9D1] flex items-center justify-center text-[#285B49]">
              <Clock className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-[#242820] tracking-tight">
              Activity Timeline
            </h3>
          </div>

          {/* Filter Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowFilterDropdown(!showFilterDropdown)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#F3F2ED] border border-[#D8D9D1] text-xs font-medium text-[#6C7068] hover:text-[#242820] hover:border-[#7D8964] transition cursor-pointer"
            >
              <span>Filter</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {showFilterDropdown && (
              <div className="absolute right-0 top-full mt-1 w-36 rounded-md bg-white border border-[#D8D9D1] py-1 shadow-lg z-20 text-xs">
                {["all", "camera", "connection", "command", "system"].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => {
                      setFilterCategory(cat);
                      setShowFilterDropdown(false);
                    }}
                    className={`w-full px-3 py-1.5 text-left capitalize transition cursor-pointer ${
                      filterCategory === cat
                        ? "bg-[#EAE9E2] text-[#285B49] font-medium"
                        : "text-[#6C7068] hover:text-[#242820] hover:bg-[#F3F2ED]"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Timeline Items List */}
        <div className="space-y-2">
          {filteredItems.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                onClick={() => "rawEvent" in item && onSelectEvent?.(item.rawEvent as ActivityEvent)}
                className="flex items-center justify-between gap-3 p-1.5 rounded hover:bg-[#F3F2ED] transition cursor-pointer group"
              >
                {/* Left: Icon & Texts */}
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${item.bgColor}`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${item.iconColor}`} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#242820] truncate group-hover:text-[#285B49] transition">
                      {item.title}
                    </div>
                    <div className="text-[11px] text-[#6C7068] font-normal truncate">
                      {item.message}
                    </div>
                  </div>
                </div>

                {/* Right: Timestamp */}
                <div className="text-[11px] font-mono text-[#6C7068] shrink-0">
                  {item.timestamp}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Subtle bottom note */}
      <div className="mt-4 pt-3 border-t border-[#D8D9D1] flex items-center justify-between text-[11px] text-[#6C7068] font-mono">
        <span>Audited Event Queue</span>
        <span>ROS 2 Synced</span>
      </div>
    </div>
  );
};
