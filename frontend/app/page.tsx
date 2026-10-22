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
