"use client";

import React from "react";
import { AppShell } from "../components/AppShell";
import { OperationalSummary } from "../components/OperationalSummary";
import { RescueSensorWorkspace } from "../components/RescueSensorWorkspace";
import { RobotControls } from "../components/RobotControls";
import { RecentObservations } from "../components/RecentObservations";
import { ActivityTimeline } from "../components/ActivityTimeline";
import { useDashboard } from "../lib/DashboardContext";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertOctagon, ArrowRight } from "lucide-react";

export default function DashboardPage() {
  const {
    robotInfo,
    robotStatus,
    observations,
    activityEvents,
    selectedObsId,
    setSelectedObsId,
    isRefreshing,
    activeCommandState,
    fetchStatusAndEvents,
    handleCommandDispatched,
  } = useDashboard();

  const router = useRouter();
  const isUpstreamLive = Boolean(robotInfo?.upstream_connected && !robotStatus?.is_stale);

  return (
    <AppShell>
      {/* Emergency Response Quick Beacon Access Banner */}
      <div className="rounded-lg border border-red-500/30 bg-gradient-to-r from-[#111827] via-[#1E293B] to-[#111827] p-3 sm:p-4 text-white flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-red-600/20 border border-red-500/50 flex items-center justify-center shrink-0">
            <AlertOctagon className="w-4 h-4 text-red-500 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold tracking-tight text-white">Emergency SOS Response Beacon</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-red-950 text-red-300 border border-red-800">
                DISASTER READY
              </span>
            </div>
            <p className="text-[11px] text-gray-300">
              OpenStreetMap coordinate capture &amp; persistent emergency incident storage
            </p>
          </div>
        </div>
        <Link
          href="/sos"
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-md bg-[#DC2626] hover:bg-red-700 text-white text-xs font-bold shadow-md transition cursor-pointer"
        >
          <span>Open SOS Beacon</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Group 1: Robot and Connection Status (Operational Summary) */}
      <OperationalSummary
        info={robotInfo}
        status={robotStatus}
        activeCommandState={activeCommandState || undefined}
      />

      {/* Group 2: Current Sensor Workspace (Central Visual Focus: Dominant RGB + Stacked Thermal/LiDAR + Evidence Association) */}
      <RescueSensorWorkspace
        isUpstreamLive={isUpstreamLive}
        latestObservation={observations[0] || null}
      />

      {/* Group 3: Recent Observations and Actions (Short, Useful Secondary Section) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Robot High-Level Commands */}
        <RobotControls
          isLiveMode={Boolean(robotInfo?.upstream_connected)}
          onCommandDispatched={handleCommandDispatched}
          activeCommand={activeCommandState}
        />

        {/* Recent Sensor Observations */}
        <RecentObservations
          observations={observations}
          onSelectObservation={(obs) => {
            setSelectedObsId(obs.id);
            router.push("/observations");
          }}
          onViewAll={() => router.push("/observations")}
          onRefresh={fetchStatusAndEvents}
        />

        {/* Audited Event Queue */}
        <ActivityTimeline
          events={activityEvents}
          isLoading={isRefreshing}
          onSelectEvent={(evt) => {
            if (evt.obs_code) {
              const match = observations.find((o) => o.obs_code === evt.obs_code);
              if (match) setSelectedObsId(match.id);
            }
          }}
        />
      </div>
    </AppShell>
  );
}
