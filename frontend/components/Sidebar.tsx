"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Radio,
  Map as MapIcon,
  Crosshair,
  History,
  Activity,
  Settings,
} from "lucide-react";
import { RobotInfo, RobotStatus } from "../lib/types";

interface SidebarProps {
  robotInfo?: RobotInfo | null;
  robotStatus?: RobotStatus | null;
}

export const Sidebar: React.FC<SidebarProps> = ({
  robotInfo,
  robotStatus,
}) => {
  const pathname = usePathname();
  const isConnected = Boolean(robotInfo?.upstream_connected && !robotStatus?.is_stale);

  const navItems = [
    { id: "overview", label: "Overview", icon: LayoutDashboard, href: "/" },
    { id: "live_ops", label: "Live Operations", icon: Radio, href: "/live-ops" },
    { id: "map", label: "Mission Map", icon: MapIcon, href: "/map" },
    { id: "observations", label: "Observations", icon: Crosshair, href: "/observations" },
    { id: "history", label: "Mission History", icon: History, href: "/history" },
    { id: "health", label: "System Health", icon: Activity, href: "/health" },
    { id: "settings", label: "Settings", icon: Settings, href: "/settings" },
  ];

  return (
    <aside className="w-56 shrink-0 bg-[#EAE9E2] border-r border-[#D8D9D1] flex flex-col justify-between p-3.5 min-h-screen sticky top-0 h-screen select-none">
      <div className="space-y-5">
        {/* Restrained Brand Header */}
        <Link href="/" className="flex items-center gap-2.5 px-2 py-1.5 group">
          <div className="w-7 h-7 rounded bg-[#285B49] flex items-center justify-center text-white shrink-0 shadow-xs">
            <span className="font-bold text-xs tracking-tight">P</span>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold tracking-tight text-[#242820] font-sans">
                P.E.K.A
              </span>
              <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-[#D8D9D1] text-[#6C7068]">
                ROS 2
              </span>
            </div>
            <p className="text-[11px] text-[#6C7068] leading-tight">
              Rescue Intel • <span className="text-[#285B49] font-medium">Team PIPER</span>
            </p>
          </div>
        </Link>

        {/* Navigation Menu */}
        <nav className="space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/"
                ? pathname === "/" || pathname === "/overview"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.id}
                href={item.href}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-xs transition-colors ${
                  isActive
                    ? "bg-[#FFFFFF] text-[#285B49] font-medium shadow-xs border border-[#D8D9D1]"
                    : "text-[#6C7068] hover:text-[#242820] hover:bg-[#F3F2ED] border border-transparent"
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? "text-[#285B49]" : "text-[#6C7068]"
                  }`}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Compact Robot Link Status Card */}
      <div className="rounded-md border border-[#D8D9D1] bg-[#FFFFFF] p-2.5 space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-[#6C7068]">Robot State</span>
          <span className="flex items-center gap-1.5 font-medium">
            <span
              className={`w-2 h-2 rounded-full ${
                isConnected ? "bg-[#285B49]" : "bg-[#B77927]"
              }`}
            />
            <span className={isConnected ? "text-[#285B49]" : "text-[#B77927]"}>
              {isConnected ? "Connected" : "Standby"}
            </span>
          </span>
        </div>
        <div className="text-[10px] text-[#6C7068] font-mono truncate">
          {robotInfo?.upstream_url || "192.168.1.20:8000"}
        </div>
      </div>
    </aside>
  );
};
