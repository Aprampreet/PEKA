"use client";

import React from "react";
import { Sidebar } from "./Sidebar";
import { TopHeader } from "./TopHeader";
import { useDashboard } from "../lib/DashboardContext";

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { robotInfo, robotStatus, handleManualRefresh, isRefreshing } = useDashboard();

  return (
    <div className="min-h-screen bg-[#F3F2ED] text-[#242820] font-sans selection:bg-[#285B49]/20 selection:text-[#285B49]">
      {/* 1. Persistent Fixed Navigation Sidebar */}
      <Sidebar robotInfo={robotInfo} robotStatus={robotStatus} />

      {/* 2. Main Mission Content Area with fixed sidebar offset */}
      <div className="pl-56 flex flex-col min-w-0 min-h-screen bg-[#F3F2ED]">
        {/* Top Header */}
        <TopHeader
          onRefresh={handleManualRefresh}
          isRefreshing={isRefreshing}
        />

        {/* View Content Workspace */}
        <main className="flex-1 p-5 lg:p-6 space-y-6 max-w-[1600px] w-full mx-auto bg-[#F3F2ED]">
          {children}
        </main>
      </div>
    </div>
  );
};
