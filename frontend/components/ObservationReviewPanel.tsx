"use client";

import React, { useState } from "react";
import {
  UserCheck,
  Search,
  Check,
  X,
  HelpCircle,
  Printer,
  ShieldAlert,
  Loader2,
  Sparkles,
  UserPlus,
  Camera,
  Upload,
  AlertCircle,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { ObservationRecord, IncidentRecord } from "../lib/types";
import { api } from "../lib/api";

interface ObservationReviewPanelProps {
  observations: ObservationRecord[];
  onRefresh: () => void;
  onSelectObservationOnMap?: (obs: ObservationRecord) => void;
  externalSelectedObsId?: string | null;
  onSelectObs?: (obs: ObservationRecord) => void;
}

export const ObservationReviewPanel: React.FC<ObservationReviewPanelProps> = ({
  observations,
  onRefresh,
  onSelectObservationOnMap,
  externalSelectedObsId,
  onSelectObs,
}) => {
  const [internalSelectedObsId, setInternalSelectedObsId] = useState<string | null>(null);
  const selectedObsId =
    externalSelectedObsId !== undefined && externalSelectedObsId !== null
      ? externalSelectedObsId
      : internalSelectedObsId;

  const setSelectedObsId = (id: string | null) => {
    setInternalSelectedObsId(id);
    const found = observations.find((o) => o.id === id);
    if (found && onSelectObs) {
      onSelectObs(found);
    }
  };
  const [isTriggering, setIsTriggering] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Incident dispatch modal state
  const [showIncidentModal, setShowIncidentModal] = useState<boolean>(false);
  const [incidentPriority, setIncidentPriority] = useState<string>("P1 - Immediate");
  const [incidentTeam, setIncidentTeam] = useState<string>("Team Alpha (Search & Rescue)");
  const [incidentSummary, setIncidentSummary] = useState<string>("");
  const [createdIncident, setCreatedIncident] = useState<IncidentRecord | null>(null);

  // Person enrollment modal state
  const [showEnrollModal, setShowEnrollModal] = useState<boolean>(false);
  const [enrollName, setEnrollName] = useState<string>("");
  const [enrollCategory, setEnrollCategory] = useState<string>("Operator / Team Lead");
  const [enrollBadge, setEnrollBadge] = useState<string>("");
  const [enrollMedical, setEnrollMedical] = useState<string>("None documented");
  const [enrollSource, setEnrollSource] = useState<"camera" | "upload">("camera");
  const [enrollBase64, setEnrollBase64] = useState<string | null>(null);
  const [isEnrolling, setIsEnrolling] = useState<boolean>(false);
  const [enrollSuccessMessage, setEnrollSuccessMessage] = useState<string | null>(null);

  // Active observation
  const activeObs =
    observations.find((o) => o.id === selectedObsId) ||
    observations.find((o) => o.review_status === "unreviewed") ||
    observations[0] ||
    null;

  const isMatched = Boolean(
    activeObs?.matched_person_id &&
    activeObs?.person_name &&
    (activeObs.match_similarity ?? 0) >= 0.55
  );

  const handleReview = async (
    status: "confirmed" | "rejected" | "uncertain",
    note?: string
  ) => {
    if (!activeObs) return;
    setIsSubmitting(true);
    try {
      if (status === "confirmed") {
        setShowIncidentModal(true);
      } else {
        await api.reviewObservation(activeObs.id, status, note);
        onRefresh();
      }
    } catch (e) {
      console.error("Review error:", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmAndDispatch = async () => {
    if (!activeObs) return;
    setIsSubmitting(true);
    try {
      await api.reviewObservation(
        activeObs.id,
        "confirmed",
        `Human confirmed by operator: ${incidentSummary || "Verified on camera"}`
      );
      const inc = await api.createIncident(
        activeObs.id,
        incidentPriority,
        incidentTeam,
        incidentSummary ||
          `Survivor observation confirmed: ${activeObs.title}. Dispatched ${incidentTeam}.`
      );
      setCreatedIncident(inc);
      onRefresh();
    } catch (e) {
      console.error("Incident creation error:", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTriggerDetection = async () => {
    setIsTriggering(true);
    try {
      const res = await api.triggerObservation();
      if (res && res.id) {
        setSelectedObsId(res.id);
      }
      onRefresh();
    } catch (e) {
      console.error("Trigger detection error:", e);
    } finally {
      setIsTriggering(false);
    }
  };

  const handleEnrollSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollName.trim()) return;

    setIsEnrolling(true);
    try {
      let imagePayload: string | undefined = undefined;
      if (enrollSource === "upload" && enrollBase64) {
        imagePayload = enrollBase64;
      }

      const res = await api.enrollPerson({
        full_name: enrollName.trim(),
        category: enrollCategory,
        badge_or_id: enrollBadge.trim() || undefined,
        medical_alerts: enrollMedical.trim() || undefined,
        photo_base64: imagePayload,
        capture_from_camera: enrollSource === "camera",
      });

      if (res) {
        setEnrollSuccessMessage(`Successfully enrolled "${res.full_name}" into database.`);
        setTimeout(() => {
          setShowEnrollModal(false);
          setEnrollSuccessMessage(null);
          setEnrollName("");
          setEnrollBadge("");
          setEnrollBase64(null);
          onRefresh();
        }, 1500);
      }
    } catch {
      // Handled
    } finally {
      setIsEnrolling(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEnrollBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClearUnreviewed = async () => {
    try {
      await api.clearUnreviewedObservations();
      onRefresh();
    } catch (e) {
      console.error("Clear unreviewed error:", e);
    }
  };

  const unreviewedCount = observations.filter(
    (o) => o.review_status === "unreviewed"
  ).length;

  return (
    <div className="rounded-xl border border-[#DCDDD5] bg-white flex flex-col overflow-hidden shadow-xs">
      {/* Panel Header */}
      <div className="px-4 py-2.5 border-b border-[#DCDDD5] flex items-center justify-between bg-white">
        <div className="flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-[#285B49]" />
          <h2 className="text-sm font-semibold tracking-tight text-[#252923]">
            Survivor Observation &amp; Identification
          </h2>
          {unreviewedCount > 0 ? (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#B77927]/10 text-[#B77927] border border-[#B77927]/30 font-semibold">
              {unreviewedCount} PENDING REVIEW
            </span>
          ) : (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#ECEBE5] text-[#70746D] border border-[#DCDDD5]">
              STANDBY
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Enroll Face to DB Button */}
          <button
            onClick={() => {
              setEnrollName("");
              setShowEnrollModal(true);
            }}
            className="px-2.5 py-1 rounded-md bg-[#ECEBE5] hover:bg-[#e2e0d8] text-[#252923] border border-[#DCDDD5] text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
            title="Register new person or face into database"
          >
            <UserPlus className="w-3.5 h-3.5 text-[#285B49]" />
            <span className="hidden sm:inline">Enroll Face</span>
          </button>

          {/* Trigger Scan Button */}
          <button
            onClick={handleTriggerDetection}
            disabled={isTriggering}
            className="px-3 py-1 rounded-md bg-[#285B49] hover:bg-[#1e4638] text-white text-xs font-medium transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            title="Scan active camera frame and trigger detection"
          >
            {isTriggering ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-white/90" />
            )}
            <span>Detect Person</span>
          </button>
        </div>
      </div>

      {observations.length === 0 ? (
        <div className="p-8 text-center text-xs text-[#70746D] space-y-2">
          <Search className="w-8 h-8 mx-auto text-[#70746D] mb-2" />
          <p className="font-medium text-[#252923]">No person observations recorded yet.</p>
          <p className="text-[11px] text-[#70746D]">
            When a human is detected in the video stream, observation evidence and facial verification will appear here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col">
          {/* Observation Queue Strip */}
          <div className="px-4 py-2 border-b border-[#DCDDD5] bg-[#F5F4F0] flex items-center gap-2 overflow-x-auto">
            <span className="text-[10px] font-mono text-[#70746D] shrink-0 font-medium">
              QUEUE:
            </span>
            {observations.map((obs) => (
              <button
                key={obs.id}
                onClick={() => {
                  setSelectedObsId(obs.id);
                  if (onSelectObservationOnMap) onSelectObservationOnMap(obs);
                }}
                className={`px-2 py-0.5 rounded text-[11px] font-mono border transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  activeObs?.id === obs.id
                    ? "bg-white border-[#285B49] text-[#285B49] font-medium shadow-xs"
                    : "bg-transparent border-[#DCDDD5] text-[#70746D] hover:text-[#252923]"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    obs.review_status === "confirmed"
                      ? "bg-[#285B49]"
                      : obs.review_status === "rejected"
                      ? "bg-[#B4493F]"
                      : "bg-[#B77927]"
                  }`}
                />
                <span>{obs.obs_code}</span>
              </button>
            ))}

            {unreviewedCount > 0 && (
              <button
                onClick={handleClearUnreviewed}
                className="ml-auto px-2 py-0.5 rounded bg-[#B4493F]/10 hover:bg-[#B4493F]/20 text-[#B4493F] border border-[#B4493F]/30 text-[10px] font-mono shrink-0 transition cursor-pointer flex items-center gap-1"
                title="Clear unreviewed observations"
              >
                <Trash2 className="w-3 h-3 text-[#B4493F]" />
                <span>PURGE UNREVIEWED ({unreviewedCount})</span>
              </button>
            )}
          </div>

          {/* Active Observation Review Body */}
          {activeObs && (
            <div className="p-4 space-y-4">
              {/* Evidence Images & Candidate Match Dossier */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
                {/* Full Frame with Box Overlay (7 Cols) */}
                <div className="md:col-span-7 rounded-lg border border-[#DCDDD5] bg-[#121411] overflow-hidden relative flex flex-col justify-between">
                  <div className="px-2.5 py-1 bg-black/75 border-b border-white/10 text-[10px] font-mono text-white flex justify-between items-center z-10">
                    <span className="font-semibold text-[#ECEBE5]">EVIDENCE FRAME: {activeObs.obs_code}</span>
                    <span className="text-white/70">
                      MAP: ({activeObs.pos_x.toFixed(1)}m, {activeObs.pos_y.toFixed(1)}m)
                    </span>
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={api.getEvidenceUrl(activeObs.full_frame_path)}
                    alt="Optical Detection"
                    className="w-full aspect-[4/3] object-cover"
                  />
                  <div className="p-2 bg-black/75 border-t border-white/10 text-[10px] font-mono text-white/80 flex justify-between">
                    <span>EST. RANGE: {activeObs.distance_m.toFixed(1)}m</span>
                    <span>CONFIDENCE: {Math.round(activeObs.confidence * 100)}%</span>
                  </div>
                </div>

                {/* Candidate Match Dossier & Live Face Crop (5 Cols) */}
                <div className="md:col-span-5 rounded-lg border border-[#DCDDD5] bg-[#F5F4F0] p-3.5 flex flex-col justify-between space-y-3 text-xs">
                  <div>
                    {/* Header: Database Match Status */}
                    <div className="flex items-center justify-between pb-2 border-b border-[#DCDDD5]">
                      <span className="text-[10px] text-[#70746D] uppercase font-semibold">
                        Identity Verification
                      </span>
                      {isMatched ? (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-[#285B49]/10 text-[#285B49] border border-[#285B49]/30 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-[#285B49]" />
                          {Math.round((activeObs.match_similarity ?? 0.88) * 100)}% MATCH
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-[#B77927]/10 text-[#B77927] border border-[#B77927]/30 font-semibold flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 text-[#B77927]" />
                          UNREGISTERED
                        </span>
                      )}
                    </div>

                    {/* Side-by-Side: Live Sensor Crop vs Database Reference Photo */}
                    <div className="mt-2.5 grid grid-cols-2 gap-2">
                      {/* Live Crop */}
                      <div className="flex flex-col items-center p-2 rounded-md bg-white border border-[#DCDDD5]">
                        <span className="text-[9px] text-[#70746D] uppercase font-semibold mb-1">
                          Live Crop
                        </span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={api.getEvidenceUrl(activeObs.crop_path)}
                          alt="Live Face Crop"
                          className="w-16 h-16 rounded border border-[#DCDDD5] object-cover bg-[#ECEBE5]"
                        />
                      </div>

                      {/* DB Reference Photo */}
                      <div className="flex flex-col items-center p-2 rounded-md bg-white border border-[#DCDDD5]">
                        <span className="text-[9px] text-[#70746D] uppercase font-semibold mb-1">
                          Database Record
                        </span>
                        {isMatched && activeObs.person_photo ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={api.getEvidenceUrl(activeObs.person_photo)}
                            alt="Reference"
                            className="w-16 h-16 rounded border border-[#DCDDD5] object-cover bg-[#ECEBE5]"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded border border-dashed border-[#DCDDD5] flex flex-col items-center justify-center text-[9px] text-[#70746D] text-center px-1">
                            No Reference
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Subject Details */}
                    <div className="mt-3">
                      {isMatched ? (
                        <div>
                          <h4 className="font-semibold text-[#252923] text-sm">
                            {activeObs.person_name}
                          </h4>
                          <span className="text-[11px] text-[#285B49] font-medium">
                            {activeObs.person_category || "Emergency Responder"}
                          </span>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <h4 className="font-semibold text-[#252923] text-sm">
                            Unidentified Human Subject
                          </h4>
                          <p className="text-[11px] text-[#70746D] leading-tight">
                            Optical sensor located a human subject. No pre-existing profile in local database.
                          </p>
                          <button
                            onClick={() => {
                              setEnrollName("");
                              setShowEnrollModal(true);
                            }}
                            className="mt-1 w-full py-1.5 px-2 rounded-md bg-white hover:bg-[#ECEBE5] text-[#252923] border border-[#DCDDD5] text-[11px] font-medium flex items-center justify-center gap-1.5 cursor-pointer transition"
                          >
                            <UserPlus className="w-3.5 h-3.5 text-[#285B49]" />
                            <span>Enroll Face into Database</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Medical / Dossier Info */}
                    {isMatched && (
                      <div className="mt-2.5 space-y-1 text-[11px] text-[#252923] bg-white p-2.5 rounded-md border border-[#DCDDD5]">
                        <div>
                          <span className="text-[#70746D]">Last Reported:</span>{" "}
                          {activeObs.reported_last_seen || "Command Post Alpha"}
                        </div>
                        <div>
                          <span className="text-[#70746D]">Medical Alert:</span>{" "}
                          <span className="text-[#B4493F] font-medium">
                            {activeObs.medical_alerts || "None documented."}
                          </span>
                        </div>
                        {activeObs.incident_code && (
                          <div>
                            <span className="text-[#70746D]">Active Incident:</span>{" "}
                            <span className="text-[#285B49] font-medium">
                              {activeObs.incident_code}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Review Status Indicator */}
                  <div className="pt-2 border-t border-[#DCDDD5] flex items-center justify-between">
                    <span className="text-[10px] text-[#70746D] font-mono">REVIEW STATE:</span>
                    <span
                      className={`text-[11px] font-semibold uppercase ${
                        activeObs.review_status === "confirmed"
                          ? "text-[#285B49]"
                          : activeObs.review_status === "rejected"
                          ? "text-[#B4493F]"
                          : "text-[#B77927]"
                      }`}
                    >
                      {activeObs.review_status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Review Buttons Bar */}
              <div className="pt-2 border-t border-[#DCDDD5] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleReview("confirmed")}
                    disabled={isSubmitting || activeObs.review_status === "confirmed"}
                    className="px-3.5 py-1.5 rounded-lg bg-[#285B49] hover:bg-[#1e4638] text-white text-xs font-medium transition cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Confirm Human Finding</span>
                  </button>

                  <button
                    onClick={() => handleReview("rejected", "False positive")}
                    disabled={isSubmitting || activeObs.review_status === "rejected"}
                    className="px-3.5 py-1.5 rounded-lg bg-[#ECEBE5] hover:bg-[#B4493F]/10 hover:text-[#B4493F] text-[#70746D] border border-[#DCDDD5] text-xs font-medium transition cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </button>

                  <button
                    onClick={() => handleReview("uncertain", "Needs re-observation")}
                    disabled={isSubmitting || activeObs.review_status === "uncertain"}
                    className="px-3.5 py-1.5 rounded-lg bg-[#B77927] hover:bg-[#9c661f] text-white text-xs font-medium transition cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                    <span>Uncertain</span>
                  </button>
                </div>

                {activeObs.incident_code && (
                  <a
                    href={api.getIncidentReportUrl(activeObs.incident_code)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-1.5 rounded-lg border border-[#DCDDD5] bg-white hover:bg-[#ECEBE5] text-[#252923] text-xs font-medium flex items-center gap-1.5 transition"
                  >
                    <Printer className="w-3.5 h-3.5 text-[#285B49]" />
                    <span>View 1-Page Incident Brief</span>
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Enroll Person to Database Modal */}
      {showEnrollModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white border border-[#DCDDD5] rounded-xl p-5 shadow-xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-[#DCDDD5] pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-[#285B49]" />
                <h3 className="font-semibold text-sm text-[#252923]">
                  Register Person in Rescue Database
                </h3>
              </div>
              <button
                onClick={() => setShowEnrollModal(false)}
                className="text-[#70746D] hover:text-[#252923] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {enrollSuccessMessage ? (
              <div className="py-6 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-[#285B49] mx-auto" />
                <p className="font-semibold text-[#252923] text-sm">{enrollSuccessMessage}</p>
                <p className="text-[11px] text-[#70746D]">
                  Perception engine cache updated. Live camera will recognize this subject upon encounter.
                </p>
              </div>
            ) : (
              <form onSubmit={handleEnrollSubmit} className="space-y-3">
                <div>
                  <label className="text-[#70746D] text-[11px] font-medium block mb-1">
                    FULL NAME (REQUIRED):
                  </label>
                  <input
                    type="text"
                    required
                    value={enrollName}
                    onChange={(e) => setEnrollName(e.target.value)}
                    placeholder="e.g. Aprampreet Singh"
                    className="w-full bg-[#F5F4F0] border border-[#DCDDD5] rounded-md p-2 text-[#252923] text-xs focus:border-[#285B49] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-[#70746D] text-[11px] font-medium block mb-1">
                    PERSON CATEGORY:
                  </label>
                  <select
                    value={enrollCategory}
                    onChange={(e) => setEnrollCategory(e.target.value)}
                    className="w-full bg-[#F5F4F0] border border-[#DCDDD5] rounded-md p-2 text-[#252923] text-xs"
                  >
                    <option value="Operator / Team Lead">Operator / Team Lead</option>
                    <option value="Emergency Responder">Emergency Responder (SAR)</option>
                    <option value="Reported Missing Civilian">Reported Missing Civilian</option>
                    <option value="VIP / Personnel">VIP / Personnel</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[#70746D] text-[10px] font-medium block mb-1">
                      BADGE / ID:
                    </label>
                    <input
                      type="text"
                      value={enrollBadge}
                      onChange={(e) => setEnrollBadge(e.target.value)}
                      placeholder="e.g. OP-01"
                      className="w-full bg-[#F5F4F0] border border-[#DCDDD5] rounded-md p-1.5 text-[#252923] text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[#70746D] text-[10px] font-medium block mb-1">
                      MEDICAL / NOTES:
                    </label>
                    <input
                      type="text"
                      value={enrollMedical}
                      onChange={(e) => setEnrollMedical(e.target.value)}
                      placeholder="e.g. Inhaler / No allergies"
                      className="w-full bg-[#F5F4F0] border border-[#DCDDD5] rounded-md p-1.5 text-[#252923] text-xs"
                    />
                  </div>
                </div>

                {/* Photo Source Selection */}
                <div>
                  <label className="text-[#70746D] text-[11px] font-medium block mb-1">
                    REFERENCE PHOTO SOURCE:
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setEnrollSource("camera")}
                      className={`p-2 rounded-md border text-xs flex items-center justify-center gap-1.5 cursor-pointer ${
                        enrollSource === "camera"
                          ? "bg-white border-[#285B49] text-[#285B49] font-medium shadow-xs"
                          : "bg-[#F5F4F0] border-[#DCDDD5] text-[#70746D]"
                      }`}
                    >
                      <Camera className="w-3.5 h-3.5 text-[#285B49]" />
                      <span>Live Camera Snapshot</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEnrollSource("upload")}
                      className={`p-2 rounded-md border text-xs flex items-center justify-center gap-1.5 cursor-pointer ${
                        enrollSource === "upload"
                          ? "bg-white border-[#285B49] text-[#285B49] font-medium shadow-xs"
                          : "bg-[#F5F4F0] border-[#DCDDD5] text-[#70746D]"
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5 text-[#285B49]" />
                      <span>Upload File</span>
                    </button>
                  </div>
                </div>

                {enrollSource === "camera" ? (
                  <p className="text-[11px] text-[#70746D] bg-[#F5F4F0] p-2 rounded-md border border-[#DCDDD5]">
                    System captures current live camera frame and stores the face embedding as verification template.
                  </p>
                ) : (
                  <div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="w-full text-[#70746D] text-xs file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:bg-[#ECEBE5] file:text-[#252923]"
                    />
                    {enrollBase64 && (
                      <div className="mt-2 flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={enrollBase64}
                          alt="Preview"
                          className="w-12 h-12 rounded-md object-cover border border-[#DCDDD5]"
                        />
                        <span className="text-[10px] text-[#285B49] font-medium">Photo loaded</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#DCDDD5]">
                  <button
                    type="button"
                    onClick={() => setShowEnrollModal(false)}
                    className="px-3 py-1.5 rounded-md border border-[#DCDDD5] bg-[#ECEBE5] text-[#70746D] hover:text-[#252923] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isEnrolling || !enrollName.trim()}
                    className="px-4 py-1.5 rounded-md bg-[#285B49] hover:bg-[#1e4638] text-white font-medium cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {isEnrolling ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <UserPlus className="w-3.5 h-3.5" />
                    )}
                    <span>Enroll into Database</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Incident Dispatch Modal */}
      {showIncidentModal && activeObs && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-white border border-[#DCDDD5] rounded-xl p-5 shadow-xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-[#DCDDD5] pb-3">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-[#285B49]" />
                <h3 className="font-semibold text-sm text-[#252923]">
                  Dispatch Rescue Incident
                </h3>
              </div>
              <span className="text-[11px] text-[#285B49] font-mono font-medium">
                REF: {activeObs.obs_code}
              </span>
            </div>

            {createdIncident ? (
              <div className="space-y-3 py-2 text-center">
                <div className="w-10 h-10 rounded-full bg-[#285B49]/10 border border-[#285B49]/30 text-[#285B49] flex items-center justify-center mx-auto">
                  <Check className="w-5 h-5" />
                </div>
                <h4 className="font-semibold text-base text-[#252923]">
                  INCIDENT {createdIncident.incident_code} DISPATCHED!
                </h4>
                <p className="text-[#70746D] text-xs">
                  Assigned to <strong>{createdIncident.assigned_team}</strong> with priority{" "}
                  <strong>{createdIncident.priority}</strong>.
                </p>

                <div className="flex items-center justify-center gap-3 pt-3">
                  <a
                    href={api.getIncidentReportUrl(createdIncident.incident_code)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-md bg-[#285B49] hover:bg-[#1e4638] text-white font-medium transition flex items-center gap-2 cursor-pointer shadow-xs"
                  >
                    <Printer className="w-4 h-4" />
                    <span>Open 1-Page Incident Brief</span>
                  </a>
                  <button
                    onClick={() => {
                      setShowIncidentModal(false);
                      setCreatedIncident(null);
                    }}
                    className="px-3 py-2 rounded-md bg-[#ECEBE5] hover:bg-[#e2e0d8] text-[#252923] border border-[#DCDDD5] transition cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[#252923] text-xs leading-relaxed">
                  You are confirming that a person is visible in observation{" "}
                  <strong>{activeObs.obs_code}</strong>. This registers an operational rescue incident.
                </p>

                {/* Priority Selection */}
                <div>
                  <label className="text-[#70746D] text-[11px] font-medium block mb-1">
                    INCIDENT PRIORITY:
                  </label>
                  <select
                    value={incidentPriority}
                    onChange={(e) => setIncidentPriority(e.target.value)}
                    className="w-full bg-[#F5F4F0] border border-[#DCDDD5] rounded-md p-2 text-[#252923] text-xs"
                  >
                    <option value="P1 - Immediate">P1 - Immediate (Life-Threatening)</option>
                    <option value="P2 - Urgent">P2 - Urgent (Injured / Trapped)</option>
                    <option value="P3 - Routine">P3 - Routine (Safe / Monitored)</option>
                  </select>
                </div>

                {/* Team Selection */}
                <div>
                  <label className="text-[#70746D] text-[11px] font-medium block mb-1">
                    ASSIGN DISPATCH TEAM:
                  </label>
                  <select
                    value={incidentTeam}
                    onChange={(e) => setIncidentTeam(e.target.value)}
                    className="w-full bg-[#F5F4F0] border border-[#DCDDD5] rounded-md p-2 text-[#252923] text-xs"
                  >
                    <option value="Team Alpha (Search & Rescue)">
                      Team Alpha (Search &amp; Rescue)
                    </option>
                    <option value="Team Bravo (Heavy Debris Extrication)">
                      Team Bravo (Heavy Debris Extrication)
                    </option>
                    <option value="Medical Evac Unit 1">Medical Evac Unit 1</option>
                  </select>
                </div>

                {/* Operator Note */}
                <div>
                  <label className="text-[#70746D] text-[11px] font-medium block mb-1">
                    OPERATOR SUMMARY NOTE:
                  </label>
                  <textarea
                    rows={3}
                    value={incidentSummary}
                    onChange={(e) => setIncidentSummary(e.target.value)}
                    placeholder="e.g. Survivor visible near obstacle, responsive to voice command."
                    className="w-full bg-[#F5F4F0] border border-[#DCDDD5] rounded-md p-2 text-[#252923] text-xs placeholder-[#70746D]"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    onClick={() => setShowIncidentModal(false)}
                    className="px-3 py-1.5 rounded-md border border-[#DCDDD5] bg-[#ECEBE5] text-[#70746D] hover:text-[#252923] transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmAndDispatch}
                    disabled={isSubmitting}
                    className="px-4 py-1.5 rounded-md bg-[#285B49] hover:bg-[#1e4638] text-white font-medium transition cursor-pointer flex items-center gap-1.5"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                    <span>Dispatch Incident</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
