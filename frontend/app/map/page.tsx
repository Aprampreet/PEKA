"use client";

import React from "react";
import { AppShell } from "../../components/AppShell";
import { MissionMapView } from "../../components/views/MissionMapView";
import { useDashboard } from "../../lib/DashboardContext";

export default function MissionMapPage() {
  const {
    mapData,
    isMapLoading,
    observations,
    selectedObsId,
    setSelectedObsId,
  } = useDashboard();

  return (
    <AppShell>
      <MissionMapView
        mapData={mapData}
        isLoading={isMapLoading}
        observations={observations}
        selectedObservationId={selectedObsId}
        onSelectObservation={(obs) => setSelectedObsId(obs.id)}
      />
    </AppShell>
  );
}
