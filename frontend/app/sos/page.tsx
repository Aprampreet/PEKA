"use client";

import React from "react";
import { AppShell } from "../../components/AppShell";
import { EmergencyDashboard } from "../../components/emergency/EmergencyDashboard";

export default function SOSPage() {
  return (
    <AppShell>
      <EmergencyDashboard />
    </AppShell>
  );
}
