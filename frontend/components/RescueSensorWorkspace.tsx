"use client";

import React, { useState } from "react";
import { LiveCameraCard } from "./LiveCameraCard";
import { ThermalViewer } from "./ThermalViewer";
import { LidarViewer } from "./LidarViewer";
import { RoverSpeakerPanel } from "./RoverSpeakerPanel";
import { ObservationRecord } from "../lib/types";
import {
  Video,
  Flame,
  Box,
  Crosshair,
  CheckCircle2,
  HelpCircle,
  XCircle,
  Clock,
} from "lucide-react";

interface RescueSensorWorkspaceProps {
  isUpstreamLive: boolean;
  latestObservation?: ObservationRecord | null;
}

export const RescueSensorWorkspace: React.FC<RescueSensorWorkspaceProps> = ({
  isUpstreamLive,
  latestObservation,
}) => {
  // Evidence Association candidate state
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("cand-01");
  const [reviewStatus, setReviewStatus] = useState<Record<string, string>>({
    "cand-01": "Requires Review",
    "cand-02": "Unreviewed",
    "cand-03": "Verified Safe",
  });

  const candidates = [
    {
      id: "cand-01",
      code: "CAND-01",
      title: "Possible point of interest (Sector 3 Void)",
      classification: "Potential Human Presence",
      tagColor: "bg-[#285B49]/10 text-[#285B49] border-[#285B49]/30",
      rgbCrop: "/evidence/obs_person.jpg",
      thermalImage: "/evidence/obs_person.jpg",
      thermalLabel: "Thermal Anomaly A (Localized Heat Residual)",
      lidarCoords: { x: 0.4, y: 1.5, z: 0.6 },
      syncDelta: "14 ms",
      freshness: "Synced (0.8s ago)",
      calibration: "Extrinsics verified (OAK-D ↔ base_link)",
      supportingEvidence:
        "Optical pattern match detected human silhouette; localized thermal radiance matches human core temperature range above cold rubble.",
      missingEvidence:
        "Heavy airborne dust particulate in void reduces point cloud density around feet; limb confirmation partial.",
    },
    {
      id: "cand-02",
      code: "CAND-02",
      title: "Structural displacement (Sector 1 Rupture)",
      classification: "Structural Risk / Rupture",
      tagColor: "bg-[#B77927]/10 text-[#B77927] border-[#B77927]/30",
      rgbCrop: "/evidence/obs_structure.jpg",
      thermalImage: "/evidence/obs_structure.jpg",
      thermalLabel: "Thermal Anomaly B (Friction / Gas Line)",
      lidarCoords: { x: -0.8, y: 2.4, z: 1.2 },
      syncDelta: "19 ms",
      freshness: "Synced (2.4s ago)",
      calibration: "Extrinsics verified",
      supportingEvidence:
        "Structural slab deflection of 14° detected in 3D LiDAR geometry; thermal signature indicates friction heat or hot pipe breach.",
      missingEvidence:
        "No optical human face detected; potential false positive for survivor presence.",
    },
    {
      id: "cand-03",
      code: "CAND-03",
      title: "Navigable void candidate (Sector 2 Corridor)",
      classification: "Passageway Clearance",
      tagColor: "bg-[#6C7068]/10 text-[#242820] border-[#D8D9D1]",
      rgbCrop: "/evidence/obs_poi.jpg",
      thermalImage: null,
      thermalLabel: "Ambient baseline (No heat anomaly)",
      lidarCoords: { x: 0.6, y: 0.9, z: 0.4 },
      syncDelta: "11 ms",
      freshness: "Synced (4.1s ago)",
      calibration: "Extrinsics verified",
      supportingEvidence:
        "Passageway cleared of major ceiling collapse; navigable void verified via 3D LiDAR point cloud boundaries.",
      missingEvidence:
        "Ambient lighting insufficient in far end of corridor; optical range limited to 2.5m.",
    },
  ];

  const activeCandidate =
    candidates.find((c) => c.id === selectedCandidateId) || candidates[0];

  const handleUpdateCandidateReview = (status: string) => {
    setReviewStatus((prev) => ({
      ...prev,
      [activeCandidate.id]: status,
    }));
  };

  return (
    <div className="space-y-4">
      {/* 1. Compact Sensor-Status Strip (Single Row with Subtle Separators) */}
      <div className="rounded-md border border-[#D8D9D1] bg-[#FFFFFF] px-4 py-2 flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs">
        <div className="flex items-center gap-6 flex-wrap">
          {/* Sensor 1: RGB Camera */}
          <div className="flex items-center gap-2">
            <Video className="w-3.5 h-3.5 text-[#242820]" />
            <span className="font-semibold text-[#242820]">RGB Camera</span>
            <span className="text-[#D8D9D1]">·</span>
            <span className="flex items-center gap-1 font-mono text-[11px]">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isUpstreamLive ? "bg-[#285B49]" : "bg-[#B77927]"
                }`}
              />
              <span className={isUpstreamLive ? "text-[#285B49]" : "text-[#B77927]"}>
                {isUpstreamLive ? "Live (1080p / 30fps)" : "Standby (Simulated)"}
              </span>
            </span>
          </div>

          <span className="text-[#D8D9D1] hidden md:inline">|</span>

          {/* Sensor 2: Thermal Sensor */}
          <div className="flex items-center gap-2">
            <Flame className="w-3.5 h-3.5 text-[#6C7068]" />
            <span className="font-semibold text-[#242820]">Thermal Sensor</span>
            <span className="text-[#D8D9D1]">·</span>
            <span className="flex items-center gap-1 font-mono text-[11px] text-[#6C7068]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#B77927]" />
              <span>Standby (Uncalibrated IR)</span>
            </span>
          </div>

          <span className="text-[#D8D9D1] hidden md:inline">|</span>

          {/* Sensor 3: 3D LiDAR */}
          <div className="flex items-center gap-2">
            <Box className="w-3.5 h-3.5 text-[#285B49]" />
            <span className="font-semibold text-[#242820]">3D LiDAR</span>
            <span className="text-[#D8D9D1]">·</span>
            <span className="flex items-center gap-1 font-mono text-[11px] text-[#242820]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#285B49]" />
              <span>Spatial Point Cloud (Interactive)</span>
            </span>
          </div>
        </div>

        {/* Sensor Fusion Sync Delta */}
        <div className="flex items-center gap-2 text-[11px] font-mono text-[#6C7068]">
          <Clock className="w-3 h-3 text-[#6C7068]" />
          <span>Sync Offset: <strong className="text-[#242820]">&lt; 16 ms</strong></span>
        </div>
      </div>

      {/* 2. Main Rescue Sensor Workspace: Primary RGB (68%) + Secondary Stack (32%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Dominant Left Column (~68%): Large Scene Viewport */}
        <div className="lg:col-span-8 xl:col-span-8">
          <LiveCameraCard
            isUpstreamLive={isUpstreamLive}
            latestObservation={latestObservation}
          />
        </div>

        {/* Supporting Right Column (~32%): Vertically Stacked Thermal & 3D LiDAR */}
        <div className="lg:col-span-4 xl:col-span-4 space-y-4">
          <ThermalViewer
            selectedCandidateCoords={activeCandidate.lidarCoords}
            candidateThermalImage={activeCandidate.thermalImage}
            candidateLabel={activeCandidate.thermalLabel}
          />
          <LidarViewer
            selectedCandidateCoords={activeCandidate.lidarCoords}
          />
        </div>
      </div>

      {/* 3. Rover PA Speaker & Autonomous AI Reassurance Console */}
      <RoverSpeakerPanel
        selectedPersonName={latestObservation?.person_name || null}
        selectedDistanceM={
          latestObservation?.distance_m ||
          (activeCandidate.lidarCoords
            ? Number(Math.hypot(activeCandidate.lidarCoords.x, activeCandidate.lidarCoords.y).toFixed(1))
            : 2.1)
        }
        currentSector="Sector 3 North"
      />

      {/* 4. Evidence Association & Candidate Cross-Inspection Section */}
      <div className="rounded-md border border-[#D8D9D1] bg-[#FFFFFF] p-4 space-y-3.5 shadow-xs">
        {/* Header & Candidate Selector */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D8D9D1] pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Crosshair className="w-4 h-4 text-[#285B49]" />
              <h3 className="text-sm font-semibold text-[#242820]">
                Evidence Association &amp; Point of Interest Review
              </h3>
            </div>
            <p className="text-xs text-[#6C7068] mt-0.5">
              Cross-correlate candidate sightings across synchronized optical reference, thermal radiance, and 3D spatial geometry
            </p>
          </div>

          {/* Candidate Tabs */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-mono text-[#6C7068] mr-1">Candidates:</span>
            {candidates.map((cand) => (
              <button
                key={cand.id}
                onClick={() => setSelectedCandidateId(cand.id)}
                className={`px-3 py-1 rounded text-xs font-mono transition cursor-pointer ${
                  selectedCandidateId === cand.id
                    ? "bg-[#285B49] text-white font-medium shadow-xs"
                    : "bg-[#EAE9E2] text-[#6C7068] hover:text-[#242820] hover:bg-[#dcdcd3]"
                }`}
              >
                {cand.code}
              </button>
            ))}
          </div>
        </div>

        {/* Selected Candidate Inspector Details */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 text-xs">
          {/* Col 1: Overview & Synchronization Status (4 cols) */}
          <div className="md:col-span-4 p-3 rounded bg-[#F3F2ED] border border-[#D8D9D1] space-y-2">
            <div className="flex items-center justify-between">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${activeCandidate.tagColor}`}>
                {activeCandidate.classification}
              </span>
              <span className="text-[10px] font-mono text-[#285B49] font-medium">
                {reviewStatus[activeCandidate.id] || "Requires Review"}
              </span>
            </div>

            <div className="text-xs font-semibold text-[#242820]">
              {activeCandidate.title}
            </div>

            <div className="pt-1 space-y-1 font-mono text-[11px] text-[#6C7068]">
              <div className="flex justify-between">
                <span>Timestamp Sync:</span>
                <span className="text-[#242820]">{activeCandidate.syncDelta} offset</span>
              </div>
              <div className="flex justify-between">
                <span>Spatial Coordinates:</span>
                <span className="text-[#242820]">
                  X:{activeCandidate.lidarCoords.x}m Y:{activeCandidate.lidarCoords.y}m Z:{activeCandidate.lidarCoords.z}m
                </span>
              </div>
              <div className="flex justify-between">
                <span>Sensor Calibration:</span>
                <span className="text-[#285B49]">Verified</span>
              </div>
            </div>
          </div>

          {/* Col 2: Supporting vs Missing Evidence (5 cols) */}
          <div className="md:col-span-5 p-3 rounded bg-[#F3F2ED] border border-[#D8D9D1] space-y-2 text-xs">
            <div>
              <span className="text-[10px] uppercase font-semibold text-[#285B49] block mb-0.5">
                Supporting Evidence
              </span>
              <p className="text-[11px] text-[#242820] leading-relaxed">
                {activeCandidate.supportingEvidence}
              </p>
            </div>
            <div className="pt-1 border-t border-[#D8D9D1]">
              <span className="text-[10px] uppercase font-semibold text-[#B77927] block mb-0.5">
                Known Limitations &amp; Missing Data
              </span>
              <p className="text-[11px] text-[#6C7068] leading-relaxed">
                {activeCandidate.missingEvidence}
              </p>
            </div>
          </div>

          {/* Col 3: Operator Verification Actions (3 cols) */}
          <div className="md:col-span-3 p-3 rounded bg-[#F3F2ED] border border-[#D8D9D1] flex flex-col justify-between space-y-2">
            <div>
              <span className="text-[10px] uppercase font-semibold text-[#6C7068] block mb-1">
                Operator Action
              </span>
              <p className="text-[11px] text-[#6C7068] leading-tight">
                Record human confirmation decision for ground team dispatch.
              </p>
            </div>

            <div className="space-y-1.5 pt-1">
              <button
                onClick={() => handleUpdateCandidateReview("Verified Finding")}
                className="w-full py-1.5 px-2 rounded bg-[#285B49] hover:bg-[#1f4739] text-white text-xs font-medium flex items-center justify-center gap-1.5 transition cursor-pointer shadow-xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Verify Finding</span>
              </button>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => handleUpdateCandidateReview("Uncertain")}
                  className="py-1 px-1.5 rounded bg-[#EAE9E2] hover:bg-[#dcdcd3] text-[#242820] border border-[#D8D9D1] text-[11px] font-medium flex items-center justify-center gap-1 transition cursor-pointer"
                >
                  <HelpCircle className="w-3 h-3 text-[#B77927]" />
                  <span>Uncertain</span>
                </button>
                <button
                  onClick={() => handleUpdateCandidateReview("False Positive")}
                  className="py-1 px-1.5 rounded bg-[#EAE9E2] hover:bg-[#B4493F]/10 hover:text-[#B4493F] text-[#6C7068] border border-[#D8D9D1] text-[11px] font-medium flex items-center justify-center gap-1 transition cursor-pointer"
                >
                  <XCircle className="w-3 h-3" />
                  <span>False Pos</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
