"use client";

import React from "react";
import { AppShell } from "../../components/AppShell";
import { SettingsView } from "../../components/views/SettingsView";
import { useDashboard } from "../../lib/DashboardContext";

export default function SettingsPage() {
  const { fetchStatusAndEvents } = useDashboard();

  return (
    <AppShell>
      <SettingsView onRefresh={fetchStatusAndEvents} />
    </AppShell>
  );
}
