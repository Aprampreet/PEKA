"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  RobotInfo,
  RobotStatus,
  MapData,
  ActivityEvent,
  ObservationRecord,
  AllowedCommand,
  CommandResponse,
} from "./types";
import { api } from "./api";

interface DashboardContextType {
  robotInfo: RobotInfo | null;
  robotStatus: RobotStatus | null;
  mapData: MapData | null;
  observations: ObservationRecord[];
  activityEvents: ActivityEvent[];
  selectedObsId: string | null;
  setSelectedObsId: (id: string | null) => void;
  isRefreshing: boolean;
  isMapLoading: boolean;
  activeCommandState: string | null;
  fetchStatusAndEvents: () => Promise<void>;
  handleManualRefresh: () => Promise<void>;
  handleCommandDispatched: (cmd: AllowedCommand, res: CommandResponse) => void;
}

const DashboardContext = createContext<DashboardContextType | null>(null);

export const DashboardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [robotInfo, setRobotInfo] = useState<RobotInfo | null>(null);
  const [robotStatus, setRobotStatus] = useState<RobotStatus | null>(null);
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [observations, setObservations] = useState<ObservationRecord[]>([]);
  const [selectedObsId, setSelectedObsId] = useState<string | null>(null);
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isMapLoading, setIsMapLoading] = useState<boolean>(true);
  const [activeCommandState, setActiveCommandState] = useState<string | null>(null);

  // Poll real-time status, observations, and activity feed
  const fetchStatusAndEvents = useCallback(async () => {
    try {
      const [info, status, events, obsList] = await Promise.all([
        api.getRobotInfo(),
        api.getRobotStatus(),
        api.getActivityEvents(50),
        api.getObservations(),
      ]);
      setRobotInfo(info);
      setRobotStatus(status);
      setActivityEvents(events);
      setObservations(obsList);
    } catch (e) {
      console.error("Status polling error:", e);
    }
  }, []);

  const handleManualRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setIsMapLoading(true);
    try {
      const [map, obsList] = await Promise.all([
        api.getMapData(),
        api.getObservations(),
      ]);
      setMapData(map);
      setObservations(obsList);
      await fetchStatusAndEvents();
    } finally {
      setIsRefreshing(false);
      setIsMapLoading(false);
    }
  }, [fetchStatusAndEvents]);

  useEffect(() => {
    let isMounted = true;

    // Run initial load
    const timer = setTimeout(() => {
      if (isMounted) {
        handleManualRefresh();
      }
    }, 0);

    // 2.5-second polling interval for telemetry & observations
    const interval = setInterval(() => {
      if (isMounted) {
        fetchStatusAndEvents();
      }
    }, 2500);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [fetchStatusAndEvents, handleManualRefresh]);

  const handleCommandDispatched = (cmd: AllowedCommand, res: CommandResponse) => {
    if (res.status !== "failed") {
      setActiveCommandState(cmd);
    }
    fetchStatusAndEvents();
  };

  return (
    <DashboardContext.Provider
      value={{
        robotInfo,
        robotStatus,
        mapData,
        observations,
        activityEvents,
        selectedObsId,
        setSelectedObsId,
        isRefreshing,
        isMapLoading,
        activeCommandState,
        fetchStatusAndEvents,
        handleManualRefresh,
        handleCommandDispatched,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
};

export const useDashboard = () => {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error("useDashboard must be used within a DashboardProvider");
  }
  return context;
};
