"use client";

import React from "react";
import { AppShell } from "../../components/AppShell";
import { ObservationsView } from "../../components/views/ObservationsView";
import { useDashboard } from "../../lib/DashboardContext";

export default function ObservationsPage() {
  const {
    observations,
    fetchStatusAndEvents,
    selectedObsId,
    setSelectedObsId,
  } = useDashboard();

  return (
    <AppShell>
      <ObservationsView
        observations={observations}
        onRefresh={fetchStatusAndEvents}
        selectedObsId={selectedObsId}
        onSelectObservation={(obs) => setSelectedObsId(obs.id)}
      />
    </AppShell>
  );
}
