"use client";

import React, { useState } from "react";
import { UserCheck, ShieldQuestion, Check, X, FileCode, HelpCircle } from "lucide-react";
import { RecognitionStatus } from "../lib/types";
import { api } from "../lib/api";

interface RecognitionPanelProps {
  recognitionData: RecognitionStatus | null;
  onCandidateReviewed: () => void;
}

export const RecognitionPanel: React.FC<RecognitionPanelProps> = ({
  recognitionData,
  onCandidateReviewed,
}) => {
  const [statusOverrides, setStatusOverrides] = useState<
    Record<string, "pending" | "confirmed" | "rejected">
  >({});
  const [showSpec, setShowSpec] = useState<boolean>(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const rawCandidates = recognitionData?.candidates || [];
  const candidates = rawCandidates.map((c) => ({
    ...c,
    review_status: statusOverrides[c.event_id] || c.review_status,
  }));

  const handleReview = async (
    eventId: string,
    decision: "confirmed" | "rejected" | "pending"
  ) => {
    setReviewingId(eventId);
    try {
      await api.reviewCandidate(eventId, decision);
      setStatusOverrides((prev) => ({ ...prev, [eventId]: decision }));
      onCandidateReviewed();
    } finally {
      setReviewingId(null);
    }
  };

  return (
    <div className="rounded-lg border border-slate-800 bg-[#0c1220] flex flex-col overflow-hidden shadow-lg">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
        <div className="flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-semibold tracking-wide text-slate-200 uppercase font-mono">
            Candidate Identification Boundary
          </h2>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-bold">
            NOT CONNECTED (FUTURE SERVICE)
          </span>
        </div>

        <button
          onClick={() => setShowSpec(!showSpec)}
          className={`p-1.5 rounded border text-xs transition cursor-pointer flex items-center gap-1 font-mono ${
            showSpec
              ? "bg-cyan-900/40 border-cyan-700 text-cyan-300"
              : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
          }`}
          title="Toggle External API Contract Requirements"
        >
          <FileCode className="w-3.5 h-3.5" />
          <span className="hidden sm:inline text-[11px]">INTEGRATION REQS</span>
        </button>
      </div>

      {/* Integration Requirement Drawer */}
      {showSpec && (
        <div className="bg-slate-900/95 border-b border-slate-800 px-4 py-3 text-xs font-mono text-slate-300 space-y-2">
          <div className="flex items-center gap-2 text-cyan-300 font-bold">
            <HelpCircle className="w-4 h-4 text-cyan-400" />
            <span>External Facial-Recognition Specification Blueprint</span>
          </div>
          <p className="text-[11px] text-slate-400">
            No external biometric service exists yet. This panel enforces human-in-the-loop review and defines the required schema before any live integration:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] bg-black/40 p-2.5 rounded border border-slate-800">
            <div>
              <span className="text-slate-400">Required Transport:</span>{" "}
              <span className="text-cyan-300">HTTP Webhook (POST) / WSS Event Pipe</span>
            </div>
            <div>
              <span className="text-slate-400">Authentication:</span>{" "}
              <span className="text-cyan-300">Mutual TLS (mTLS) / Scoped Bearer Token</span>
            </div>
            <div className="md:col-span-2">
              <span className="text-slate-400">Privacy Safeguards:</span>{" "}
              <span className="text-slate-300">
                Zero raw facial embedding storage. Pseudonymous candidate IDs only. All detections remain unverified candidates until an operator confirms.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Disclaimers & Review Protocol */}
      <div className="px-4 py-2 bg-slate-900/40 border-b border-slate-800/80 text-[11px] font-mono text-slate-400 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldQuestion className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span>HUMAN-IN-THE-LOOP VERIFICATION QUEUE [DEMO CANDIDATES]</span>
        </div>
        <span className="text-[10px] text-slate-500 hidden sm:inline">
          Actions below are local UI simulations
        </span>
      </div>

      {/* Candidate List */}
      <div className="p-4 space-y-3">
        {candidates.length === 0 ? (
          <div className="py-8 text-center text-xs font-mono text-slate-500">
            No recognition candidate events received. Service is standing by.
          </div>
        ) : (
          candidates.map((cand) => (
            <div
              key={cand.event_id}
              className="p-3 rounded-lg border border-slate-800 bg-slate-900/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs font-mono"
            >
              {/* Candidate Metadata */}
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-200">
                    {cand.candidate_label}
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                      cand.review_status === "confirmed"
                        ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                        : cand.review_status === "rejected"
                        ? "bg-red-950 text-red-300 border border-red-800"
                        : "bg-amber-950 text-amber-300 border border-amber-800"
                    }`}
                  >
                    {cand.review_status}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    ID: {cand.event_id}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">{cand.notes}</p>
                <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500 pt-0.5">
                  <span>Source: {cand.camera_source}</span>
                  <span>Semantics: {cand.confidence_semantics}</span>
                  <span>Ref: {cand.evidence_ref}</span>
                </div>
              </div>

              {/* Review Buttons */}
              <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                <button
                  onClick={() => handleReview(cand.event_id, "confirmed")}
                  disabled={reviewingId === cand.event_id || cand.review_status === "confirmed"}
                  className="px-2.5 py-1 rounded border border-emerald-600/40 bg-emerald-950/30 hover:bg-emerald-950/60 text-emerald-300 text-[11px] transition cursor-pointer flex items-center gap-1 disabled:opacity-40"
                  title="Simulate operator confirmation"
                >
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span>CONFIRM</span>
                </button>
                <button
                  onClick={() => handleReview(cand.event_id, "rejected")}
                  disabled={reviewingId === cand.event_id || cand.review_status === "rejected"}
                  className="px-2.5 py-1 rounded border border-red-600/40 bg-red-950/30 hover:bg-red-950/60 text-red-300 text-[11px] transition cursor-pointer flex items-center gap-1 disabled:opacity-40"
                  title="Simulate operator rejection"
                >
                  <X className="w-3 h-3 text-red-400" />
                  <span>REJECT</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
