"use client";

import React, { useState } from "react";
import {
  Gamepad2,
  Play,
  Pause,
  Home,
  ArrowRight,
  Info,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { AllowedCommand, CommandResponse } from "../lib/types";
import { api } from "../lib/api";

interface RobotControlsProps {
  isLiveMode?: boolean;
  onCommandDispatched?: (cmd: AllowedCommand, res: CommandResponse) => void;
  activeCommand?: string | null;
}

export const RobotControls: React.FC<RobotControlsProps> = ({
  isLiveMode = true,
  onCommandDispatched,
  activeCommand,
}) => {
  const [submittingCmd, setSubmittingCmd] = useState<AllowedCommand | null>(null);
  const [confirmCmd, setConfirmCmd] = useState<AllowedCommand | null>(null);
  const [lastResponse, setLastResponse] = useState<{
    cmd: AllowedCommand;
    res: CommandResponse;
  } | null>(null);

  const commandConfig: Record<
    AllowedCommand,
    {
      title: string;
      desc: string;
      icon: React.ComponentType<{ className?: string }>;
      bgClass: string;
      hoverClass: string;
      textClass: string;
      requiresConfirm: boolean;
      confirmPrompt: string;
    }
  > = {
    start_patrol: {
      title: "Start Patrol",
      desc: "Begin autonomous search",
      icon: Play,
      bgClass: "bg-[#285B49]",
      hoverClass: "hover:bg-[#1f4739]",
      textClass: "text-white",
      requiresConfirm: true,
      confirmPrompt:
        "Confirm START PATROL? This commands the robot to begin autonomous trajectory traversal through the designated sector.",
    },
    pause_patrol: {
      title: "Pause Patrol",
      desc: "Temporarily halt movement",
      icon: Pause,
      bgClass: "bg-[#B77927]",
      hoverClass: "hover:bg-[#96631e]",
      textClass: "text-white",
      requiresConfirm: false,
      confirmPrompt: "",
    },
    return_to_base: {
      title: "Return to Base",
      desc: "Navigate back to staging point",
      icon: Home,
      bgClass: "bg-[#EAE9E2] border border-[#D8D9D1]",
      hoverClass: "hover:bg-[#dfded6]",
      textClass: "text-[#242820]",
      requiresConfirm: true,
      confirmPrompt:
        "Confirm RETURN TO BASE? The robot will abort current patrol and calculate a return trajectory to staging home.",
    },
  };

  const handleButtonClick = (cmd: AllowedCommand) => {
    if (commandConfig[cmd].requiresConfirm) {
      setConfirmCmd(cmd);
    } else {
      executeCommand(cmd);
    }
  };

  const executeCommand = async (cmd: AllowedCommand) => {
    setConfirmCmd(null);
    setSubmittingCmd(cmd);
    try {
      const res = await api.sendCommand(cmd);
      setLastResponse({ cmd, res });
      onCommandDispatched?.(cmd, res);
    } catch (e) {
      console.error("Command error:", e);
    } finally {
      setSubmittingCmd(null);
    }
  };

  return (
    <div className="rounded-md border border-[#D8D9D1] bg-white p-4 flex flex-col justify-between shadow-xs">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-7 h-7 rounded bg-[#EAE9E2] border border-[#D8D9D1] flex items-center justify-center text-[#285B49]">
            <Gamepad2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#242820] tracking-tight">
              Robot Controls
            </h3>
          </div>
        </div>
        <p className="text-xs text-[#6C7068] font-normal mb-3">
          Send high-level commands to the robot
        </p>

        {/* 3 Prominent Command Buttons */}
        <div className="space-y-2">
          {/* 1. Start Patrol Button */}
          <button
            onClick={() => handleButtonClick("start_patrol")}
            disabled={submittingCmd !== null}
            className={`w-full p-3.5 rounded-lg flex items-center justify-between transition cursor-pointer shadow-xs ${commandConfig.start_patrol.bgClass} ${commandConfig.start_patrol.hoverClass} ${commandConfig.start_patrol.textClass} disabled:opacity-50`}
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-md bg-white/20 flex items-center justify-center">
                {submittingCmd === "start_patrol" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current" />
                )}
              </div>
              <div className="text-left">
                <div className="text-xs font-semibold leading-tight">
                  Start Patrol
                </div>
                <div className="text-[11px] text-white/80 font-normal">
                  Begin autonomous search
                </div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-white/80" />
          </button>

          {/* 2. Pause Patrol Button */}
          <button
            onClick={() => handleButtonClick("pause_patrol")}
            disabled={submittingCmd !== null}
            className={`w-full p-3.5 rounded-lg flex items-center justify-between transition cursor-pointer shadow-xs ${commandConfig.pause_patrol.bgClass} ${commandConfig.pause_patrol.hoverClass} ${commandConfig.pause_patrol.textClass} disabled:opacity-50`}
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-md bg-white/20 flex items-center justify-center">
                {submittingCmd === "pause_patrol" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Pause className="w-3.5 h-3.5 fill-current" />
                )}
              </div>
              <div className="text-left">
                <div className="text-xs font-semibold leading-tight">
                  Pause Patrol
                </div>
                <div className="text-[11px] text-white/80 font-normal">
                  Temporarily halt movement
                </div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-white/80" />
          </button>

          {/* 3. Return to Base Button */}
          <button
            onClick={() => handleButtonClick("return_to_base")}
            disabled={submittingCmd !== null}
            className={`w-full p-3.5 rounded-md flex items-center justify-between transition cursor-pointer shadow-xs ${commandConfig.return_to_base.bgClass} ${commandConfig.return_to_base.hoverClass} ${commandConfig.return_to_base.textClass} disabled:opacity-50`}
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded bg-[#D8D9D1] flex items-center justify-center text-[#242820]">
                {submittingCmd === "return_to_base" ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#242820]" />
                ) : (
                  <Home className="w-3.5 h-3.5" />
                )}
              </div>
              <div className="text-left">
                <div className="text-xs font-semibold leading-tight text-[#242820]">
                  Return to Base
                </div>
                <div className="text-[11px] text-[#6C7068] font-normal">
                  Navigate back to staging point
                </div>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#6C7068]" />
          </button>
        </div>

        {/* Command Feedback Banner if recently published */}
        {lastResponse && (
          <div
            className={`mt-3 p-2.5 rounded border text-xs flex items-center justify-between ${
              lastResponse.res.status !== "failed"
                ? "bg-[#285B49]/10 border-[#285B49]/30 text-[#285B49]"
                : "bg-[#B4493F]/10 border-[#B4493F]/30 text-[#B4493F]"
            }`}
          >
            <div className="flex items-center gap-2">
              {lastResponse.res.status !== "failed" ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-[#285B49]" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-[#B4493F]" />
              )}
              <span className="font-mono text-[11px]">
                {lastResponse.res.detail}
              </span>
            </div>
            <span className="text-[10px] opacity-75 font-mono">
              ACKNOWLEDGED
            </span>
          </div>
        )}
      </div>

      {/* Safety Notice */}
      <div className="mt-4 pt-3 border-t border-[#D8D9D1] flex items-start gap-2 text-[11px] text-[#6C7068]">
        <Info className="w-4 h-4 text-[#6C7068] shrink-0 mt-0.5" />
        <p className="leading-snug">
          Commands publish directly to ROS 2. Software pause does not replace physical emergency stop hardware.
        </p>
      </div>

      {/* Confirmation Safety Modal */}
      {confirmCmd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-md bg-white border border-[#D8D9D1] p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded bg-[#B77927]/10 border border-[#B77927]/30 flex items-center justify-center text-[#B77927]">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[#242820]">
                  Confirm Motion Command
                </h3>
                <span className="text-[11px] text-[#B77927] font-mono">
                  ACTION REQUIRES OPERATOR CONFIRMATION
                </span>
              </div>
            </div>

            <p className="text-xs text-[#242820] leading-relaxed">
              {commandConfig[confirmCmd].confirmPrompt}
            </p>

            <div className="p-3 rounded bg-[#F3F2ED] border border-[#D8D9D1] text-[11px] text-[#6C7068] font-mono">
              Target endpoint: <span className="text-[#285B49] font-semibold">/api/robot/command</span>
              <br />
              Action payload: <span className="text-[#242820] font-semibold">{confirmCmd}</span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmCmd(null)}
                className="px-4 py-2 rounded text-xs font-medium text-[#6C7068] hover:text-[#242820] hover:bg-[#EAE9E2] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => executeCommand(confirmCmd)}
                className={`px-4 py-2 rounded text-xs font-medium text-white shadow-xs transition cursor-pointer ${commandConfig[confirmCmd].bgClass} ${commandConfig[confirmCmd].hoverClass}`}
              >
                Confirm & Dispatch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
