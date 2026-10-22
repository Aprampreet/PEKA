"use client";

import React from "react";
import { AppShell } from "../../components/AppShell";
import { SystemHealthView } from "../../components/views/SystemHealthView";
import { useDashboard } from "../../lib/DashboardContext";

export default function SystemHealthPage() {
  const { robotInfo, robotStatus, handleManualRefresh } = useDashboard();

  return (
    <AppShell>
      <SystemHealthView
        robotInfo={robotInfo}
        robotStatus={robotStatus}
        onRefresh={handleManualRefresh}
      />
    </AppShell>
  );
}
