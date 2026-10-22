"use client";

import React, { useState, useEffect } from "react";
import {
  Crosshair,
  ArrowRight,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  Radio,
  MapPin,
  Send,
  X,
  User,
  Loader2,
} from "lucide-react";
import { ObservationRecord } from "../lib/types";
import { api } from "../lib/api";

interface RecentObservationsProps {
  observations: ObservationRecord[];
  onSelectObservation?: (obs: ObservationRecord) => void;
  onViewAll?: () => void;
  onRefresh?: () => void;
}

export const RecentObservations: React.FC<RecentObservationsProps> = ({
  observations,
  onSelectObservation,
  onViewAll,
  onRefresh,
}) => {
  const [selectedObs, setSelectedObs] = useState<ObservationRecord | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);
  const [dispatchModalOpen, setDispatchModalOpen] = useState<boolean>(false);
  const [dispatchPriority, setDispatchPriority] = useState<string>("P1 - Immediate");
  const [dispatchTeam, setDispatchTeam] = useState<string>("Team Alpha (Search & Rescue)");
  const [dispatchSummary, setDispatchSummary] = useState<string>("");
  const [isDispatching, setIsDispatching] = useState<boolean>(false);
  const [dispatchedSuccess, setDispatchedSuccess] = useState<string | null>(null);

  // Fallback items if observations array is empty
  const defaultItems: ObservationRecord[] = [
    {
      id: "obs-fallback-01",
      obs_code: "OBS-01-0091",
      category_tag: "Person (Possible)",
      title: "Possible human detected",
      sector: "Sector 3",
      confidence: 0.87,
      distance_m: 1.8,
      pos_x: 0.4,
      pos_y: 1.5,
      pos_z: 0.0,
      class_label: "person",
      review_status: "unreviewed",
      created_at: "2026-10-21T13:00:00.000Z",
      timestamp: "2026-10-21T13:00:00.000Z",
      crop_path: "obs_person.jpg",
      full_frame_path: "obs_person.jpg",
      person_name: "Sarah Chen",
      person_category: "Reported Missing Civilian",
      medical_alerts: "Asthma / Inhaler required. Wore blue jacket.",
    },
    {
      id: "obs-fallback-02",
      obs_code: "OBS-01-0092",
      category_tag: "Structural Risk",
      title: "Unstable structure",
      sector: "Sector 1",
      confidence: 0.76,
      distance_m: 3.2,
      pos_x: -0.8,
      pos_y: 2.4,
      pos_z: 0.0,
      class_label: "structural_risk",
      review_status: "unreviewed",
      created_at: "2026-10-21T12:54:00.000Z",
      timestamp: "2026-10-21T12:54:00.000Z",
      crop_path: "obs_structure.jpg",
      full_frame_path: "obs_structure.jpg",
    },
    {
      id: "obs-fallback-03",
      obs_code: "OBS-01-0093",
      category_tag: "Point of Interest",
      title: "Area requires inspection",
      sector: "Sector 2",
      confidence: 0.62,
      distance_m: 2.1,
      pos_x: 0.6,
      pos_y: 0.9,
      pos_z: 0.0,
      class_label: "point_of_interest",
      review_status: "unreviewed",
      created_at: "2026-10-21T12:50:00.000Z",
      timestamp: "2026-10-21T12:50:00.000Z",
      crop_path: "obs_poi.jpg",
      full_frame_path: "obs_poi.jpg",
    },
    {
      id: "obs-fallback-04",
      obs_code: "OBS-01-0094",
      category_tag: "Equipment",
      title: "Backpack detected",
      sector: "Sector 3",
      confidence: 0.68,
      distance_m: 1.4,
      pos_x: -0.2,
      pos_y: 1.2,
      pos_z: 0.0,
      class_label: "equipment",
      review_status: "unreviewed",
      created_at: "2026-10-21T12:47:00.000Z",
      timestamp: "2026-10-21T12:47:00.000Z",
      crop_path: "obs_equipment.jpg",
      full_frame_path: "obs_equipment.jpg",
    },
  ];

  const [isClient, setIsClient] = useState<boolean>(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  // Helper to compute relative time label
  const getRelativeTime = (timestamp: string) => {
    if (!isClient) {
      if (timestamp.includes("13:00")) return "2 min ago";
      if (timestamp.includes("12:54")) return "8 min ago";
      if (timestamp.includes("12:50")) return "12 min ago";
      return "15 min ago";
    }
    try {
      const diffMs = Date.now() - new Date(timestamp).getTime();
      const diffMin = Math.floor(diffMs / 60000);
      if (diffMin < 1) return "Just now";
      if (diffMin === 1) return "1 min ago";
      if (diffMin < 60) return `${diffMin} min ago`;
      const diffHrs = Math.floor(diffMin / 60);
      return `${diffHrs}h ago`;
    } catch {
      return "Recently";
    }
  };

  // Helper to pick category styling
  const getCategoryBadgeStyle = (category?: string) => {
    switch (category) {
      case "Person (Possible)":
        return "bg-[#B4493F]/10 text-[#B4493F] border border-[#B4493F]/30";
      case "Structural Risk":
        return "bg-[#B77927]/10 text-[#B77927] border border-[#B77927]/30";
      case "Point of Interest":
        return "bg-[#57758A]/10 text-[#57758A] border border-[#57758A]/30";
      case "Equipment":
        return "bg-[#7D8964]/10 text-[#7D8964] border border-[#7D8964]/30";
      default:
        return "bg-[#285B49]/10 text-[#285B49] border border-[#285B49]/30";
    }
  };

  const getConfidenceBadgeStyle = (confidence: number) => {
    if (confidence >= 0.8) {
      return "bg-[#EAE9E2] text-[#285B49] border border-[#D8D9D1]";
    }
    if (confidence >= 0.7) {
      return "bg-[#EAE9E2] text-[#B77927] border border-[#D8D9D1]";
    }
    return "bg-[#EAE9E2] text-[#6C7068] border border-[#D8D9D1]";
  };

  // Select 4 diverse operational categories
  const targetCategories = [
    "Person (Possible)",
    "Structural Risk",
    "Point of Interest",
    "Equipment",
  ];

  const diverseItems: ObservationRecord[] = [];
  targetCategories.forEach((tag) => {
    const found = observations.find((o) => o.category_tag === tag);
    if (found) {
      diverseItems.push(found);
    } else {
      const fallback = defaultItems.find((d) => d.category_tag === tag);
      if (fallback) diverseItems.push(fallback);
    }
  });

  const displayItems: ObservationRecord[] =
    diverseItems.length === 4 ? diverseItems : observations.slice(0, 4);

  const handleRowClick = (obs: ObservationRecord) => {
    setSelectedObs(obs);
    onSelectObservation?.(obs);
  };

  const handleUpdateStatus = async (
    status: "confirmed" | "rejected" | "uncertain"
  ) => {
    if (!selectedObs) return;
    setIsUpdatingStatus(true);
    try {
      await api.reviewObservation(
        selectedObs.id,
        status,
        `Operator verified via mission center at ${new Date().toISOString()}`
      );
      setSelectedObs((prev) => (prev ? { ...prev, review_status: status } : null));
      onRefresh?.();
    } catch (e) {
      console.error("Status update error:", e);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleDispatchIncident = async () => {
    if (!selectedObs) return;
    setIsDispatching(true);
    try {
      const summaryText =
        dispatchSummary.trim() ||
        `Verified ${selectedObs.category_tag || "finding"} at ${
          selectedObs.sector || "Sector 1"
        }. Ground rescue deployment authorized.`;
      const res = await api.createIncident(
        selectedObs.id,
        dispatchPriority,
        dispatchTeam,
        summaryText
      );
      if (res) {
        setDispatchedSuccess(res.incident_code);
      }
      setTimeout(() => {
        setDispatchModalOpen(false);
        setDispatchedSuccess(null);
        setSelectedObs(null);
        onRefresh?.();
      }, 1800);
    } catch (e) {
      console.error("Incident dispatch error:", e);
    } finally {
      setIsDispatching(false);
    }
  };

  return (
    <div className="rounded-md border border-[#D8D9D1] bg-white p-4 flex flex-col justify-between shadow-xs">
      <div>
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded bg-[#EAE9E2] border border-[#D8D9D1] flex items-center justify-center text-[#285B49]">
              <Crosshair className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-[#242820] tracking-tight">
              Recent Observations
            </h3>
          </div>
          {onViewAll && (
            <button
              onClick={onViewAll}
              className="flex items-center gap-1 text-xs font-medium text-[#285B49] hover:text-[#1f4739] transition cursor-pointer"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Observation Rows */}
        <div className="space-y-2">
          {displayItems.map((obs) => {
            const thumbnailSrc = obs.crop_path
              ? obs.crop_path.startsWith("http") || obs.crop_path.startsWith("/")
                ? obs.crop_path
                : `/evidence/${obs.crop_path}`
              : "/evidence/obs_person.jpg";

            const confPercent = Math.round((obs.confidence || 0.85) * 100);
            const timeAgoText = getRelativeTime(obs.timestamp || obs.created_at);

            return (
              <div
                key={obs.id}
                onClick={() => handleRowClick(obs)}
                className="group p-2.5 rounded bg-[#F3F2ED] border border-[#D8D9D1] hover:border-[#7D8964] hover:bg-[#EAE9E2] transition cursor-pointer flex items-center justify-between gap-3"
              >
                {/* Left: Thumbnail & Info */}
                <div className="flex items-center gap-3 min-w-0">
                  {/* Thumbnail Image */}
                  <div className="w-11 h-11 rounded overflow-hidden bg-[#EAE9E2] border border-[#D8D9D1] shrink-0 relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumbnailSrc}
                      alt={obs.title || "Observation"}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "/evidence/obs_person.jpg";
                      }}
                    />
                  </div>

                  {/* Texts & Tag */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span
                        className={`text-[9px] font-semibold px-1.5 py-0.5 rounded leading-none ${getCategoryBadgeStyle(
                          obs.category_tag
                        )}`}
                      >
                        {obs.category_tag || "Observation"}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-[#242820] truncate">
                      {obs.title || "Disaster Zone Finding"}
                    </div>
                    <div className="text-[11px] text-[#6C7068] font-normal truncate">
                      {obs.sector || "Sector 1"} • {timeAgoText}
                    </div>
                  </div>
                </div>

                {/* Right: Confidence Badge & Chevron */}
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`text-xs font-mono font-medium px-2 py-0.5 rounded ${getConfidenceBadgeStyle(
                      obs.confidence || 0.85
                    )}`}
                  >
                    {confPercent}%
                  </span>
                  <ChevronRight className="w-4 h-4 text-[#6C7068] group-hover:text-[#242820] group-hover:translate-x-0.5 transition" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Observation Evidence Inspection Drawer / Modal */}
      {selectedObs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl bg-white border border-[#DCDDD5] p-6 space-y-5 shadow-xl">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-[#DCDDD5] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#ECEBE5] border border-[#DCDDD5] flex items-center justify-center text-[#285B49]">
                  <Crosshair className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-[#252923]">
                      {selectedObs.title || "Observation Evidence Detail"}
                    </h3>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded ${getCategoryBadgeStyle(
                        selectedObs.category_tag
                      )}`}
                    >
                      {selectedObs.category_tag || "Observation"}
                    </span>
                  </div>
                  <div className="text-xs text-[#70746D] font-mono mt-0.5">
                    Identifier: <span className="text-[#252923]">{selectedObs.obs_code}</span> •{" "}
                    {selectedObs.sector || "Sector 1"} •{" "}
                    {new Date(selectedObs.timestamp || selectedObs.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedObs(null)}
                className="p-1.5 rounded-lg text-[#70746D] hover:text-[#252923] hover:bg-[#ECEBE5] transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Evidence Image Viewport */}
            <div className="rounded-lg overflow-hidden border border-[#DCDDD5] bg-[#121411] relative aspect-video flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  selectedObs.full_frame_path?.startsWith("http") ||
                  selectedObs.full_frame_path?.startsWith("/")
                    ? selectedObs.full_frame_path
                    : `/evidence/${selectedObs.full_frame_path || selectedObs.crop_path}`
                }
                alt="Full Evidence Frame"
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/evidence/obs_person.jpg";
                }}
              />
              {/* Confidence Overlay */}
              <div className="absolute top-3 right-3 px-2.5 py-1 rounded-md bg-black/80 border border-white/20 text-xs font-mono text-white font-medium">
                Detection Score: {Math.round((selectedObs.confidence || 0.85) * 100)}%
              </div>
            </div>

            {/* Spatial & Physical Metrics */}
            <div className="grid grid-cols-3 gap-3 text-xs font-mono">
              <div className="p-3 rounded-lg bg-[#F5F4F0] border border-[#DCDDD5]">
                <span className="text-[#70746D] block text-[10px]">DISTANCE TO ROBOT</span>
                <span className="text-[#285B49] text-sm font-semibold">
                  {selectedObs.distance_m ? `${selectedObs.distance_m} m` : "2.1 m"}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-[#F5F4F0] border border-[#DCDDD5]">
                <span className="text-[#70746D] block text-[10px]">MAP COORDINATES</span>
                <span className="text-[#252923] text-sm font-semibold">
                  X: {selectedObs.pos_x ?? 0.4}m, Y: {selectedObs.pos_y ?? 1.5}m
                </span>
              </div>
              <div className="p-3 rounded-lg bg-[#F5F4F0] border border-[#DCDDD5]">
                <span className="text-[#70746D] block text-[10px]">REVIEW STATUS</span>
                <span
                  className={`text-sm font-semibold capitalize ${
                    selectedObs.review_status === "confirmed"
                      ? "text-[#285B49]"
                      : selectedObs.review_status === "rejected"
                      ? "text-[#B4493F]"
                      : "text-[#B77927]"
                  }`}
                >
                  {selectedObs.review_status || "Unreviewed"}
                </span>
              </div>
            </div>

            {/* Person Registry Match (If Person Observation) */}
            {selectedObs.person_name && (
              <div className="p-3.5 rounded-lg bg-[#ECEBE5] border border-[#DCDDD5] flex items-start gap-3.5">
                <div className="w-12 h-12 rounded-md overflow-hidden bg-white border border-[#DCDDD5] shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={
                      selectedObs.person_photo
                        ? `/evidence/${selectedObs.person_photo}`
                        : "/evidence/sarah_chen.jpg"
                    }
                    alt={selectedObs.person_name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/evidence/sarah_chen.jpg";
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-[#252923]">
                      {selectedObs.person_name}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white text-[#70746D] border border-[#DCDDD5] font-mono">
                      {selectedObs.person_category || "Registered Civilian"}
                    </span>
                  </div>
                  <p className="text-[#70746D] text-[11px] mt-1">
                    <strong className="text-[#252923]">Medical Notes:</strong>{" "}
                    {selectedObs.medical_alerts || "None documented"}
                  </p>
                </div>
              </div>
            )}

            {/* Operator Review Actions */}
            <div className="border-t border-[#DCDDD5] pt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[#70746D]">
                  Verification:
                </span>
                <button
                  onClick={() => handleUpdateStatus("confirmed")}
                  disabled={isUpdatingStatus}
                  className="px-3 py-1.5 rounded-lg bg-[#285B49] hover:bg-[#1f4739] text-white text-xs font-medium flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Confirm Finding</span>
                </button>
                <button
                  onClick={() => handleUpdateStatus("uncertain")}
                  disabled={isUpdatingStatus}
                  className="px-3 py-1.5 rounded-lg bg-[#B77927] hover:bg-[#96631e] text-white text-xs font-medium flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                  <span>Uncertain</span>
                </button>
                <button
                  onClick={() => handleUpdateStatus("rejected")}
                  disabled={isUpdatingStatus}
                  className="px-3 py-1.5 rounded-lg bg-[#ECEBE5] hover:bg-[#B4493F]/10 hover:text-[#B4493F] text-[#70746D] text-xs font-medium border border-[#DCDDD5] flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>Reject</span>
                </button>
              </div>

              {/* Incident Dispatch Trigger */}
              <button
                onClick={() => setDispatchModalOpen(true)}
                className="px-3.5 py-1.5 rounded-lg bg-[#285B49]/10 hover:bg-[#285B49]/20 border border-[#285B49]/30 text-[#285B49] text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Dispatch Rescue Team</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dispatch Incident Modal */}
      {dispatchModalOpen && selectedObs && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl bg-white border border-[#DCDDD5] p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#ECEBE5] border border-[#DCDDD5] flex items-center justify-center text-[#285B49]">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#252923]">
                  Dispatch Ground Rescue
                </h3>
                <span className="text-xs text-[#285B49] font-mono">
                  REF: {selectedObs.obs_code}
                </span>
              </div>
            </div>

            {dispatchedSuccess ? (
              <div className="p-4 rounded-lg bg-[#285B49]/10 border border-[#285B49]/30 text-[#285B49] text-center space-y-1">
                <CheckCircle2 className="w-8 h-8 text-[#285B49] mx-auto" />
                <div className="text-sm font-semibold">Rescue Mission Dispatched!</div>
                <div className="text-xs font-mono">Incident Code: {dispatchedSuccess}</div>
              </div>
            ) : (
              <>
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-[#70746D] font-medium block mb-1">
                      Priority Level
                    </label>
                    <select
                      value={dispatchPriority}
                      onChange={(e) => setDispatchPriority(e.target.value)}
                      className="w-full p-2.5 rounded-lg bg-[#F5F4F0] border border-[#DCDDD5] text-[#252923] focus:outline-none focus:border-[#285B49]"
                    >
                      <option value="P1 - Immediate">P1 - Immediate (Survivor Detected)</option>
                      <option value="P2 - Urgent">P2 - Urgent (Structural Hazard)</option>
                      <option value="P3 - Routine">P3 - Routine Inspection</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[#70746D] font-medium block mb-1">
                      Assigned Rescue Team
                    </label>
                    <select
                      value={dispatchTeam}
                      onChange={(e) => setDispatchTeam(e.target.value)}
                      className="w-full p-2.5 rounded-lg bg-[#F5F4F0] border border-[#DCDDD5] text-[#252923] focus:outline-none focus:border-[#285B49]"
                    >
                      <option value="Team Alpha (Search & Rescue)">
                        Team Alpha (Search & Rescue)
                      </option>
                      <option value="Team Bravo (Heavy Debris Extrication)">
                        Team Bravo (Heavy Debris Extrication)
                      </option>
                      <option value="Medical Evac Unit 1">Medical Evac Unit 1</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[#70746D] font-medium block mb-1">
                      Operational Brief / Dispatch Notes
                    </label>
                    <textarea
                      rows={3}
                      value={dispatchSummary}
                      onChange={(e) => setDispatchSummary(e.target.value)}
                      placeholder={`Verified ${selectedObs.category_tag} in ${selectedObs.sector}. Ground rescue deployment required.`}
                      className="w-full p-2.5 rounded-lg bg-[#F5F4F0] border border-[#DCDDD5] text-[#252923] placeholder-[#70746D] focus:outline-none focus:border-[#285B49]"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    onClick={() => setDispatchModalOpen(false)}
                    className="px-4 py-2 rounded-lg text-xs font-medium text-[#70746D] hover:text-[#252923] transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDispatchIncident}
                    disabled={isDispatching}
                    className="px-4 py-2 rounded-lg bg-[#285B49] hover:bg-[#1f4739] text-white text-xs font-medium transition flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {isDispatching ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    <span>Authorize Dispatch</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
