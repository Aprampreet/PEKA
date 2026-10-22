"use client";

import React from "react";
import { DashboardProvider } from "../lib/DashboardContext";

export const Providers: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <DashboardProvider>{children}</DashboardProvider>;
};
