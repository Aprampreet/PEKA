"use client";

import React, { useState } from "react";
import { Flame, AlertCircle } from "lucide-react";

interface ThermalViewerProps {
  onSelectAnomaly?: (anomaly: { x: number; y: number; label: string }) => void;
  selectedCandidateCoords?: { x: number; y: number; z: number } | null;
  candidateThermalImage?: string | null;
  candidateLabel?: string | null;
}

export const ThermalViewer: React.FC<ThermalViewerProps> = ({
  candidateThermalImage,
  candidateLabel,
}) => {
  const [viewMode, setViewMode] = useState<"live" | "candidate_evidence">(
    candidateThermalImage ? "candidate_evidence" : "live"
  );

  return (
    <div className="rounded-md border border-[#D8D9D1] bg-[#FFFFFF] overflow-hidden flex flex-col justify-between shadow-xs">
      {/* Sub-header */}
      <div className="px-3 py-2 border-b border-[#D8D9D1] flex items-center justify-between text-xs bg-[#FFFFFF]">
        <div className="flex items-center gap-2">
          <Flame className="w-3.5 h-3.5 text-[#6C7068]" />
          <span className="font-semibold text-[#242820]">Thermal View</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-[#EAE9E2] text-[#6C7068] font-medium">
            IR RADIANCE (UNCALIBRATED)
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-mono text-[#6C7068]">
          <span>/thermal/radiance</span>
        </div>
      </div>

      {/* Viewport Area */}
      <div className="relative aspect-[16/9] bg-[#121411] overflow-hidden flex flex-col items-center justify-center p-3 text-center">
        {candidateThermalImage && viewMode === "candidate_evidence" ? (
          /* Real Recorded Thermal Crop Image */
          <div className="relative w-full h-full flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={candidateThermalImage}
              alt="Recorded Thermal Evidence"
              className="w-full h-full object-contain filter contrast-125"
            />
            <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/75 text-[10px] font-mono text-white">
              CANDIDATE EVIDENCE: {candidateLabel || "THERMAL ANOMALY"}
            </div>
            <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/75 text-[9px] font-mono text-[#D8D9D1]">
              Uncalibrated False-Color IR
            </div>
          </div>
        ) : (
          /* Clean, Intentional Disconnected / Standby State */
          <div className="space-y-2 max-w-xs">
            <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center mx-auto text-[#6C7068]">
              <AlertCircle className="w-4 h-4 text-[#B77927]" />
            </div>
            <div>
              <div className="text-xs font-semibold text-[#EAE9E2]">
                Thermal Source Standby
              </div>
              <p className="text-[11px] text-[#6C7068] leading-tight mt-1">
                ROS 2 topic <code className="text-[#EAE9E2] font-mono">/thermal/radiance</code> is not currently publishing live frames.
              </p>
            </div>
            <div className="pt-1 flex items-center justify-center gap-2 text-[10px] font-mono text-[#6C7068]">
              <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                Frame: thermal_optical_frame
              </span>
              <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                16-bit Raw IR
              </span>
            </div>
          </div>
        )}

        {/* View Mode Switcher if candidate thermal evidence exists */}
        {candidateThermalImage && (
          <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
            <button
              onClick={() => setViewMode(viewMode === "live" ? "candidate_evidence" : "live")}
              className="px-2 py-0.5 rounded bg-black/80 hover:bg-black text-[9px] font-mono text-[#EAE9E2] border border-white/20 transition cursor-pointer"
            >
              {viewMode === "live" ? "Show Candidate IR" : "Show Live Stream"}
            </button>
          </div>
        )}

        {/* Bottom Metadata Bar */}
        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/60 text-[9px] font-mono text-[#6C7068]">
          Status: {candidateThermalImage && viewMode === "candidate_evidence" ? "Recorded Snapshot" : "Awaiting Driver"}
        </div>
      </div>
    </div>
  );
};
