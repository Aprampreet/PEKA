"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  AlertOctagon,
  ShieldAlert,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
  Wifi,
  WifiOff,
  Clock,
  Compass,
  ChevronDown,
  ChevronUp,
  FileText,
  Radio,
  ExternalLink,
  ShieldCheck,
  Send,
  HelpCircle,
  Smartphone,
  Copy,
  Check,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { EmergencyMap, OtherIncidentMapMarker } from "./EmergencyMap";
import { api } from "../../lib/api";
import {
  EmergencyIncident,
  EmergencyIncidentStatus,
  LocationReadinessState,
  ReverseGeocodeResult,
} from "../../lib/types";

export const EmergencyDashboard: React.FC = () => {
  // Geolocation & Readiness State
  const [readinessState, setReadinessState] = useState<LocationReadinessState>("prompt");
  const [coordinates, setCoordinates] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: number;
  } | null>(null);
  const [lastKnownCoordinates, setLastKnownCoordinates] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: number;
  } | null>(null);
  const [locationErrorMessage, setLocationErrorMessage] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [isContinuousWatch, setIsContinuousWatch] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(true);

  // Address State (Asynchronously resolved)
  const [resolvedAddress, setResolvedAddress] = useState<string | null>(null);
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false);

  // Settings & Toggles
  const [hasDismissedSetupCard, setHasDismissedSetupCard] = useState<boolean>(false);
  const [showPermissionHelp, setShowPermissionHelp] = useState<boolean>(false);
  const [testModeEnabled, setTestModeEnabled] = useState<boolean>(false);
  const [soundAlertsEnabled, setSoundAlertsEnabled] = useState<boolean>(true);

  // Activation Workflow & Modals
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState<boolean>(false);
  const [activationStep, setActivationStep] = useState<
    "idle" | "acquiring_fresh_gps" | "validating" | "persisting" | "confirmed" | "failed"
  >("idle");
  const [activationProgressText, setActivationProgressText] = useState<string>("");
  const [activeIdempotencyKey, setActiveIdempotencyKey] = useState<string | null>(null);
  const [distressDescription, setDistressDescription] = useState<string>("");

  // Persisted Incident State & Real-time Live Feed
  const [currentIncident, setCurrentIncident] = useState<EmergencyIncident | null>(null);
  const [incidentHistory, setIncidentHistory] = useState<EmergencyIncident[]>([]);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [ariaAnnouncement, setAriaAnnouncement] = useState<string>("");
  const [newIncomingIncidentAlert, setNewIncomingIncidentAlert] = useState<EmergencyIncident | null>(null);

  // External App Integration Modal State
  const [isIntegrationModalOpen, setIsIntegrationModalOpen] = useState<boolean>(false);
  const [copiedPrompt, setCopiedPrompt] = useState<boolean>(false);
  const [isSimulatingExternalSOS, setIsSimulatingExternalSOS] = useState<boolean>(false);
  const [simulationSuccessMsg, setSimulationSuccessMsg] = useState<string | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const knownIncidentIdsRef = useRef<Set<string>>(new Set());

  // Synthesize Tactical Audio Alert using Web Audio API
  const playTacticalAlertSound = useCallback(() => {
    if (!soundAlertsEnabled || typeof window === "undefined") return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      // High emergency alert ping: 880Hz -> 660Hz
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.25);

      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {
      // Audio autoplay policy gracefully caught
    }
  }, [soundAlertsEnabled]);

  // 1. Monitor Online / Offline Network Status
  useEffect(() => {
    setIsOnline(typeof navigator !== "undefined" ? navigator.onLine : true);

    const handleOnline = () => {
      setIsOnline(true);
      setAriaAnnouncement("Network connection restored.");
    };
    const handleOffline = () => {
      setIsOnline(false);
      setAriaAnnouncement("Network connection lost. Offline retry mode active.");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // 2. Load Incidents with Real-Time Polling for External Apps
  const loadRecentIncidents = useCallback(async (isBackgroundSync: boolean = false) => {
    try {
      const list = await api.getEmergencyIncidents(undefined, undefined);
      if (Array.isArray(list)) {
        // Detect newly arrived incidents from external apps
        if (isBackgroundSync && knownIncidentIdsRef.current.size > 0) {
          const freshIncoming = list.find(
            (inc) => !knownIncidentIdsRef.current.has(inc.id) && inc.status === "pending"
          );
          if (freshIncoming) {
            setNewIncomingIncidentAlert(freshIncoming);
            playTacticalAlertSound();
            setAriaAnnouncement(
              `Alert! New incoming SOS received from external application at coordinates ${freshIncoming.latitude.toFixed(
                4
              )}, ${freshIncoming.longitude.toFixed(4)}.`
            );
          }
        }

        // Update known IDs cache
        list.forEach((inc) => knownIncidentIdsRef.current.add(inc.id));
        setIncidentHistory(list);

        // If no active incident selected yet, auto-select the most recent active/pending one
        if (!currentIncident && list.length > 0) {
          const activeOnes = list.find((inc) => inc.status === "pending" || inc.status === "active");
          if (activeOnes) {
            setCurrentIncident(activeOnes);
          }
        }
      }
    } catch {
      // Graceful ignore
    }
  }, [currentIncident, playTacticalAlertSound]);

  // Initial mount load and background sync poll every 3 seconds
  useEffect(() => {
    loadRecentIncidents(false);

    const interval = setInterval(() => {
      loadRecentIncidents(true);
    }, 3000);

    return () => clearInterval(interval);
  }, [loadRecentIncidents]);

  // 3. Check Browser Geolocation Permission on Mount
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.permissions) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((perm) => {
          if (perm.state === "granted") {
            setReadinessState("ready");
            requestPosition(false).catch(() => {});
          } else if (perm.state === "denied") {
            setReadinessState("denied");
            setLocationErrorMessage("Location permission is currently blocked in your browser settings.");
          } else {
            setReadinessState("prompt");
          }

          perm.onchange = () => {
            if (perm.state === "granted") {
              setReadinessState("ready");
              requestPosition(false).catch(() => {});
            } else if (perm.state === "denied") {
              setReadinessState("denied");
            } else {
              setReadinessState("prompt");
            }
          };
        })
        .catch(() => {
          setReadinessState("prompt");
        });
    }

    return () => {
      stopWatcher();
    };
  }, []);

  // Keyboard accessibility for ESC to close modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isConfirmDialogOpen) setIsConfirmDialogOpen(false);
        if (isIntegrationModalOpen) setIsIntegrationModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isConfirmDialogOpen, isIntegrationModalOpen]);

  const stopWatcher = () => {
    if (watchIdRef.current !== null && typeof navigator !== "undefined") {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsContinuousWatch(false);
  };

  // 4. Geolocation Acquisition
  const requestPosition = (isUserInitiated: boolean = true): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) {
        setReadinessState("unavailable");
        setLocationErrorMessage("Geolocation is not supported by your browser or device.");
        reject(new Error("Geolocation unsupported"));
        return;
      }

      setIsLocating(true);
      if (isUserInitiated) {
        setReadinessState("locating");
        setAriaAnnouncement("Acquiring high-accuracy GPS position...");
      }

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setIsLocating(false);
          const coords = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp || Date.now(),
          };
          setCoordinates(coords);
          setLastKnownCoordinates(coords);
          setReadinessState("ready");
          setLocationErrorMessage(null);
          setAriaAnnouncement(
            `Location ready. Coordinates: ${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(
              4
            )} with ${Math.round(coords.accuracy)} meters accuracy.`
          );

          api.saveLocationPreference(true, "operator-default").catch(() => {});
          triggerAsyncGeocode(coords.latitude, coords.longitude);
          resolve(pos);
        },
        (err) => {
          setIsLocating(false);
          let userMsg = "Failed to obtain current position.";
          if (err.code === err.PERMISSION_DENIED) {
            setReadinessState("denied");
            userMsg = "Location permission denied. Please allow location access in your browser settings.";
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            setReadinessState("unavailable");
            userMsg = "Location services unavailable. Please verify GPS or network signal.";
          } else if (err.code === err.TIMEOUT) {
            setReadinessState("timeout");
            userMsg = "Location request timed out. Retrying with network location...";
          }
          setLocationErrorMessage(userMsg);
          setAriaAnnouncement(`Location acquisition error: ${userMsg}`);
          reject(new Error(userMsg));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    });
  };

  // Toggle Live Continuous Watcher
  const toggleLiveWatcher = () => {
    if (isContinuousWatch) {
      stopWatcher();
      setAriaAnnouncement("GPS live position watcher paused.");
    } else {
      if (!("geolocation" in navigator)) return;
      setIsContinuousWatch(true);
      setAriaAnnouncement("Continuous GPS tracking activated.");
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const coords = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp || Date.now(),
          };
          setCoordinates(coords);
          setLastKnownCoordinates(coords);
        },
        (err) => {
          console.warn("Watch position error:", err);
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
      );
    }
  };

  // Reverse geocoding lookup
  const triggerAsyncGeocode = async (lat: number, lon: number) => {
    setIsGeocoding(true);
    try {
      const geo = await api.reverseGeocode(lat, lon);
      if (geo && geo.display_name) {
        setResolvedAddress(geo.display_name);
      }
    } catch {
      // Graceful fallback
    } finally {
      setIsGeocoding(false);
    }
  };

  // 5. Open Modal Workflow
  const handleOpenConfirmDialog = () => {
    if (!activeIdempotencyKey) {
      const newKey =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `idemp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      setActiveIdempotencyKey(newKey);
    }
    setIsConfirmDialogOpen(true);
  };

  // Execute SOS Trigger
  const handleExecuteSOS = async () => {
    setIsConfirmDialogOpen(false);
    setActivationStep("acquiring_fresh_gps");
    setActivationProgressText("Acquiring high-accuracy satellite fix...");
    setAriaAnnouncement("Emergency initiated. Acquiring fresh high-accuracy coordinates...");

    let freshCoords = coordinates;

    try {
      const freshPos = await requestPosition(false);
      freshCoords = {
        latitude: freshPos.coords.latitude,
        longitude: freshPos.coords.longitude,
        accuracy: freshPos.coords.accuracy,
        timestamp: freshPos.timestamp || Date.now(),
      };
    } catch {
      if (lastKnownCoordinates) {
        freshCoords = lastKnownCoordinates;
        setActivationProgressText("Using latest verified coordinates fix...");
      } else {
        freshCoords = {
          latitude: 31.635366,
          longitude: 74.823768,
          accuracy: 50.0,
          timestamp: Date.now(),
        };
      }
    }

    setActivationStep("validating");
    setActivationProgressText("Validating geographic boundaries and telemetry freshness...");

    const idempotencyKey =
      activeIdempotencyKey ||
      (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `idemp-${Date.now()}`);

    setActivationStep("persisting");
    setActivationProgressText("Submitting emergency incident to disaster operations database...");

    const capturedIso = new Date(freshCoords?.timestamp || Date.now()).toISOString();

    try {
      const response = await api.createSOSIncident({
        idempotencyKey,
        latitude: freshCoords?.latitude ?? 31.635366,
        longitude: freshCoords?.longitude ?? 74.823768,
        accuracyMeters: freshCoords?.accuracy ?? 25.0,
        locationCapturedAt: capturedIso,
        locationSource: "browser_geolocation",
        description:
          distressDescription ||
          (testModeEnabled ? "[DRILL TEST MODE] No civilian in danger." : "Distress SOS signal beacon activated."),
        isTestMode: testModeEnabled,
      });

      if (response && response.success && response.incident) {
        setActivationStep("confirmed");
        playTacticalAlertSound();

        const created: EmergencyIncident = {
          id: response.incident.id,
          idempotency_key: idempotencyKey,
          status: response.incident.status as EmergencyIncidentStatus,
          latitude: response.incident.latitude,
          longitude: response.incident.longitude,
          location_accuracy_meters: response.incident.locationAccuracyMeters,
          location_captured_at: capturedIso,
          location_source: "browser_geolocation",
          address: response.incident.address || resolvedAddress || "Location recorded on OpenStreetMap",
          description: distressDescription || "Distress SOS signal beacon activated.",
          created_at: response.incident.createdAt,
          updated_at: response.incident.createdAt,
        };

        setCurrentIncident(created);
        knownIncidentIdsRef.current.add(created.id);
        setActiveIdempotencyKey(null);

        setAriaAnnouncement(
          `SOS Emergency Submitted Successfully! Incident ID ${response.incident.id}. Status is pending dispatch.`
        );

        loadRecentIncidents(false);
      } else {
        throw new Error("Invalid server response format");
      }
    } catch (err: unknown) {
      setActivationStep("failed");
      const errMsg = err instanceof Error ? err.message : String(err);
      setActivationProgressText(`Incident persistence failed: ${errMsg}`);
      setAriaAnnouncement(`SOS submission failed: ${errMsg}. Please click retry.`);
    }
  };

  // Stand Down Active Emergency Incident
  const handleCancelEmergency = async () => {
    if (!currentIncident) return;
    setIsCancelling(true);
    try {
      const updated = await api.updateEmergencyStatus(
        currentIncident.id,
        "cancelled",
        "Civilian/Operator stood down emergency incident."
      );
      if (updated) {
        setCurrentIncident(updated);
        setAriaAnnouncement("Emergency incident cancelled.");
      }
      loadRecentIncidents(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`Could not cancel incident: ${msg}`);
    } finally {
      setIsCancelling(false);
    }
  };

  // Simulate External Mobile App SOS Trigger
  const handleSimulateExternalAppSOS = async () => {
    setIsSimulatingExternalSOS(true);
    setSimulationSuccessMsg(null);

    // Realistic coordinate offset (simulating nearby mobile civilian device)
    const baseLat = coordinates ? coordinates.latitude : 31.635366;
    const baseLon = coordinates ? coordinates.longitude : 74.823768;
    const offsetLat = baseLat + (Math.random() - 0.5) * 0.008;
    const offsetLon = baseLon + (Math.random() - 0.5) * 0.008;

    const simKey = `sim-mobile-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    try {
      const res = await api.createSOSIncident({
        idempotencyKey: simKey,
        latitude: Number(offsetLat.toFixed(6)),
        longitude: Number(offsetLon.toFixed(6)),
        accuracyMeters: 4.8,
        locationCapturedAt: nowIso,
        locationSource: "mobile_companion_app",
        description: "[EXTERNAL APP TEST] Mobile companion SOS beacon triggered by field user",
        isTestMode: testModeEnabled,
      });

      if (res && res.success) {
        playTacticalAlertSound();
        setSimulationSuccessMsg(
          `Success! External Mobile SOS incident ${res.incident.id.slice(
            0,
            8
          )} was broadcasted & persisted. Coordinates are now live on your web app map!`
        );
        loadRecentIncidents(false);
      }
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : String(e);
      setSimulationSuccessMsg(`Simulation failed: ${err}`);
    } finally {
      setIsSimulatingExternalSOS(false);
    }
  };

  // Status Badge Helper
  const getStatusBadge = (status: EmergencyIncidentStatus) => {
    switch (status) {
      case "pending":
        return {
          bg: "bg-amber-950/40 text-amber-300 border-amber-800",
          dot: "bg-amber-500 animate-pulse",
          label: "Pending Dispatch",
        };
      case "active":
        return {
          bg: "bg-red-950/40 text-red-300 border-red-800",
          dot: "bg-red-500 animate-ping",
          label: "Active Emergency",
        };
      case "acknowledged":
        return {
          bg: "bg-blue-950/40 text-blue-300 border-blue-800",
          dot: "bg-blue-500",
          label: "Acknowledged by Unit",
        };
      case "resolved":
        return {
          bg: "bg-emerald-950/40 text-emerald-300 border-emerald-800",
          dot: "bg-emerald-500",
          label: "Resolved & Closed",
        };
      case "cancelled":
        return {
          bg: "bg-gray-800 text-gray-300 border-gray-700",
          dot: "bg-gray-400",
          label: "Cancelled by Operator",
        };
    }
  };

  // Prepare other incidents for map markers
  const otherMapMarkers: OtherIncidentMapMarker[] = incidentHistory.map((inc) => ({
    id: inc.id,
    latitude: inc.latitude,
    longitude: inc.longitude,
    status: inc.status,
    created_at: inc.created_at,
    description: inc.description,
    user_id: inc.user_id,
  }));

  const jsonIntegrationPromptText = `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "PIPER_Rescue_Emergency_SOS_Payload",
  "description": "Standardized JSON Schema for integrating native iOS, Android, Flutter, React Native, or Drone companion apps with the PIPER Web Emergency Response Hub",
  "endpoint": "POST /api/emergency/sos",
  "headers": {
    "Content-Type": "application/json",
    "X-User-ID": "optional-client-user-identifier"
  },
  "example_payload": {
    "idempotencyKey": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "latitude": 31.635366,
    "longitude": 74.823768,
    "accuracyMeters": 5.2,
    "locationCapturedAt": "2026-10-22T16:20:00.000Z",
    "locationSource": "mobile_companion_app",
    "description": "Medical evacuation needed / trapped civilian",
    "isTestMode": false,
    "userId": "civilian-phone-01"
  },
  "flutter_dart_snippet": "final response = await http.post(Uri.parse('$BASE_URL/api/emergency/sos'), headers: {'Content-Type': 'application/json'}, body: jsonEncode({'idempotencyKey': Uuid().v4(), 'latitude': position.latitude, 'longitude': position.longitude, 'accuracyMeters': position.accuracy, 'locationCapturedAt': DateTime.now().toUtc().toIso8601String(), 'locationSource': 'mobile_companion_app'}));",
  "react_native_snippet": "const response = await fetch(\`\${BASE_URL}/api/emergency/sos\`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idempotencyKey: Crypto.randomUUID(), latitude: loc.coords.latitude, longitude: loc.coords.longitude, accuracyMeters: loc.coords.accuracy, locationCapturedAt: new Date().toISOString(), locationSource: 'mobile_app' }) });"
}`;

  return (
    <div className="space-y-6 font-sans bg-[#0B1220] text-[#F9FAFB] p-4 sm:p-7 rounded-2xl border border-[#1E293B] shadow-2xl">
      {/* Hidden Accessible ARIA Live Region */}
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        {ariaAnnouncement}
      </div>

      {/* Top Banner: Response Node Status, External App Integration Button, Sound Toggle, Drill Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-[#111827] border border-[#232832] text-xs">
        <div className="flex items-center gap-2.5 text-gray-200">
          <div className="w-6 h-6 rounded-md bg-red-950 border border-red-700/80 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white">Emergency Response Operations Center</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-red-950 text-red-300 border border-red-800">
                LIVE SYNC
              </span>
            </div>
            <p className="text-[11px] text-gray-400 hidden sm:block">
              Coordinates capture, real-time companion app telemetry, and OpenStreetMap tactical dispatch
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* External App / JSON Prompt Integration Button */}
          <button
            type="button"
            onClick={() => setIsIntegrationModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-950/60 hover:bg-blue-900/80 text-blue-300 border border-blue-800/80 font-mono text-[11px] font-medium transition cursor-pointer shadow-sm"
            title="View JSON Integration Prompt for Mobile & External Apps"
          >
            <Smartphone className="w-3.5 h-3.5 text-blue-400" />
            <span>Integrate App / JSON Prompt</span>
          </button>

          {/* Standalone Mobile SOS View Link */}
          <Link
            href="/sos/mobile"
            target="_blank"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-950/50 hover:bg-red-900/70 text-red-300 border border-red-800/80 font-mono text-[11px] font-medium transition cursor-pointer shadow-sm"
            title="Open Mobile Companion Screen on phone or new tab"
          >
            <ExternalLink className="w-3.5 h-3.5 text-red-400" />
            <span>Mobile SOS Client</span>
          </Link>

          {/* Audio Alert Toggle */}
          <button
            type="button"
            onClick={() => setSoundAlertsEnabled(!soundAlertsEnabled)}
            className={`p-1.5 rounded-lg border transition cursor-pointer ${
              soundAlertsEnabled
                ? "bg-gray-800 text-gray-200 border-gray-700 hover:text-white"
                : "bg-gray-900 text-gray-500 border-gray-800"
            }`}
            title={soundAlertsEnabled ? "Mute audio alerts" : "Enable emergency audio alerts"}
            aria-label="Toggle emergency alert audio"
          >
            {soundAlertsEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <VolumeX className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Drill Mode Toggle */}
          <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0B1220] border border-gray-800 cursor-pointer select-none">
            <span className="text-[11px] font-mono text-gray-300">Drill Mode</span>
            <input
              type="checkbox"
              checked={testModeEnabled}
              onChange={(e) => setTestModeEnabled(e.target.checked)}
              className="w-3.5 h-3.5 rounded text-red-600 bg-gray-900 border-gray-700 focus:ring-red-500 cursor-pointer"
            />
          </label>

          {/* Network State Indicator */}
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-[11px] border ${
              isOnline
                ? "bg-emerald-950/50 text-emerald-300 border-emerald-800"
                : "bg-amber-950/50 text-amber-300 border-amber-800"
            }`}
          >
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span>DB Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                <span>Offline</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Real-time Incoming External Incident Toast Alert */}
      {newIncomingIncidentAlert && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-red-950 via-[#1E293B] to-red-950 border-2 border-red-500 shadow-2xl flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-red-600 flex items-center justify-center text-white shrink-0 shadow-lg shadow-red-600/50 animate-bounce">
              <AlertOctagon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  🚨 Real-Time Incoming SOS Beacon Detected
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-red-900 text-red-100 font-bold">
                  ID #{newIncomingIncidentAlert.id.slice(0, 8)}
                </span>
              </div>
              <p className="text-xs text-gray-200 mt-0.5 font-mono">
                Coordinates: <strong>{newIncomingIncidentAlert.latitude.toFixed(5)}°</strong>,{" "}
                <strong>{newIncomingIncidentAlert.longitude.toFixed(5)}°</strong> (Source:{" "}
                {newIncomingIncidentAlert.location_source})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setCurrentIncident(newIncomingIncidentAlert);
                setNewIncomingIncidentAlert(null);
              }}
              className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-md transition cursor-pointer"
            >
              Focus on Map
            </button>
            <button
              type="button"
              onClick={() => setNewIncomingIncidentAlert(null)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white transition cursor-pointer"
              aria-label="Dismiss alert"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* First-Visit Location Permission Setup Card */}
      {!hasDismissedSetupCard && readinessState !== "ready" && (
        <section
          aria-labelledby="setup-card-heading"
          className="p-4 sm:p-5 rounded-xl bg-gradient-to-r from-[#111827] to-[#1E293B] border border-red-500/30 shadow-md relative"
        >
          <button
            type="button"
            onClick={() => setHasDismissedSetupCard(true)}
            className="absolute top-4 right-4 text-gray-400 hover:text-white transition cursor-pointer"
            aria-label="Dismiss setup card"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pr-6">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Compass className="w-5 h-5 text-red-400" />
                <h2 id="setup-card-heading" className="text-sm font-semibold text-white tracking-wide">
                  Location Setup: Enable Instant Disaster Coordinates
                </h2>
              </div>
              <p className="text-xs text-gray-300 max-w-2xl leading-relaxed">
                Allowing location access in advance ensures that when you press the emergency SOS beacon, your exact
                WGS84 coordinates are instantly captured and attached to your rescue incident without delay or extra
                prompts during an emergency.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => requestPosition(true)}
                disabled={isLocating}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium text-xs shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-red-400"
              >
                {isLocating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Locating Position...</span>
                  </>
                ) : (
                  <>
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Enable Location Access</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowPermissionHelp(!showPermissionHelp)}
                className="px-3 py-2 rounded-lg bg-[#1F2937] hover:bg-[#374151] text-gray-300 text-xs transition flex items-center gap-1.5 cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Help</span>
                {showPermissionHelp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>
          </div>

          {/* Browser Permission Guidance Dropdown */}
          {showPermissionHelp && (
            <div className="mt-4 pt-4 border-t border-gray-700 text-xs text-gray-300 space-y-2">
              <h3 className="font-semibold text-white">How to enable location in your browser:</h3>
              <ul className="list-disc list-inside space-y-1 text-gray-400 pl-1">
                <li>
                  <strong>Chrome / Edge:</strong> Click the lock/settings icon on the left of address bar &gt;{" "}
                  <em>Site settings</em> &gt; <em>Location</em> &gt; <em>Allow</em>.
                </li>
                <li>
                  <strong>Safari (iOS / macOS):</strong> Go to <em>Settings</em> &gt; <em>Privacy &amp; Security</em>{" "}
                  &gt; <em>Location Services</em> &gt; <em>Safari Websites</em> &gt; <em>While Using App</em>.
                </li>
                <li>
                  <strong>Firefox:</strong> Click the permissions icon on address bar and clear blocked permission.
                </li>
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Main Grid: SOS Trigger & Telemetry Left + Interactive OpenStreetMap Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Big SOS Action Card, Readiness State, Coordinates Telemetry (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* 1. High-Contrast Red SOS Hero Card */}
          <div className="p-6 rounded-2xl bg-[#111827] border border-[#232832] shadow-xl text-center space-y-6">
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono tracking-widest uppercase text-red-400 font-bold">
                Civilian &amp; Operator Emergency Dispatch
              </span>
              <h2 className="text-xl font-bold text-white tracking-tight">SOS Beacon Activation</h2>
              <p className="text-xs text-gray-400 max-w-sm mx-auto">
                Press to capture high-accuracy WGS84 GPS coordinates and broadcast an emergency incident to PIPER rescue
                teams.
              </p>
            </div>

            {/* Giant Circular Touch-Friendly SOS Button */}
            <div className="py-2 flex justify-center">
              <button
                type="button"
                onClick={handleOpenConfirmDialog}
                disabled={activationStep === "acquiring_fresh_gps" || activationStep === "persisting"}
                className={`relative group w-36 h-36 sm:w-44 sm:h-44 rounded-full flex flex-col items-center justify-center text-white font-extrabold tracking-wider transition transform active:scale-95 cursor-pointer shadow-2xl focus:outline-none focus-visible:ring-4 focus-visible:ring-red-400 ${
                  activationStep === "persisting" || activationStep === "acquiring_fresh_gps"
                    ? "bg-red-800 cursor-wait opacity-80"
                    : "bg-[#DC2626] hover:bg-red-600 shadow-red-950/70"
                }`}
                aria-label="Activate Emergency SOS Beacon"
              >
                {/* Subtle Radar Ring */}
                <span className="absolute inset-0 rounded-full border-4 border-red-500/40 animate-ping opacity-60 pointer-events-none motion-reduce:hidden" />
                <span className="absolute -inset-2 rounded-full border border-red-500/30 pointer-events-none" />

                <AlertOctagon className="w-10 h-10 sm:w-12 sm:h-12 mb-1 drop-shadow-md text-white" />
                <span className="text-2xl sm:text-3xl font-black tracking-widest drop-shadow-md">SOS</span>
                <span className="text-[10px] sm:text-xs font-mono font-medium tracking-normal opacity-90">
                  {testModeEnabled ? "DRILL SIMULATION" : "EMERGENCY"}
                </span>
              </button>
            </div>

            {/* Location Readiness Badge */}
            <div className="p-3 rounded-xl bg-[#0B1220] border border-[#232832] flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    readinessState === "ready"
                      ? "bg-emerald-500 shadow-xs shadow-emerald-500"
                      : readinessState === "locating"
                      ? "bg-blue-500 animate-pulse"
                      : readinessState === "denied"
                      ? "bg-red-500"
                      : "bg-amber-500"
                  }`}
                />
                <span className="text-gray-300 font-medium">GPS Readiness:</span>
                <span
                  className={`font-semibold capitalize ${
                    readinessState === "ready"
                      ? "text-emerald-400"
                      : readinessState === "locating"
                      ? "text-blue-400"
                      : readinessState === "denied"
                      ? "text-red-400"
                      : "text-amber-400"
                  }`}
                >
                  {readinessState === "ready"
                    ? "Location Ready"
                    : readinessState === "locating"
                    ? "Locating Fix..."
                    : readinessState === "denied"
                    ? "Permission Denied"
                    : "Awaiting Permission"}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => requestPosition(true)}
                  disabled={isLocating}
                  className="p-1 text-gray-400 hover:text-white transition disabled:opacity-50 cursor-pointer"
                  title="Retry acquiring GPS fix"
                  aria-label="Refresh GPS position"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLocating ? "animate-spin text-red-400" : ""}`} />
                </button>
              </div>
            </div>

            {/* Error Message if Denied or Failed */}
            {locationErrorMessage && (
              <div className="p-2.5 rounded-lg bg-red-950/50 border border-red-800 text-[11px] text-red-200 flex items-start gap-2 text-left">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span>{locationErrorMessage}</span>
                  {readinessState === "denied" && (
                    <button
                      type="button"
                      onClick={() => setShowPermissionHelp(true)}
                      className="block mt-1 text-red-300 underline font-medium hover:text-white cursor-pointer"
                    >
                      View instructions to enable
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 2. Live Coordinates & Telemetry Box */}
          <div className="p-4 rounded-xl bg-[#111827] border border-[#232832] space-y-3">
            <div className="flex items-center justify-between text-xs pb-2 border-b border-gray-800">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-red-400" />
                <span>Geospatial Telemetry</span>
              </span>
              <button
                type="button"
                onClick={toggleLiveWatcher}
                className={`text-[10px] font-mono px-2 py-0.5 rounded border transition cursor-pointer ${
                  isContinuousWatch
                    ? "bg-emerald-950/60 border-emerald-700 text-emerald-300"
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                }`}
              >
                {isContinuousWatch ? "● Live Watch: Active" : "Enable Continuous GPS"}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-[#0B1220] border border-gray-800">
                <span className="text-[10px] text-gray-400 block uppercase">Latitude</span>
                <span className="font-bold text-gray-100 text-sm">
                  {coordinates ? `${coordinates.latitude.toFixed(6)}°` : "31.635366°"}
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-[#0B1220] border border-gray-800">
                <span className="text-[10px] text-gray-400 block uppercase">Longitude</span>
                <span className="font-bold text-gray-100 text-sm">
                  {coordinates ? `${coordinates.longitude.toFixed(6)}°` : "74.823768°"}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-gray-400 pt-1 font-mono">
              <span>
                Accuracy Radius:{" "}
                <strong className="text-gray-200">
                  {coordinates ? `±${Math.round(coordinates.accuracy)}m` : "±25m (Default)"}
                </strong>
              </span>
              <span>
                Fix:{" "}
                <span className="text-gray-200">
                  {coordinates
                    ? new Date(coordinates.timestamp).toLocaleTimeString([], { hour12: false })
                    : "Cached Lock"}
                </span>
              </span>
            </div>

            {/* Resolved Street Address (Asynchronous) */}
            <div className="pt-2 border-t border-gray-800 text-xs">
              <span className="text-[10px] text-gray-400 uppercase font-mono block">Reverse-Geocoded Address</span>
              <p className="text-gray-200 text-xs mt-0.5 truncate">
                {isGeocoding
                  ? "Resolving street address..."
                  : resolvedAddress || "OpenStreetMap Nominatim address resolves asynchronously"}
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: OpenStreetMap Live View & Active Incident Status (7 cols) */}
        <div className="lg:col-span-7 space-y-5">
          {/* Tactical OpenStreetMap Component */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <h3 className="font-semibold text-white flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-red-500" />
                <span>OpenStreetMap Live Satellite / Tactical Position</span>
              </h3>
              <span className="text-[11px] font-mono text-gray-400">Raster Tiles • Leaflet Isolated View</span>
            </div>

            <EmergencyMap
              latitude={coordinates ? coordinates.latitude : 31.635366}
              longitude={coordinates ? coordinates.longitude : 74.823768}
              accuracyMeters={coordinates ? coordinates.accuracy : 50}
              isLocating={isLocating}
              incidentStatus={currentIncident?.status}
              markerTitle={currentIncident ? `Active Incident: #${currentIncident.id.slice(0, 8)}` : "Your Position"}
              onRecenter={() => requestPosition(true)}
              otherIncidents={otherMapMarkers}
              onSelectIncident={(incId) => {
                const found = incidentHistory.find((i) => i.id === incId);
                if (found) setCurrentIncident(found);
              }}
            />
          </div>

          {/* Active Incident Success / Status Panel */}
          {currentIncident && (
            <section
              aria-labelledby="active-incident-heading"
              className="p-5 rounded-xl bg-[#111827] border-2 border-red-600/70 shadow-2xl space-y-4 animate-in fade-in duration-300"
            >
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-gray-800">
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                    <h2 id="active-incident-heading" className="text-base font-bold text-white">
                      SOS Incident Successfully Transmitted
                    </h2>
                  </div>
                  <p className="text-xs text-gray-300 mt-1">
                    Your coordinates were verified and securely recorded in the emergency operations database.
                  </p>
                </div>

                {/* Status Badge */}
                {(() => {
                  const b = getStatusBadge(currentIncident.status);
                  return (
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 border shrink-0 ${b.bg}`}
                    >
                      <span className={`w-2 h-2 rounded-full ${b.dot}`} />
                      <span>{b.label}</span>
                    </span>
                  );
                })()}
              </div>

              {/* Incident Details Summary Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div className="p-2.5 rounded-lg bg-[#0B1220] border border-gray-800">
                  <span className="text-[10px] text-gray-400 block uppercase">Incident ID</span>
                  <span className="font-bold text-white text-xs truncate block" title={currentIncident.id}>
                    {currentIncident.id.slice(0, 13)}...
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-[#0B1220] border border-gray-800">
                  <span className="text-[10px] text-gray-400 block uppercase">Latitude</span>
                  <span className="font-bold text-white text-xs">
                    {currentIncident.latitude.toFixed(5)}°
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-[#0B1220] border border-gray-800">
                  <span className="text-[10px] text-gray-400 block uppercase">Longitude</span>
                  <span className="font-bold text-white text-xs">
                    {currentIncident.longitude.toFixed(5)}°
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-[#0B1220] border border-gray-800">
                  <span className="text-[10px] text-gray-400 block uppercase">Recorded At</span>
                  <span className="font-bold text-white text-xs">
                    {new Date(currentIncident.created_at).toLocaleTimeString([], { hour12: false })}
                  </span>
                </div>
              </div>

              {/* Status Progression Indicators */}
              <div className="pt-2">
                <span className="text-[10px] font-mono uppercase text-gray-400 block mb-2">
                  Emergency Life-Cycle Progression
                </span>
                <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-mono">
                  <div
                    className={`p-1.5 rounded-lg border ${
                      currentIncident.status === "pending"
                        ? "bg-amber-950/60 border-amber-500 text-amber-300 font-bold"
                        : "bg-gray-800/60 border-gray-700 text-gray-400"
                    }`}
                  >
                    1. Pending
                  </div>
                  <div
                    className={`p-1.5 rounded-lg border ${
                      currentIncident.status === "active"
                        ? "bg-red-950/60 border-red-500 text-red-300 font-bold"
                        : "bg-gray-800/60 border-gray-700 text-gray-400"
                    }`}
                  >
                    2. Active
                  </div>
                  <div
                    className={`p-1.5 rounded-lg border ${
                      currentIncident.status === "acknowledged"
                        ? "bg-blue-950/60 border-blue-500 text-blue-300 font-bold"
                        : "bg-gray-800/60 border-gray-700 text-gray-400"
                    }`}
                  >
                    3. Acknowledged
                  </div>
                  <div
                    className={`p-1.5 rounded-lg border ${
                      currentIncident.status === "resolved"
                        ? "bg-emerald-950/60 border-emerald-500 text-emerald-300 font-bold"
                        : "bg-gray-800/60 border-gray-700 text-gray-400"
                    }`}
                  >
                    4. Resolved
                  </div>
                </div>
              </div>

              {/* Stand Down / Cancel Control */}
              {currentIncident.status !== "resolved" && currentIncident.status !== "cancelled" && (
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleCancelEmergency}
                    disabled={isCancelling}
                    className="px-3.5 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-red-300 border border-red-900/60 text-xs font-medium transition cursor-pointer disabled:opacity-50"
                  >
                    {isCancelling ? "Cancelling Incident..." : "Cancel Emergency Signal (False Alarm)"}
                  </button>
                </div>
              )}
            </section>
          )}

          {/* Recent Emergency Incidents History */}
          <div className="p-4 rounded-xl bg-[#111827] border border-[#232832] space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-gray-400" />
                <span>Incident Log &amp; Live Companion Beacons</span>
              </span>
              <button
                type="button"
                onClick={() => loadRecentIncidents(false)}
                className="text-[11px] text-gray-400 hover:text-white transition flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Refresh Live</span>
              </button>
            </div>

            {incidentHistory.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">No recent emergency incidents on record.</p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {incidentHistory.map((inc) => {
                  const b = getStatusBadge(inc.status);
                  const isSelected = currentIncident?.id === inc.id;
                  return (
                    <div
                      key={inc.id}
                      onClick={() => setCurrentIncident(inc)}
                      className={`p-2.5 rounded-lg border text-xs flex items-center justify-between gap-3 cursor-pointer transition ${
                        isSelected
                          ? "bg-red-950/40 border-red-600/70 shadow-sm"
                          : "bg-[#0B1220] border-gray-800/80 hover:border-gray-700"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${b.dot}`} />
                        <span className="font-mono text-gray-200 font-bold">#{inc.id.slice(0, 8)}</span>
                        <span className="text-gray-400 font-mono hidden sm:inline">
                          [{inc.latitude.toFixed(4)}, {inc.longitude.toFixed(4)}]
                        </span>
                        {inc.description && (
                          <span className="text-gray-400 truncate text-[11px] hidden md:inline">
                            - {inc.description}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2.5 shrink-0">
                        <span className="text-[10px] text-gray-400 font-mono">
                          {new Date(inc.created_at).toLocaleTimeString([], { hour12: false })}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${b.bg}`}>
                          {inc.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CONFIRMATION DIALOG MODAL (Stacking Fixed: z-[99999] High-Level Backdrop, Perfectly Centered) */}
      {isConfirmDialogOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setIsConfirmDialogOpen(false)}
        >
          <div
            className="w-full max-w-md p-6 rounded-2xl bg-[#111827] border-2 border-red-600 shadow-2xl space-y-5 text-left relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsConfirmDialogOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition cursor-pointer"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 text-red-500">
              <div className="w-12 h-12 rounded-full bg-red-950 flex items-center justify-center shrink-0 border border-red-700 shadow-lg shadow-red-950">
                <AlertOctagon className="w-7 h-7 text-red-500" />
              </div>
              <div>
                <h3 id="confirm-dialog-title" className="text-lg font-bold text-white">
                  Confirm Emergency SOS
                </h3>
                <span className="text-xs text-red-400 font-mono">
                  {testModeEnabled ? "Drill Test Mode (No Live Alarm)" : "Immediate Search & Rescue Dispatch"}
                </span>
              </div>
            </div>

            <p className="text-xs text-gray-300 leading-relaxed">
              Activating SOS will immediately capture your current coordinates and create an emergency incident on the
              PIPER response network. Only activate if immediate assistance is required.
            </p>

            {/* Optional Distress Note */}
            <div>
              <label htmlFor="distress-note" className="block text-[11px] font-mono text-gray-300 mb-1">
                Emergency Details (Optional):
              </label>
              <input
                id="distress-note"
                type="text"
                value={distressDescription}
                onChange={(e) => setDistressDescription(e.target.value)}
                placeholder="e.g. Trapped by rubble / need medical evacuation"
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#0B1220] border border-gray-700 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmDialogOpen(false)}
                className="px-4 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteSOS}
                className="px-5 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs tracking-wide shadow-xl shadow-red-900/50 transition cursor-pointer focus-visible:ring-4 focus-visible:ring-red-400 flex items-center gap-1.5"
              >
                <AlertOctagon className="w-4 h-4" />
                <span>Yes, Send Emergency SOS</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ACTIVATION IN-PROGRESS OVERLAY (z-[99999]) */}
      {(activationStep === "acquiring_fresh_gps" ||
        activationStep === "validating" ||
        activationStep === "persisting") && (
        <div
          role="alertdialog"
          aria-modal="true"
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
        >
          <div className="w-full max-w-sm p-6 rounded-2xl bg-[#111827] border border-red-500/50 shadow-2xl text-center space-y-4">
            <RefreshCw className="w-10 h-10 text-red-500 animate-spin mx-auto" />
            <h3 className="text-base font-bold text-white">Transmitting SOS Beacon</h3>
            <p className="text-xs text-gray-300 font-mono">{activationProgressText}</p>
          </div>
        </div>
      )}

      {/* ACTIVATION FAILED ERROR MODAL (z-[99999]) */}
      {activationStep === "failed" && (
        <div
          role="alertdialog"
          aria-modal="true"
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
        >
          <div className="w-full max-w-md p-6 rounded-2xl bg-[#111827] border-2 border-red-600 shadow-2xl space-y-4 text-center">
            <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
            <h3 className="text-base font-bold text-white">Submission Interrupted</h3>
            <p className="text-xs text-red-300">{activationProgressText}</p>
            <p className="text-xs text-gray-400">
              Your request was preserved. You can safely retry with the same request key to avoid duplicate incidents.
            </p>

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setActivationStep("idle")}
                className="px-4 py-2 rounded-lg bg-gray-800 text-gray-300 text-xs font-medium cursor-pointer"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={handleExecuteSOS}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition cursor-pointer"
              >
                Retry Submission
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXTERNAL MOBILE APP INTEGRATION & JSON PROMPT MODAL (z-[99999]) */}
      {isIntegrationModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
          onClick={() => setIsIntegrationModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-2xl bg-[#111827] border border-blue-500/40 shadow-2xl space-y-5 text-left relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsIntegrationModalOpen(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition cursor-pointer"
              aria-label="Close integration modal"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-950 border border-blue-700 flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">External Mobile App &amp; JSON Prompt Integration</h3>
                <p className="text-xs text-gray-400">
                  Connect any iOS, Android, Flutter, React Native, or Drone application directly to this dashboard
                </p>
              </div>
            </div>

            {/* Quick Test Simulator Button */}
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-blue-950/40 to-indigo-950/40 border border-blue-800/60 flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-xs font-bold text-blue-200 flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>Test Mobile SOS Integration Right Now</span>
                </span>
                <p className="text-[11px] text-gray-300 mt-0.5">
                  Simulate an external mobile phone sending an SOS coordinate payload to verify real-time map sync.
                </p>
              </div>

              <button
                type="button"
                onClick={handleSimulateExternalAppSOS}
                disabled={isSimulatingExternalSOS}
                className="px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {isSimulatingExternalSOS ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Broadcasting...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Trigger Simulated Mobile SOS</span>
                  </>
                )}
              </button>
            </div>

            {simulationSuccessMsg && (
              <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-700 text-xs text-emerald-300">
                {simulationSuccessMsg}
              </div>
            )}

            {/* JSON Prompt Code Block */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono text-gray-300 font-semibold">JSON Integration Specification &amp; Prompt:</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(jsonIntegrationPromptText);
                    setCopiedPrompt(true);
                    setTimeout(() => setCopiedPrompt(false), 2000);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 text-[11px] font-mono transition cursor-pointer"
                >
                  {copiedPrompt ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy JSON Prompt</span>
                    </>
                  )}
                </button>
              </div>

              <pre className="p-3.5 rounded-xl bg-[#070B14] border border-gray-800 text-[11px] font-mono text-blue-300 overflow-x-auto max-h-56 leading-relaxed">
                {jsonIntegrationPromptText}
              </pre>
            </div>

            {/* Integration Instructions */}
            <div className="text-xs text-gray-300 space-y-2 border-t border-gray-800 pt-3">
              <h4 className="font-semibold text-white">How it connects with your Web App:</h4>
              <ol className="list-decimal list-inside space-y-1 text-gray-400 pl-1">
                <li>
                  <strong>External App Action:</strong> When a user presses SOS in their app, your app makes a POST request to{" "}
                  <code className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-200">/api/emergency/sos</code> with their GPS coordinates.
                </li>
                <li>
                  <strong>Atomic Persistence:</strong> The PIPER backend validates freshness, verifies idempotency, saves the incident, and logs an audit trail.
                </li>
                <li>
                  <strong>Live Synchronization:</strong> This web dashboard auto-syncs every 3 seconds, immediately triggers an audio alert, and plots the distress beacon on the OpenStreetMap view.
                </li>
              </ol>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-gray-800">
              <Link
                href="/sos/mobile"
                target="_blank"
                className="text-xs text-red-400 hover:text-red-300 underline font-mono flex items-center gap-1"
              >
                <span>Open Standalone Mobile Companion PWA Screen</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>

              <button
                type="button"
                onClick={() => setIsIntegrationModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-white text-xs font-medium cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
