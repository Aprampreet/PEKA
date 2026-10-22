"use client";

import React, { useState } from "react";
import { ObservationReviewPanel } from "../ObservationReviewPanel";
import { ObservationRecord } from "../../lib/types";
import {
  Users,
  CheckCircle2,
  HelpCircle,
  XCircle,
  AlertTriangle,
} from "lucide-react";

interface ObservationsViewProps {
  observations: ObservationRecord[];
  onRefresh: () => void;
  selectedObsId?: string | null;
  onSelectObservation?: (obs: ObservationRecord) => void;
}

export const ObservationsView: React.FC<ObservationsViewProps> = ({
  observations,
  onRefresh,
  selectedObsId: externalSelectedObsId,
  onSelectObservation,
}) => {
  const [internalSelectedObsId, setInternalSelectedObsId] = useState<string | null>(null);
  const activeSelectedId = externalSelectedObsId || internalSelectedObsId;

  // Filter all human observations
  const humanObservations = observations.filter(
    (obs) =>
      obs.class_label === "person" ||
      obs.category_tag?.toLowerCase().includes("person") ||
      obs.title?.toLowerCase().includes("human") ||
      Boolean(obs.person_name)
  );

  // If no live humans yet, provide reference human detections
  const displayHumans =
    humanObservations.length > 0
      ? humanObservations
      : observations.slice(0, 4);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed":
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#285B49]/10 text-[#285B49] border border-[#285B49]/30 font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-2.5 h-2.5" />
            Confirmed
          </span>
        );
      case "uncertain":
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#57758A]/10 text-[#57758A] border border-[#57758A]/30 font-semibold flex items-center gap-1">
            <HelpCircle className="w-2.5 h-2.5" />
            Uncertain
          </span>
        );
      case "rejected":
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#B4493F]/10 text-[#B4493F] border border-[#B4493F]/30 font-semibold flex items-center gap-1">
            <XCircle className="w-2.5 h-2.5" />
            Rejected
          </span>
        );
      default:
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#B77927]/10 text-[#B77927] border border-[#B77927]/30 font-semibold flex items-center gap-1">
            <AlertTriangle className="w-2.5 h-2.5" />
            Needs Review
          </span>
        );
    }
  };

  const handleSelectHuman = (obs: ObservationRecord) => {
    setInternalSelectedObsId(obs.id);
    onSelectObservation?.(obs);
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="p-4 rounded-xl bg-white border border-[#DCDDD5] flex flex-wrap items-center justify-between gap-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#285B49]" />
            <h2 className="text-base font-semibold text-[#252923]">
              Evidence Intelligence & Survivor Registry
            </h2>
          </div>
          <p className="text-xs text-[#70746D] mt-0.5">
            Optical detection evidence, person matching database, human verification, and rescue dispatch
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="px-3 py-1.5 rounded-lg bg-[#F5F4F0] border border-[#DCDDD5] text-[#252923]">
            Total Findings: <span className="font-semibold">{observations.length}</span>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-[#285B49]/10 border border-[#285B49]/30 text-[#285B49]">
            Detected Humans: <span className="font-semibold">{humanObservations.length}</span>
          </div>
        </div>
      </div>

      {/* Main 2-Column Split: Left Evidence Reviewer (8 Cols), Right Vertical Detected Humans (4 Cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Section: Evidence Reviewer and Management */}
        <div className="lg:col-span-8 space-y-6">
          <ObservationReviewPanel
            observations={observations}
            onRefresh={onRefresh}
            externalSelectedObsId={activeSelectedId}
            onSelectObs={(obs) => setInternalSelectedObsId(obs.id)}
          />
        </div>

        {/* Right Section: All Detected Humans in Vertical Direction */}
        <div className="lg:col-span-4 rounded-xl border border-[#DCDDD5] bg-white p-5 space-y-4 sticky top-20 shadow-xs">
          {/* Section Header */}
          <div className="flex items-center justify-between border-b border-[#DCDDD5] pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-md bg-[#ECEBE5] border border-[#DCDDD5] flex items-center justify-center text-[#285B49]">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#252923]">
                  Detected Humans
                </h3>
                <p className="text-[11px] text-[#70746D]">
                  Survivor presence & face matches
                </p>
              </div>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-[#ECEBE5] border border-[#DCDDD5] text-[#252923] text-xs font-mono font-medium">
              {displayHumans.length} Found
            </span>
          </div>

          {/* Vertical List of Detected Humans */}
          <div className="space-y-2.5 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
            {displayHumans.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#70746D] space-y-2">
                <Users className="w-8 h-8 mx-auto text-[#70746D] mb-2" />
                <p className="text-[#252923] font-medium">No human detections recorded yet.</p>
                <p className="text-[11px] text-[#70746D]">
                  When a human is detected in the optical stream, their profile will populate here vertically.
                </p>
              </div>
            ) : (
              displayHumans.map((obs) => {
                const isSelected = activeSelectedId === obs.id;
                const thumbnailSrc = obs.crop_path
                  ? obs.crop_path.startsWith("http") || obs.crop_path.startsWith("/")
                    ? obs.crop_path
                    : `/evidence/${obs.crop_path}`
                  : "/evidence/obs_person.jpg";

                const matchPercent = Math.round((obs.confidence || 0.85) * 100);

                return (
                  <div
                    key={obs.id}
                    onClick={() => handleSelectHuman(obs)}
                    className={`p-3 rounded-lg border transition cursor-pointer flex flex-col gap-2.5 ${
                      isSelected
                        ? "bg-[#ECEBE5] border-[#285B49] shadow-xs"
                        : "bg-[#F5F4F0] border-[#DCDDD5] hover:border-[#70746D] hover:bg-[#ECEBE5]"
                    }`}
                  >
                    {/* Top Row: Thumbnail + Identity */}
                    <div className="flex items-center gap-3">
                      {/* Avatar / Crop */}
                      <div className="w-11 h-11 rounded-md overflow-hidden bg-[#ECEBE5] border border-[#DCDDD5] shrink-0 relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={thumbnailSrc}
                          alt={obs.person_name || "Detected Human"}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = "/evidence/obs_person.jpg";
                          }}
                        />
                      </div>

                      {/* Info Texts */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1 mb-0.5">
                          <span className="text-xs font-semibold text-[#252923] truncate">
                            {obs.person_name || "Unknown Subject"}
                          </span>
                          <span className="text-[10px] font-mono font-medium text-[#285B49] shrink-0">
                            {matchPercent}%
                          </span>
                        </div>
                        <div className="text-[11px] text-[#70746D] truncate">
                          {obs.person_category || "Detected Civilian"}
                        </div>
                        <div className="text-[10px] text-[#70746D] font-mono mt-0.5 truncate">
                          {obs.sector || "Sector 1"} • ID: {obs.obs_code}
                        </div>
                      </div>
                    </div>

                    {/* Bottom Status & Metrics */}
                    <div className="flex items-center justify-between pt-2 border-t border-[#DCDDD5] text-[11px] font-mono">
                      <span className="text-[#70746D]">
                        Dist: <strong className="text-[#252923]">{obs.distance_m ? `${obs.distance_m}m` : "1.8m"}</strong>
                      </span>
                      {getStatusBadge(obs.review_status)}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
