"use client";

import React from "react";
import { AppShell } from "../../components/AppShell";
import { LiveOperationsView } from "../../components/views/LiveOperationsView";
import { useDashboard } from "../../lib/DashboardContext";

export default function LiveOpsPage() {
  const {
    robotInfo,
    robotStatus,
    observations,
    setSelectedObsId,
    fetchStatusAndEvents,
  } = useDashboard();

  return (
    <AppShell>
      <LiveOperationsView
        robotInfo={robotInfo}
        robotStatus={robotStatus}
        observations={observations}
        onSelectObservation={(obs) => setSelectedObsId(obs.id)}
        onRefresh={fetchStatusAndEvents}
      />
    </AppShell>
  );
}
