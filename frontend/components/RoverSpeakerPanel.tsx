"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Volume2,
  VolumeX,
  Sparkles,
  Radio,
  Send,
  Languages,
  CheckCircle2,
  Clock,
  Laptop,
  Bot,
  AlertCircle,
  HelpCircle,
  ShieldAlert,
} from "lucide-react";
import { api } from "../lib/api";
import { SpeakerStatus, BroadcastResult } from "../lib/types";

interface RoverSpeakerPanelProps {
  selectedPersonName?: string | null;
  selectedDistanceM?: number | null;
  currentSector?: string;
}

export const RoverSpeakerPanel: React.FC<RoverSpeakerPanelProps> = ({
  selectedPersonName,
  selectedDistanceM,
  currentSector = "Sector 3",
}) => {
  const [status, setStatus] = useState<SpeakerStatus | null>(null);
  const [messageText, setMessageText] = useState<string>(
    "PIPER Rescue Robot has located you. Search and rescue personnel are inbound. Stay calm and remain where you are."
  );
  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [playLocal, setPlayLocal] = useState<boolean>(false);
  const [sendRover, setSendRover] = useState<boolean>(true);
  const [isBroadcasting, setIsBroadcasting] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [lastResult, setLastResult] = useState<BroadcastResult | null>(null);

  // Tactical preset messages
  const PRESETS = [
    {
      label: "Rescue Inbound (EN)",
      lang: "en" as const,
      text: "PIPER Rescue Robot has located you. Emergency medical teams are inbound to your coordinates. Stay calm and do not move.",
    },
    {
      label: "घबराइए मत (HI)",
      lang: "hi" as const,
      text: "घबराइए मत! डिजास्टर रेस्क्यू टीम ने आपको ढूंढ लिया है। मदद आ रही है, कृपया अपनी जगह पर सुरक्षित रहें।",
    },
    {
      label: "Hazard Alert (EN)",
      lang: "en" as const,
      text: "Caution! Structural instability and water hazard detected in this corridor. Please remain where you are.",
    },
    {
      label: "Medical Check (HI)",
      lang: "hi" as const,
      text: "रेस्क्यू रोबोट पाइपर आपके पास है। अगर आप बोल सकते हैं या हाथ हिला सकते हैं, तो हमें संकेत दें।",
    },
  ];

  // Fetch status periodically
  const fetchStatus = useCallback(async () => {
    const res = await api.getSpeakerStatus();
    if (res) setStatus(res);
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  // Toggle autonomous reassurance
  const handleToggleAuto = async () => {
    if (!status) return;
    const nextVal = !status.auto_broadcast_enabled;
    const res = await api.toggleAutoSpeaker(nextVal);
    setStatus((prev) => (prev ? { ...prev, auto_broadcast_enabled: res } : null));
  };

  // Generate AI contextual reassurance
  const handleGenerateAI = async () => {
    setIsGenerating(true);
    try {
      const res = await api.generateAIReassurance(
        selectedPersonName || null,
        selectedDistanceM || 2.5,
        currentSector,
        language
      );
      if (res?.generated_text) {
        setMessageText(res.generated_text);
      }
    } catch (err) {
      console.error("Failed to generate AI reassurance:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  // Broadcast to physical rover speaker
  const handleBroadcast = async () => {
    if (!messageText.trim()) return;
    setIsBroadcasting(true);
    try {
      const res = await api.broadcastToSpeaker(
        messageText.trim(),
        language,
        playLocal,
        sendRover
      );
      if (res) {
        setLastResult(res);
        fetchStatus();
      }
    } catch (err) {
      console.error("Broadcast failed:", err);
    } finally {
      setIsBroadcasting(false);
    }
  };

  return (
    <div className="rounded-md border border-[#D8D9D1] bg-white p-4 space-y-4 shadow-xs">
      {/* 1. Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D8D9D1] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-md bg-[#285B49]/10 text-[#285B49] border border-[#285B49]/20">
            <Volume2 className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-[#242820]">
                Rover PA Speaker &amp; AI Reassurance
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-[#EAE9E2] border border-[#D8D9D1] text-[#242820]">
                ALSA 16-BIT PCM
              </span>
            </div>
            <p className="text-xs text-[#6C7068]">
              Autonomous &amp; manual voice broadcast to victims through rover loudspeaker
            </p>
          </div>
        </div>

        {/* Auto Broadcast Toggle Switch */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleToggleAuto}
            className={`px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-all flex items-center gap-2 cursor-pointer border ${
              status?.auto_broadcast_enabled
                ? "bg-emerald-50 border-emerald-300 text-emerald-800 shadow-xs"
                : "bg-zinc-100 border-zinc-300 text-zinc-600"
            }`}
            title="When ON, PEKA automatically announces reassurance whenever a human face is spotted in live video"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                status?.auto_broadcast_enabled
                  ? "bg-emerald-500 animate-ping"
                  : "bg-zinc-400"
              }`}
            />
            <span>
              Auto Reassurance:{" "}
              <strong>{status?.auto_broadcast_enabled ? "ACTIVE" : "OFF"}</strong>
            </span>
          </button>
        </div>
      </div>

      {/* 2. Active Context & AI Generator Prompt Bar */}
      <div className="rounded-md bg-[#F3F2ED] border border-[#D8D9D1] p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[#6C7068] font-mono">TARGET CONTEXT:</span>
          <span className="font-semibold text-[#242820] bg-white px-2 py-0.5 rounded border border-[#D8D9D1]">
            {selectedPersonName ? `ID: ${selectedPersonName}` : "Unregistered Survivor"}
          </span>
          {selectedDistanceM && (
            <span className="text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded border border-cyan-200 font-mono">
              ~{selectedDistanceM.toFixed(1)}m
            </span>
          )}
          <span className="text-zinc-600 bg-white px-2 py-0.5 rounded border border-[#D8D9D1] font-mono">
            {currentSector}
          </span>
        </div>

        {/* Generate AI Button */}
        <button
          onClick={handleGenerateAI}
          disabled={isGenerating}
          className="px-3 py-1.5 rounded bg-[#285B49] text-white font-medium hover:bg-[#20493a] transition-all flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
          <span>{isGenerating ? "Generating..." : "✨ AI Reassure"}</span>
        </button>
      </div>

      {/* 3. Text Announcement Studio */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <label className="font-medium text-[#242820] flex items-center gap-1.5">
            <span>Announcement Message</span>
            <span className="text-[11px] text-[#6C7068] font-normal">
              (Will be synthesized to natural speech)
            </span>
          </label>

          {/* Language Selector */}
          <div className="flex items-center gap-1 bg-[#EAE9E2] p-0.5 rounded border border-[#D8D9D1]">
            <button
              onClick={() => setLanguage("en")}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                language === "en"
                  ? "bg-white text-[#285B49] shadow-xs font-semibold"
                  : "text-[#6C7068] hover:text-[#242820]"
              }`}
            >
              🇬🇧 English
            </button>
            <button
              onClick={() => setLanguage("hi")}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
                language === "hi"
                  ? "bg-white text-[#285B49] shadow-xs font-semibold"
                  : "text-[#6C7068] hover:text-[#242820]"
              }`}
            >
              🇮🇳 हिन्दी
            </button>
          </div>
        </div>

        <textarea
          rows={3}
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          className="w-full text-xs p-3 rounded-md border border-[#D8D9D1] bg-white text-[#242820] focus:outline-none focus:ring-1 focus:ring-[#285B49] focus:border-[#285B49] font-sans leading-relaxed resize-none"
          placeholder="Type announcement to broadcast through rover loudspeaker..."
        />
      </div>

      {/* 4. One-Click Tactical Quick Presets */}
      <div className="space-y-1.5">
        <span className="text-[11px] font-mono text-[#6C7068] uppercase tracking-wider">
          Quick Tactical Presets:
        </span>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p, idx) => (
            <button
              key={idx}
              onClick={() => {
                setMessageText(p.text);
                setLanguage(p.lang);
              }}
              className="px-2.5 py-1 rounded text-xs bg-[#F3F2ED] hover:bg-[#EAE9E2] border border-[#D8D9D1] text-[#242820] transition cursor-pointer text-left"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* 5. Audio Destinations & Trigger Action */}
      <div className="pt-2 border-t border-[#D8D9D1] flex flex-wrap items-center justify-between gap-3">
        {/* Destination Toggles */}
        <div className="flex items-center gap-4 text-xs text-[#242820]">
          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={sendRover}
              onChange={(e) => setSendRover(e.target.checked)}
              className="rounded text-[#285B49] focus:ring-[#285B49]"
            />
            <Bot className="w-3.5 h-3.5 text-[#285B49]" />
            <span>Physical Rover Speaker</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={playLocal}
              onChange={(e) => setPlayLocal(e.target.checked)}
              className="rounded text-[#285B49] focus:ring-[#285B49]"
            />
            <Laptop className="w-3.5 h-3.5 text-zinc-600" />
            <span>Laptop Monitor</span>
          </label>
        </div>

        {/* Big Tactical Broadcast Button */}
        <button
          onClick={handleBroadcast}
          disabled={isBroadcasting || !messageText.trim()}
          className="px-4 py-2 rounded-md bg-[#285B49] hover:bg-[#20493a] text-white text-xs font-semibold tracking-wide transition shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <Send className={`w-3.5 h-3.5 ${isBroadcasting ? "animate-spin" : ""}`} />
          <span>{isBroadcasting ? "Transmitting Audio..." : "📢 Broadcast to Rover"}</span>
        </button>
      </div>

      {/* 6. Last Spoken Feedback Bar */}
      {(lastResult || status?.last_broadcast_text) && (
        <div className="rounded-md bg-emerald-50/70 border border-emerald-200 p-2.5 text-xs text-emerald-900 flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="space-y-0.5 leading-tight">
            <div className="font-semibold flex items-center gap-2">
              <span>Last Broadcasted Message</span>
              {status?.cooldown_remaining_sec && status.cooldown_remaining_sec > 0 ? (
                <span className="text-[10px] font-mono text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-300">
                  Cooldown: {status.cooldown_remaining_sec}s
                </span>
              ) : null}
            </div>
            <p className="italic text-emerald-800 text-[11px]">
              &ldquo;{lastResult?.message_text || status?.last_broadcast_text}&rdquo;
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
