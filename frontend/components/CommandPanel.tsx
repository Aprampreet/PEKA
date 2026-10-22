"use client";

import React, { useState } from "react";
import { Play, Pause, CornerDownLeft, ShieldAlert, CheckCircle2, AlertCircle, AlertTriangle, Loader2 } from "lucide-react";
import { AllowedCommand, CommandResponse } from "../lib/types";
import { api } from "../lib/api";

interface CommandPanelProps {
  isLiveMode: boolean;
  onCommandDispatched: (cmd: AllowedCommand, res: CommandResponse) => void;
}

export const CommandPanel: React.FC<CommandPanelProps> = ({
  isLiveMode,
  onCommandDispatched,
}) => {
  const [pendingCommand, setPendingCommand] = useState<AllowedCommand | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [lastResponse, setLastResponse] = useState<CommandResponse | null>(null);
  const [confirmModalCommand, setConfirmModalCommand] = useState<AllowedCommand | null>(null);

  const commandLabels: Record<AllowedCommand, { title: string; desc: string; color: string; consequential: boolean }> = {
    start_patrol: {
      title: "START PATROL",
      desc: "Initiates autonomous path scanning on active ROS 2 navigation stack",
      color: "emerald",
      consequential: true,
    },
    pause_patrol: {
      title: "PAUSE PATROL",
      desc: "Issues software motion halt to patrol scheduler (Not an E-Stop)",
      color: "amber",
      consequential: false,
    },
    return_to_base: {
      title: "RETURN TO BASE",
      desc: "Commands robot to calculate return trajectory to designated staging home",
      color: "cyan",
      consequential: true,
    },
  };

  const initiateCommand = (cmd: AllowedCommand) => {
    if (commandLabels[cmd].consequential) {
      setConfirmModalCommand(cmd);
    } else {
      executeCommand(cmd);
    }
  };

  const executeCommand = async (cmd: AllowedCommand) => {
    setConfirmModalCommand(null);
    setIsSubmitting(true);
    setPendingCommand(cmd);

    try {
      const resp = await api.sendCommand(cmd);
      setLastResponse(resp);
      onCommandDispatched(cmd, resp);
    } finally {
      setIsSubmitting(false);
      setPendingCommand(null);
    }
  };

  return (
    <div className="rounded-lg border border-slate-800 bg-[#0c1220] flex flex-col overflow-hidden shadow-lg">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-semibold tracking-wide text-slate-200 uppercase font-mono">
            Mission Command Controls
          </h2>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
          ROS 2 PUBLISHER /api/robot/command
        </span>
      </div>

      {/* Safety Notice Banner */}
      <div className="px-4 py-2 bg-amber-950/30 border-b border-amber-900/40 text-[11px] font-mono text-amber-300 flex items-start gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <span>
            API confirmation validates <strong>topic publication</strong> to the ROS bridge, not physical mechanical completion.
          </span>
          <div className="text-amber-400/80 text-[10px] mt-0.5">
            Software pause controls do NOT replace physical E-Stop. In emergency, trigger hardware E-Stop immediately.
          </div>
        </div>
      </div>

      {/* Command Buttons Grid */}
      <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* 1. START PATROL */}
        <button
          onClick={() => initiateCommand("start_patrol")}
          disabled={isSubmitting}
          className="p-3.5 rounded-lg border border-emerald-600/40 bg-emerald-950/20 hover:bg-emerald-950/40 text-left transition active:scale-[0.98] disabled:opacity-50 cursor-pointer flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono font-bold text-xs text-emerald-300 tracking-wider">
              START PATROL
            </span>
            <div className="w-6 h-6 rounded bg-emerald-900/50 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition">
              {pendingCommand === "start_patrol" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
            </div>
          </div>
          <p className="text-[11px] text-slate-400 font-mono">
            Dispatches autonomous search trajectory to ROS 2 navigation.
          </p>
        </button>

        {/* 2. PAUSE PATROL */}
        <button
          onClick={() => initiateCommand("pause_patrol")}
          disabled={isSubmitting}
          className="p-3.5 rounded-lg border border-amber-600/40 bg-amber-950/20 hover:bg-amber-950/40 text-left transition active:scale-[0.98] disabled:opacity-50 cursor-pointer flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono font-bold text-xs text-amber-300 tracking-wider">
              PAUSE PATROL
            </span>
            <div className="w-6 h-6 rounded bg-amber-900/50 flex items-center justify-center text-amber-400 group-hover:scale-110 transition">
              {pendingCommand === "pause_patrol" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Pause className="w-3.5 h-3.5" />
              )}
            </div>
          </div>
          <p className="text-[11px] text-slate-400 font-mono">
            Soft motion pause command. (Not a replacement for physical E-Stop).
          </p>
        </button>

        {/* 3. RETURN TO BASE */}
        <button
          onClick={() => initiateCommand("return_to_base")}
          disabled={isSubmitting}
          className="p-3.5 rounded-lg border border-cyan-600/40 bg-cyan-950/20 hover:bg-cyan-950/40 text-left transition active:scale-[0.98] disabled:opacity-50 cursor-pointer flex flex-col justify-between group"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono font-bold text-xs text-cyan-300 tracking-wider">
              RETURN TO BASE
            </span>
            <div className="w-6 h-6 rounded bg-cyan-900/50 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition">
              {pendingCommand === "return_to_base" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CornerDownLeft className="w-3.5 h-3.5" />
              )}
            </div>
          </div>
          <p className="text-[11px] text-slate-400 font-mono">
            Aborts patrol and directs robot back to primary mission waypoint.
          </p>
        </button>
      </div>

      {/* Outcome Feedback Bar */}
      {lastResponse && (
        <div className="px-4 py-2.5 bg-slate-900/80 border-t border-slate-800 font-mono text-xs flex items-start gap-2.5">
          {lastResponse.status === "published_to_ros" ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : lastResponse.status === "simulated" ? (
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-200">
                COMMAND: [{lastResponse.command.toUpperCase()}] →{" "}
                <span
                  className={
                    lastResponse.status === "published_to_ros"
                      ? "text-emerald-400"
                      : lastResponse.status === "simulated"
                      ? "text-amber-400"
                      : "text-red-400"
                  }
                >
                  {lastResponse.status.toUpperCase()}
                </span>
              </span>
              <span className="text-[10px] text-slate-400">
                {new Date(lastResponse.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <p className="text-[11px] text-slate-300">{lastResponse.detail}</p>
            <p className="text-[10px] text-slate-500 italic">{lastResponse.disclaimer}</p>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModalCommand && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#0c1220] border border-amber-600/50 rounded-lg p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded bg-amber-950/60 border border-amber-700 text-amber-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-mono font-bold text-sm text-slate-100 uppercase">
                  Confirm Command Dispatch
                </h3>
                <span className="text-[11px] font-mono text-amber-300">
                  CONSEQUENTIAL ROBOT ACTION
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-300 font-mono leading-relaxed">
              You are about to publish <strong>{confirmModalCommand.toUpperCase()}</strong> to the robot&apos;s ROS 2 bridge.
            </p>

            <div className="bg-slate-900/90 p-3 rounded border border-slate-800 text-[11px] font-mono text-slate-400 space-y-1">
              <div>Command Payload: <code className="text-cyan-300">{JSON.stringify({ command: confirmModalCommand })}</code></div>
              <div>Operating Mode: <span className={isLiveMode ? "text-emerald-400" : "text-amber-400"}>{isLiveMode ? "LIVE HARDWARE" : "STANDBY / SIMULATION"}</span></div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmModalCommand(null)}
                className="px-3 py-1.5 rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono transition cursor-pointer"
              >
                CANCEL
              </button>
              <button
                onClick={() => executeCommand(confirmModalCommand)}
                className="px-4 py-1.5 rounded border border-amber-600 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs font-mono transition cursor-pointer"
              >
                CONFIRM &amp; DISPATCH
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
