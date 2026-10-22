"use client";

import React from "react";
import { AppShell } from "../../components/AppShell";
import { MissionHistoryView } from "../../components/views/MissionHistoryView";
import { useDashboard } from "../../lib/DashboardContext";

export default function MissionHistoryPage() {
  const { activityEvents } = useDashboard();

  return (
    <AppShell>
      <MissionHistoryView events={activityEvents} />
    </AppShell>
  );
}
