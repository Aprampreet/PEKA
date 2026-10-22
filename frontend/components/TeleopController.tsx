"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Square,
  Gauge,
  Compass,
  Radio,
  Keyboard,
  Sliders,
  ShieldAlert,
  Zap,
  Crosshair,
  CheckCircle2,
  AlertCircle,
  Move,
} from "lucide-react";
import { api } from "../lib/api";

interface TeleopControllerProps {
  onPoseUpdate?: () => void;
  className?: string;
}

type SpeedLevel = "slow" | "normal" | "max";

const SPEED_PRESETS: Record<
  SpeedLevel,
  { maxLinear: number; maxAngular: number; label: string }
> = {
  slow: { maxLinear: 0.2, maxAngular: 0.45, label: "0.20 m/s (Precise)" },
  normal: { maxLinear: 0.35, maxAngular: 0.75, label: "0.35 m/s (Normal)" },
  max: { maxLinear: 0.5, maxAngular: 1.0, label: "0.50 m/s (Max Limit)" },
};

export const TeleopController: React.FC<TeleopControllerProps> = ({
  onPoseUpdate,
  className = "",
}) => {
  const [speedLevel, setSpeedLevel] = useState<SpeedLevel>("normal");
  const [isBoxFocused, setIsBoxFocused] = useState<boolean>(false);
  const [activeDirection, setActiveDirection] = useState<
    "forward" | "backward" | "left" | "right" | "stop" | null
  >(null);
  const [velocity, setVelocity] = useState<{ linear_x: number; angular_z: number }>({
    linear_x: 0,
    angular_z: 0,
  });
  const [upstreamStatus, setUpstreamStatus] = useState<"ready" | "streaming" | "stopped">("ready");
  const [lastDispatchedTime, setLastDispatchedTime] = useState<string | null>(null);

  // Virtual Joystick State
  const [joystickKnob, setJoystickKnob] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isJoystickDragging, setIsJoystickDragging] = useState<boolean>(false);

  // Streaming refs to avoid overlapping in-flight requests (per IoT specification)
  const driveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const driveInFlightRef = useRef<boolean>(false);
  const currentVelRef = useRef<{ linear: number; angular: number }>({ linear: 0, angular: 0 });
  const activeKeysRef = useRef<Set<string>>(new Set());
  const boxRef = useRef<HTMLDivElement | null>(null);
  const joystickBaseRef = useRef<HTMLDivElement | null>(null);

  // Publish velocity to /api/robot/cmd_vel
  const publishVelocity = useCallback(
    async (linearX: number, angularZ: number) => {
      if (driveInFlightRef.current) return;
      driveInFlightRef.current = true;

      // Strict clamping adhering to teammate's ROS 2 limits: [-0.5, 0.5] and [-1.0, 1.0]
      const clampedLinear = Math.max(-0.5, Math.min(0.5, linearX));
      const clampedAngular = Math.max(-1.0, Math.min(1.0, angularZ));

      setVelocity({ linear_x: clampedLinear, angular_z: clampedAngular });
      setLastDispatchedTime(new Date().toLocaleTimeString());
      setUpstreamStatus(clampedLinear === 0 && clampedAngular === 0 ? "stopped" : "streaming");

      try {
        await api.sendCmdVel(clampedLinear, clampedAngular);
        onPoseUpdate?.();
      } catch (err) {
        console.error("Velocity command transmission failed:", err);
      } finally {
        driveInFlightRef.current = false;
      }
    },
    [onPoseUpdate]
  );

  // Start continuous sequential heartbeat stream (~7 Hz / 140ms interval)
  const startDriveStream = useCallback(
    (linearX: number, angularZ: number) => {
      currentVelRef.current = { linear: linearX, angular: angularZ };

      // Dispatch immediately
      publishVelocity(linearX, angularZ);

      // Start periodic heartbeat if not running
      if (!driveTimerRef.current) {
        driveTimerRef.current = setInterval(() => {
          publishVelocity(currentVelRef.current.linear, currentVelRef.current.angular);
        }, 140);
      }
    },
    [publishVelocity]
  );

  // Stop robot immediately
  const stopRobot = useCallback(() => {
    if (driveTimerRef.current) {
      clearInterval(driveTimerRef.current);
      driveTimerRef.current = null;
    }
    currentVelRef.current = { linear: 0, angular: 0 };
    setActiveDirection("stop");
    setJoystickKnob({ x: 0, y: 0 });
    publishVelocity(0, 0);

    setTimeout(() => {
      setActiveDirection(null);
      setUpstreamStatus("ready");
    }, 350);
  }, [publishVelocity]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (driveTimerRef.current) clearInterval(driveTimerRef.current);
      api.sendCmdVel(0, 0).catch(() => {});
    };
  }, []);

  // ==========================================
  // 1. Virtual Joystick Touch / Pointer Logic
  // ==========================================
  const handleJoystickPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsJoystickDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    updateJoystickFromPointer(e);
  };

  const handleJoystickPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isJoystickDragging) return;
    updateJoystickFromPointer(e);
  };

  const handleJoystickPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isJoystickDragging) return;
    setIsJoystickDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {}
    stopRobot();
  };

  const updateJoystickFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const base = joystickBaseRef.current;
    if (!base) return;

    const rect = base.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const deltaX = e.clientX - centerX;
    const deltaY = e.clientY - centerY;

    const maxRadius = 45; // pixel boundary
    const distance = Math.hypot(deltaX, deltaY);
    const clampedDist = Math.min(distance, maxRadius);
    const angle = Math.atan2(deltaY, deltaX);

    const knobX = Math.cos(angle) * clampedDist;
    const knobY = Math.sin(angle) * clampedDist;
    setJoystickKnob({ x: knobX, y: knobY });

    // Normalized ratios (-1.0 to 1.0)
    // Forward (up in UI) is negative deltaY, so linear_x = -knobY / maxRadius
    // Turn left is negative deltaX, counter-clockwise angular_z is positive
    const normLinear = -knobY / maxRadius;
    const normAngular = -knobX / maxRadius;

    const limits = SPEED_PRESETS[speedLevel];
    const targetLinear = Number((normLinear * limits.maxLinear).toFixed(3));
    const targetAngular = Number((normAngular * limits.maxAngular).toFixed(3));

    // Update active direction indicator
    if (Math.abs(normLinear) > 0.25 || Math.abs(normAngular) > 0.25) {
      if (Math.abs(normLinear) >= Math.abs(normAngular)) {
        setActiveDirection(normLinear > 0 ? "forward" : "backward");
      } else {
        setActiveDirection(normAngular > 0 ? "left" : "right");
      }
    } else {
      setActiveDirection(null);
    }

    startDriveStream(targetLinear, targetAngular);
  };

  // ==========================================
  // 2. Click-to-Focus Keyboard Driving Logic
  // ==========================================
  useEffect(() => {
    if (!isBoxFocused) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.code;
      const driveKeys = [
        "KeyW",
        "KeyS",
        "KeyA",
        "KeyD",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "Space",
        "KeyX",
      ];

      if (!driveKeys.includes(key)) {
        if (key === "Escape") {
          // Release focus on Escape
          setIsBoxFocused(false);
          stopRobot();
        }
        return;
      }

      e.preventDefault();
      activeKeysRef.current.add(key);

      if (key === "Space" || key === "KeyX") {
        stopRobot();
        return;
      }

      calculateAndDispatchFromKeys();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.code;
      if (activeKeysRef.current.has(key)) {
        activeKeysRef.current.delete(key);
      }

      if (activeKeysRef.current.size === 0) {
        stopRobot();
      } else {
        calculateAndDispatchFromKeys();
      }
    };

    const calculateAndDispatchFromKeys = () => {
      const keys = activeKeysRef.current;
      const limits = SPEED_PRESETS[speedLevel];

      let targetLinear = 0;
      let targetAngular = 0;

      if (keys.has("KeyW") || keys.has("ArrowUp")) targetLinear += limits.maxLinear;
      if (keys.has("KeyS") || keys.has("ArrowDown")) targetLinear -= limits.maxLinear;
      if (keys.has("KeyA") || keys.has("ArrowLeft")) targetAngular += limits.maxAngular;
      if (keys.has("KeyD") || keys.has("ArrowRight")) targetAngular -= limits.maxAngular;

      if (targetLinear > 0) setActiveDirection("forward");
      else if (targetLinear < 0) setActiveDirection("backward");
      else if (targetAngular > 0) setActiveDirection("left");
      else if (targetAngular < 0) setActiveDirection("right");
      else setActiveDirection(null);

      startDriveStream(targetLinear, targetAngular);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [isBoxFocused, speedLevel, startDriveStream, stopRobot]);

  return (
    <div
      className={`rounded-lg border border-[#D8D9D1] bg-white p-4 shadow-sm space-y-4 ${className}`}
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EAE9E2] pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-md bg-[#285B49]/10 text-[#285B49]">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-[#242820]">
                Robot Teleoperation &amp; Drive Controls
              </h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#F3F2ED] border border-[#D8D9D1] text-[#285B49]">
                ROS 2 /cmd_vel
              </span>
            </div>
            <p className="text-xs text-[#6C7068]">
              Virtual 2D Joystick &amp; Click-to-Drive Keyboard Box (Streaming Twist at 7 Hz)
            </p>
          </div>
        </div>

        {/* Speed Profile Selector (Clamped <= 0.5 m/s, <= 1.0 rad/s) */}
        <div className="flex items-center gap-1 bg-[#F3F2ED] p-0.5 rounded-md border border-[#D8D9D1]">
          {(["slow", "normal", "max"] as SpeedLevel[]).map((lvl) => (
            <button
              key={lvl}
              onClick={() => setSpeedLevel(lvl)}
              className={`px-2.5 py-1 rounded text-xs font-mono transition cursor-pointer ${
                speedLevel === lvl
                  ? "bg-[#285B49] text-white font-semibold shadow-xs"
                  : "text-[#6C7068] hover:text-[#242820]"
              }`}
            >
              <span className="capitalize">{lvl}</span>
              <span className="text-[9px] ml-1 opacity-75">
                {SPEED_PRESETS[lvl].maxLinear}m/s
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Grid: Left Virtual Joystick (45%) + Right Click-to-Drive Box (55%) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
        {/* Left: 2D Analog Virtual Joystick */}
        <div className="md:col-span-5 flex flex-col items-center justify-center p-4 rounded-lg bg-[#0E1117] border border-[#21262D] text-center select-none shadow-inner">
          <div className="flex items-center justify-between w-full mb-3 px-1">
            <span className="text-[11px] font-mono text-cyan-400 font-semibold flex items-center gap-1.5">
              <Move className="w-3.5 h-3.5" />
              ANALOG JOYSTICK
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              Drag thumbstick
            </span>
          </div>

          {/* Interactive Joystick Pad */}
          <div
            ref={joystickBaseRef}
            onPointerDown={handleJoystickPointerDown}
            onPointerMove={handleJoystickPointerMove}
            onPointerUp={handleJoystickPointerUp}
            onPointerCancel={handleJoystickPointerUp}
            className="relative w-36 h-36 rounded-full border-2 border-cyan-500/30 bg-gradient-to-b from-[#161B22] to-[#0D1117] flex items-center justify-center cursor-grab active:cursor-grabbing shadow-[inset_0_0_20px_rgba(0,0,0,0.8)] touch-none"
          >
            {/* Crosshair guidelines */}
            <div className="absolute w-full h-px bg-cyan-500/20" />
            <div className="absolute h-full w-px bg-cyan-500/20" />
            <div className="absolute w-20 h-20 rounded-full border border-cyan-500/15 pointer-events-none" />

            {/* Direction labels */}
            <span className="absolute top-1 text-[8px] font-mono text-slate-500 font-bold">FWD</span>
            <span className="absolute bottom-1 text-[8px] font-mono text-slate-500 font-bold">REV</span>
            <span className="absolute left-1.5 text-[8px] font-mono text-slate-500 font-bold">L</span>
            <span className="absolute right-1.5 text-[8px] font-mono text-slate-500 font-bold">R</span>

            {/* Draggable Thumb Knob */}
            <div
              style={{
                transform: `translate(${joystickKnob.x}px, ${joystickKnob.y}px)`,
                transition: isJoystickDragging ? "none" : "transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)",
              }}
              className="w-13 h-13 rounded-full bg-gradient-to-br from-cyan-400 to-emerald-500 shadow-[0_0_15px_rgba(6,182,212,0.6)] flex items-center justify-center border-2 border-white/40 cursor-grab active:cursor-grabbing"
            >
              <div className="w-4 h-4 rounded-full bg-white/80 shadow-inner" />
            </div>
          </div>

          {/* Joystick live readings */}
          <div className="mt-3 flex items-center gap-3 text-[10px] font-mono text-slate-400">
            <span>VX: <strong className="text-white">{velocity.linear_x >= 0 ? `+${velocity.linear_x.toFixed(2)}` : velocity.linear_x.toFixed(2)}</strong></span>
            <span>WZ: <strong className="text-white">{velocity.angular_z >= 0 ? `+${velocity.angular_z.toFixed(2)}` : velocity.angular_z.toFixed(2)}</strong></span>
          </div>
        </div>

        {/* Right: "A Box Where We Click Then We Can Control Robot by Keys" */}
        <div
          ref={boxRef}
          tabIndex={0}
          onClick={() => {
            setIsBoxFocused(true);
            boxRef.current?.focus();
          }}
          className={`md:col-span-7 flex flex-col justify-between p-4 rounded-lg border-2 transition-all cursor-pointer outline-none ${
            isBoxFocused
              ? "bg-[#F0FDF4] border-[#285B49] ring-2 ring-[#285B49]/20 shadow-md"
              : "bg-[#F9F9F7] border-dashed border-[#D8D9D1] hover:border-[#285B49]/50 hover:bg-[#F3F2ED]"
          }`}
        >
          {/* Box Header Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Keyboard className={`w-4 h-4 ${isBoxFocused ? "text-[#285B49]" : "text-[#6C7068]"}`} />
              <span className="text-xs font-semibold text-[#242820]">
                {isBoxFocused ? "KEYBOARD CAPTURE ENGAGED" : "CLICK BOX TO CONTROL BY KEYS"}
              </span>
            </div>

            <span
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold flex items-center gap-1.5 ${
                isBoxFocused
                  ? "bg-[#285B49] text-white"
                  : "bg-[#EAE9E2] text-[#6C7068]"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isBoxFocused ? "bg-white animate-ping" : "bg-slate-400"
                }`}
              />
              {isBoxFocused ? "DRIVE ACTIVE" : "CLICK TO ENGAGE"}
            </span>
          </div>

          {/* Interactive Arrow Keypad (Lights up on keydown or click) */}
          <div className="flex flex-col items-center justify-center my-2">
            {/* Forward Key */}
            <div className="mb-1.5">
              <button
                onMouseDown={() => startDriveStream(SPEED_PRESETS[speedLevel].maxLinear, 0)}
                onMouseUp={stopRobot}
                onMouseLeave={stopRobot}
                className={`w-12 h-11 rounded-md border flex flex-col items-center justify-center transition select-none cursor-pointer active:scale-95 shadow-xs ${
                  activeDirection === "forward"
                    ? "bg-[#285B49] text-white border-[#285B49] ring-2 ring-[#285B49]/40"
                    : "bg-white text-[#242820] border-[#D8D9D1] hover:bg-[#EAE9E2]"
                }`}
                title="Forward (W / ArrowUp)"
              >
                <ArrowUp className="w-4 h-4" />
                <span className="text-[8px] font-mono font-bold">W / ↑</span>
              </button>
            </div>

            {/* Left, STOP, Right */}
            <div className="flex items-center gap-1.5 mb-1.5">
              <button
                onMouseDown={() => startDriveStream(0, SPEED_PRESETS[speedLevel].maxAngular)}
                onMouseUp={stopRobot}
                onMouseLeave={stopRobot}
                className={`w-12 h-11 rounded-md border flex flex-col items-center justify-center transition select-none cursor-pointer active:scale-95 shadow-xs ${
                  activeDirection === "left"
                    ? "bg-[#285B49] text-white border-[#285B49] ring-2 ring-[#285B49]/40"
                    : "bg-white text-[#242820] border-[#D8D9D1] hover:bg-[#EAE9E2]"
                }`}
                title="Turn Left (A / ArrowLeft)"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-[8px] font-mono font-bold">A / ←</span>
              </button>

              {/* Stop Button */}
              <button
                onClick={stopRobot}
                className={`w-14 h-11 rounded-md border flex flex-col items-center justify-center transition select-none cursor-pointer active:scale-95 shadow-xs ${
                  activeDirection === "stop"
                    ? "bg-[#A84B2C] text-white border-[#A84B2C]"
                    : "bg-[#FBEAE5] text-[#A84B2C] border-[#F2C4B7] hover:bg-[#F8D7CF]"
                }`}
                title="Emergency Stop (Space)"
              >
                <Square className="w-4 h-4 fill-current" />
                <span className="text-[8px] font-mono font-bold uppercase">SPACE</span>
              </button>

              <button
                onMouseDown={() => startDriveStream(0, -SPEED_PRESETS[speedLevel].maxAngular)}
                onMouseUp={stopRobot}
                onMouseLeave={stopRobot}
                className={`w-12 h-11 rounded-md border flex flex-col items-center justify-center transition select-none cursor-pointer active:scale-95 shadow-xs ${
                  activeDirection === "right"
                    ? "bg-[#285B49] text-white border-[#285B49] ring-2 ring-[#285B49]/40"
                    : "bg-white text-[#242820] border-[#D8D9D1] hover:bg-[#EAE9E2]"
                }`}
                title="Turn Right (D / ArrowRight)"
              >
                <ArrowRight className="w-4 h-4" />
                <span className="text-[8px] font-mono font-bold">D / →</span>
              </button>
            </div>

            {/* Reverse Key */}
            <div>
              <button
                onMouseDown={() => startDriveStream(-SPEED_PRESETS[speedLevel].maxLinear, 0)}
                onMouseUp={stopRobot}
                onMouseLeave={stopRobot}
                className={`w-12 h-11 rounded-md border flex flex-col items-center justify-center transition select-none cursor-pointer active:scale-95 shadow-xs ${
                  activeDirection === "backward"
                    ? "bg-[#285B49] text-white border-[#285B49] ring-2 ring-[#285B49]/40"
                    : "bg-white text-[#242820] border-[#D8D9D1] hover:bg-[#EAE9E2]"
                }`}
                title="Reverse (S / ArrowDown)"
              >
                <ArrowDown className="w-4 h-4" />
                <span className="text-[8px] font-mono font-bold">S / ↓</span>
              </button>
            </div>
          </div>

          {/* Box Bottom Instructions / Release Info */}
          <div className="pt-2 border-t border-[#D8D9D1]/60 flex items-center justify-between text-[11px] font-mono text-[#6C7068]">
            <span>
              {isBoxFocused
                ? "Press Space to stop • Click outside or ESC to release"
                : "Click inside to capture keyboard focus"}
            </span>
            <span
              className={`font-semibold ${
                upstreamStatus === "streaming"
                  ? "text-[#285B49]"
                  : upstreamStatus === "stopped"
                  ? "text-[#A84B2C]"
                  : "text-[#6C7068]"
              }`}
            >
              {upstreamStatus.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* Live ROS 2 Velocity Telemetry HUD Bar */}
      <div className="p-3 rounded-md bg-[#F3F2ED] border border-[#D8D9D1] flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5 text-[#285B49]" />
            <span className="text-[#6C7068]">Twist.linear.x:</span>
            <strong className="text-[#242820]">
              {velocity.linear_x >= 0 ? `+${velocity.linear_x.toFixed(2)}` : velocity.linear_x.toFixed(2)} m/s
            </strong>
          </div>

          <div className="flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5 text-[#285B49]" />
            <span className="text-[#6C7068]">Twist.angular.z:</span>
            <strong className="text-[#242820]">
              {velocity.angular_z >= 0 ? `+${velocity.angular_z.toFixed(2)}` : velocity.angular_z.toFixed(2)} rad/s
            </strong>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[11px]">
          <span className="text-[#6C7068]">Upstream:</span>
          <span className="flex items-center gap-1 font-semibold text-[#285B49]">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>ROS 2 /cmd_vel (7 Hz)</span>
          </span>
          {lastDispatchedTime && (
            <span className="text-[#6C7068]">· Last: {lastDispatchedTime}</span>
          )}
        </div>
      </div>
    </div>
  );
};
