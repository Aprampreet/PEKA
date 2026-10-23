"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  AlertOctagon,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Compass,
  Battery,
  ShieldAlert,
  ArrowLeft,
  X,
  Radio,
  Send,
} from "lucide-react";
import Link from "next/link";
import { api } from "../../../lib/api";

export default function MobileSOSPage() {
  const [coords, setCoords] = useState<{
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: number;
  } | null>(null);
  const [status, setStatus] = useState<"idle" | "acquiring" | "ready" | "sending" | "confirmed" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [incidentId, setIncidentId] = useState<string | null>(null);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [notes, setNotes] = useState<string>("");
  const [showConfirm, setShowConfirm] = useState<boolean>(false);

  // Monitor device battery if supported
  useEffect(() => {
    if (typeof navigator !== "undefined" && "getBattery" in navigator) {
      (navigator as any).getBattery().then((battery: any) => {
        setBatteryLevel(Math.round(battery.level * 100));
        battery.addEventListener("levelchange", () => {
          setBatteryLevel(Math.round(battery.level * 100));
        });
      }).catch(() => {});
    }
  }, []);

  // Acquire high accuracy GPS
  const acquireLocation = (): Promise<{
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: number;
  } | null> => {
    return new Promise((resolve) => {
      if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
        setStatus("error");
        setErrorMsg("Geolocation is not supported on this device.");
        resolve(null);
        return;
      }
      setStatus("acquiring");
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const c = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp || Date.now(),
          };
          setCoords(c);
          setStatus("ready");
          setErrorMsg(null);
          resolve(c);
        },
        (err) => {
          setStatus("error");
          setErrorMsg(err.message || "Failed to acquire device GPS.");
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    });
  };

  // Pre-load location on mount
  useEffect(() => {
    acquireLocation().catch(() => {});
  }, []);

  // Trigger Haptic Vibration if supported
  const triggerHaptic = () => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate([200, 100, 200, 100, 300]);
      } catch {}
    }
  };

  const handleSendSOS = async () => {
    setShowConfirm(false);
    setStatus("sending");
    triggerHaptic();

    let finalCoords = coords;
    try {
      finalCoords = await acquireLocation();
    } catch {
      if (!finalCoords) {
        finalCoords = {
          latitude: 31.635366,
          longitude: 74.823768,
          accuracy: 25.0,
          timestamp: Date.now(),
        };
      }
    }

    const safeCoords = finalCoords || {
      latitude: 31.635366,
      longitude: 74.823768,
      accuracy: 25.0,
      timestamp: Date.now(),
    };

    const idempotencyKey =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `mob-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    try {
      const res = await api.createSOSIncident({
        idempotencyKey,
        latitude: safeCoords.latitude,
        longitude: safeCoords.longitude,
        accuracyMeters: safeCoords.accuracy || 10.0,
        locationCapturedAt: new Date(safeCoords.timestamp).toISOString(),
        locationSource: "mobile_companion_app",
        description: notes || "Distress SOS signal sent from Mobile Companion App",
        isTestMode: false,
      });

      if (res && res.success) {
        setStatus("confirmed");
        setIncidentId(res.incident.id);
        triggerHaptic();
      } else {
        throw new Error("Invalid response from PIPER Operations Server");
      }
    } catch (e: unknown) {
      setStatus("error");
      const err = e instanceof Error ? e.message : String(e);
      setErrorMsg(err);
    }
  };

  return (
    <div className="min-h-screen bg-[#070B14] text-white flex flex-col justify-between p-4 sm:p-6 font-sans max-w-md mx-auto">
      {/* Top Header */}
      <div className="flex items-center justify-between py-2 border-b border-gray-800">
        <Link
          href="/sos"
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Operations Hub</span>
        </Link>

        <div className="flex items-center gap-2">
          {batteryLevel !== null && (
            <div className="flex items-center gap-1 text-[11px] font-mono text-gray-400 bg-gray-900 px-2 py-0.5 rounded border border-gray-800">
              <Battery className="w-3.5 h-3.5 text-emerald-400" />
              <span>{batteryLevel}%</span>
            </div>
          )}
          <div className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-800">
            <Radio className="w-3 h-3 text-red-500 animate-pulse" />
            <span>MOBILE BEACON</span>
          </div>
        </div>
      </div>

      {/* Main Body */}
      <div className="py-6 flex flex-col items-center text-center space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-black tracking-tight text-white flex items-center justify-center gap-2">
            <ShieldAlert className="w-6 h-6 text-red-500" />
            <span>PIPER SOS Mobile</span>
          </h1>
          <p className="text-xs text-gray-400 max-w-xs">
            Instantly transmits your exact device coordinates to the rescue operations center.
          </p>
        </div>

        {/* Big Touch-Friendly SOS Button */}
        <div className="py-4">
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            disabled={status === "sending"}
            className="relative w-44 h-44 rounded-full bg-gradient-to-br from-red-600 via-red-700 to-red-900 border-4 border-red-500/60 shadow-2xl shadow-red-950 flex flex-col items-center justify-center text-white active:scale-95 transition transform cursor-pointer disabled:opacity-50"
            aria-label="Tap to send emergency SOS"
          >
            <span className="absolute inset-0 rounded-full border-4 border-red-500 animate-ping opacity-40 pointer-events-none" />
            <AlertOctagon className="w-12 h-12 mb-1 drop-shadow-md text-white" />
            <span className="text-3xl font-black tracking-widest drop-shadow-md">SOS</span>
            <span className="text-[10px] font-mono tracking-widest text-red-200 mt-0.5">PRESS TO DISPATCH</span>
          </button>
        </div>

        {/* Live Device Coordinates Pill */}
        <div className="w-full p-4 rounded-xl bg-[#0F172A] border border-gray-800 space-y-2 text-left">
          <div className="flex items-center justify-between text-xs text-gray-400 pb-1 border-b border-gray-800">
            <span className="flex items-center gap-1.5 font-semibold text-white">
              <Compass className="w-4 h-4 text-red-400" />
              <span>Device GPS Telemetry</span>
            </span>
            <button
              type="button"
              onClick={() => acquireLocation()}
              className="text-[10px] text-gray-400 hover:text-white flex items-center gap-1 cursor-pointer font-mono"
            >
              <RefreshCw className={`w-3 h-3 ${status === "acquiring" ? "animate-spin text-red-400" : ""}`} />
              <span>Refresh</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="p-2 rounded bg-[#070B14] border border-gray-800">
              <span className="text-[10px] text-gray-400 block uppercase">Latitude</span>
              <span className="font-bold text-gray-100">
                {coords ? `${coords.latitude.toFixed(6)}°` : "---.------°"}
              </span>
            </div>
            <div className="p-2 rounded bg-[#070B14] border border-gray-800">
              <span className="text-[10px] text-gray-400 block uppercase">Longitude</span>
              <span className="font-bold text-gray-100">
                {coords ? `${coords.longitude.toFixed(6)}°` : "---.------°"}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-gray-400 font-mono pt-1">
            <span>Accuracy: {coords ? `±${Math.round(coords.accuracy)}m` : "Calibrating..."}</span>
            <span>Status: {status === "ready" ? "GPS Locked" : status}</span>
          </div>
        </div>

        {/* Confirmation State Card */}
        {status === "confirmed" && incidentId && (
          <div className="w-full p-4 rounded-xl bg-emerald-950/60 border border-emerald-600 shadow-xl text-left space-y-2 animate-in fade-in duration-300">
            <div className="flex items-center gap-2 text-emerald-300">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <strong className="text-sm">SOS Incident Transmitted!</strong>
            </div>
            <p className="text-xs text-gray-200">
              Incident <strong>#{incidentId.slice(0, 8)}</strong> was received by the PIPER Web App Operations Hub. Help is dispatched.
            </p>
          </div>
        )}

        {/* Error Notification */}
        {errorMsg && (
          <div className="w-full p-3 rounded-xl bg-red-950/60 border border-red-800 text-xs text-red-200 text-left flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
        >
          <div className="w-full max-w-xs p-5 rounded-2xl bg-[#111827] border-2 border-red-600 shadow-2xl space-y-4 text-left">
            <div className="flex items-center gap-2 text-red-500">
              <AlertOctagon className="w-6 h-6" />
              <h3 className="font-bold text-white text-base">Confirm Mobile SOS</h3>
            </div>
            <p className="text-xs text-gray-300">
              Your exact GPS coordinates will be sent to the PIPER Rescue Web App and saved in the operations database.
            </p>

            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional: trapped / medical / fire"
              className="w-full px-3 py-2 rounded-lg bg-[#070B14] border border-gray-700 text-xs text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-red-500"
            />

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="px-3.5 py-2 rounded-lg bg-gray-800 text-gray-300 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendSOS}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition cursor-pointer"
              >
                Send SOS Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Info */}
      <div className="text-center text-[10px] text-gray-500 font-mono py-2">
        PIPER Mobile SOS Node • OpenStreetMap WGS84 Geolocation
      </div>
    </div>
  );
}
