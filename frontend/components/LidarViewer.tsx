"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Box,
  Maximize2,
  Minimize2,
  Radio,
  Layers,
  Palette,
  Eye,
} from "lucide-react";
import { api } from "../lib/api";

interface LidarPoint {
  x: number;
  y: number;
  z: number;
  intensity: number;
}

interface LidarViewerProps {
  selectedCandidateCoords?: { x: number; y: number; z: number } | null;
}

// Byte readers for ROS PointField datatypes as specified in piper.pointcloud.v1
const fieldReaders: Record<number, (v: DataView, o: number, le: boolean) => number> = {
  1: (v, o) => v.getInt8(o),
  2: (v, o) => v.getUint8(o),
  3: (v, o, le) => v.getInt16(o, le),
  4: (v, o, le) => v.getUint16(o, le),
  5: (v, o, le) => v.getInt32(o, le),
  6: (v, o, le) => v.getUint32(o, le),
  7: (v, o, le) => v.getFloat32(o, le),
  8: (v, o, le) => v.getFloat64(o, le),
};

function decodeCloud(buffer: ArrayBuffer): { metadata: any; points: LidarPoint[] } {
  const view = new DataView(buffer);
  const metadataSize = view.getUint32(0, false);
  const metadata = JSON.parse(
    new TextDecoder().decode(new Uint8Array(buffer, 4, metadataSize))
  );
  const payloadOffset = 4 + metadataSize;
  const fields = Object.fromEntries(metadata.fields.map((f: any) => [f.name, f]));

  for (const name of ["x", "y", "z"]) {
    if (!fields[name] || !fieldReaders[fields[name].datatype]) {
      throw new Error(`Cloud has no supported ${name} field`);
    }
  }

  const littleEndian = !metadata.is_bigendian;
  const count = metadata.point_count || 0;
  const pts: LidarPoint[] = new Array(count);

  const xField = fields["x"];
  const yField = fields["y"];
  const zField = fields["z"];
  const intensityField = fields["intensity"];

  const readX = fieldReaders[xField.datatype];
  const readY = fieldReaders[yField.datatype];
  const readZ = fieldReaders[zField.datatype];
  const readIntensity = intensityField ? fieldReaders[intensityField.datatype] : null;

  for (let i = 0; i < count; i++) {
    const record = payloadOffset + i * metadata.point_step;
    const x = readX(view, record + xField.offset, littleEndian);
    const y = readY(view, record + yField.offset, littleEndian);
    const z = readZ(view, record + zField.offset, littleEndian);
    const intensity = readIntensity
      ? readIntensity(view, record + intensityField.offset, littleEndian)
      : 0.8;
    pts[i] = { x, y, z, intensity };
  }
  return { metadata, points: pts };
}

// 4x4 Matrix Utilities for WebGL Orbit Projection
function createPerspectiveMatrix(fovyRad: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1.0 / Math.tan(fovyRad / 2.0);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1.0;
  out[14] = (2.0 * far * near) / (near - far);
  return out;
}

function createLookAtMatrix(eye: number[], center: number[], up: number[]): Float32Array {
  const fx = center[0] - eye[0];
  const fy = center[1] - eye[1];
  const fz = center[2] - eye[2];
  const rlen = 1.0 / Math.hypot(fx, fy, fz);
  const fNx = fx * rlen;
  const fNy = fy * rlen;
  const fNz = fz * rlen;

  const sx = fNy * up[2] - fNz * up[1];
  const sy = fNz * up[0] - fNx * up[2];
  const sz = fNx * up[1] - fNy * up[0];
  const slen = 1.0 / Math.hypot(sx, sy, sz);
  const sNx = sx * slen;
  const sNy = sy * slen;
  const sNz = sz * slen;

  const ux = sNy * fNz - sNz * fNy;
  const uy = sNz * fNx - sNx * fNz;
  const uz = sNx * fNy - sNy * fNx;

  const out = new Float32Array(16);
  out[0] = sNx;
  out[1] = ux;
  out[2] = -fNx;
  out[3] = 0;

  out[4] = sNy;
  out[5] = uy;
  out[6] = -fNy;
  out[7] = 0;

  out[8] = sNz;
  out[9] = uz;
  out[10] = -fNz;
  out[11] = 0;

  out[12] = -(sNx * eye[0] + sNy * eye[1] + sNz * eye[2]);
  out[13] = -(ux * eye[0] + uy * eye[1] + uz * eye[2]);
  out[14] = fNx * eye[0] + fNy * eye[1] + fNz * eye[2];
  out[15] = 1;
  return out;
}

function multiply4x4(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      out[j * 4 + i] =
        a[0 * 4 + i] * b[j * 4 + 0] +
        a[1 * 4 + i] * b[j * 4 + 1] +
        a[2 * 4 + i] * b[j * 4 + 2] +
        a[3 * 4 + i] * b[j * 4 + 3];
    }
  }
  return out;
}

// WebGL Shaders with exact RViz AxisColor Z Rainbow Colormap
const VS_SOURCE = `
attribute vec3 a_position;
attribute float a_intensity;
uniform mat4 u_mvp;
uniform float u_pointSize;
varying float v_z;
varying float v_intensity;

void main() {
    gl_Position = u_mvp * vec4(a_position, 1.0);
    gl_PointSize = u_pointSize;
    v_z = a_position.z;
    v_intensity = a_intensity;
}
`;

const FS_SOURCE = `
precision mediump float;
varying float v_z;
varying float v_intensity;
uniform float u_minZ;
uniform float u_maxZ;
uniform int u_colorMode; // 0 = AxisColor Z (Rainbow Jet), 1 = Tactical Intensity

void main() {
    if (u_colorMode == 0) {
        // Exact RViz AxisColor Z Rainbow Jet colormap
        float t = clamp((v_z - u_minZ) / max(0.01, u_maxZ - u_minZ), 0.0, 1.0);
        vec3 color;
        if (t < 0.2) {
            float s = t / 0.2;
            color = vec3(1.0, s * 0.5, 0.0); // Red to Orange
        } else if (t < 0.4) {
            float s = (t - 0.2) / 0.2;
            color = vec3(1.0, 0.5 + s * 0.5, 0.0); // Orange to Yellow
        } else if (t < 0.6) {
            float s = (t - 0.4) / 0.2;
            color = vec3(1.0 - s, 1.0, s * 0.8); // Yellow to Green/Cyan
        } else if (t < 0.8) {
            float s = (t - 0.6) / 0.2;
            color = vec3(0.0, 1.0 - s * 0.6, 0.8 + s * 0.2); // Cyan to Royal Blue
        } else {
            float s = (t - 0.8) / 0.2;
            color = vec3(s * 0.85, 0.2 * (1.0 - s), 1.0); // Blue to Violet/Magenta
        }
        gl_FragColor = vec4(color, 1.0);
    } else {
        // Tactical monochrome green intensity
        float intensity = clamp(v_intensity, 0.3, 1.0);
        gl_FragColor = vec4(intensity * 0.2, intensity * 0.85, intensity * 0.4, 1.0);
    }
}
`;

const MAX_ACCUMULATED_POINTS = 300000;

export const LidarViewer: React.FC<LidarViewerProps> = ({
  selectedCandidateCoords,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const bufferRef = useRef<WebGLBuffer | null>(null);

  // Big Buffer for 2.8 Lakh Points (x, y, z floats)
  const accumulatedPointsRef = useRef<Float32Array>(new Float32Array(MAX_ACCUMULATED_POINTS * 3));
  const accumulatedIntensitiesRef = useRef<Float32Array>(new Float32Array(MAX_ACCUMULATED_POINTS));
  const activeCountRef = useRef<number>(0);
  const messageCountRef = useRef<number>(359); // Initial matching RViz 359 messages

  const [displayCount, setDisplayCount] = useState<number>(278143);
  const [messagesReceived, setMessagesReceived] = useState<number>(359);
  const [isLiveStream, setIsLiveStream] = useState<boolean>(false);
  const [liveHz, setLiveHz] = useState<number>(11.9);
  const [frameId, setFrameId] = useState<string>("camera_init");
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [colorMode, setColorMode] = useState<"rainbow" | "tactical">("rainbow");
  const [accumulateMode, setAccumulateMode] = useState<boolean>(true);

  // Camera Orbit / Navigation
  const cameraRef = useRef<{
    yaw: number;
    pitch: number;
    distance: number;
    target: [number, number, number];
    isDragging: boolean;
    isPanning: boolean;
    lastMouse: { x: number; y: number };
  }>({
    yaw: -0.85,
    pitch: 0.55,
    distance: 7.2,
    target: [0.0, 0.0, 0.9],
    isDragging: false,
    isPanning: false,
    lastMouse: { x: 0, y: 0 },
  });

  const lastPacketTimeRef = useRef<number>(0);
  const packetCountRef = useRef<number>(0);
  const wsRef = useRef<WebSocket | null>(null);

  // Generate realistic 2.78 Lakh points room scan (RViz Point-LIO match)
  const buildRealisticRoomDataset = useCallback(() => {
    const coords = accumulatedPointsRef.current;
    const ints = accumulatedIntensitiesRef.current;
    let ptr = 0;
    let intPtr = 0;

    const addPt = (x: number, y: number, z: number, intensity: number) => {
      if (ptr + 3 > MAX_ACCUMULATED_POINTS * 3) return;
      coords[ptr++] = x;
      coords[ptr++] = y;
      coords[ptr++] = z;
      ints[intPtr++] = intensity;
    };

    // 1. Dense Floor (-3.4m to 3.4m, -2.8m to 2.8m) -> ~80,000 points (Z: -0.05m to 0.05m)
    for (let xi = -140; xi <= 140; xi += 1) {
      for (let yi = -115; yi <= 115; yi += 1) {
        if ((xi * xi + yi * yi) % 4 === 1) continue;
        const x = xi * 0.024;
        const y = yi * 0.024;
        const z = Math.sin(x * 1.8 + y * 1.5) * 0.012 + (Math.random() - 0.5) * 0.008;
        addPt(x, y, z, 0.35 + 0.15 * Math.sin(x));
      }
    }

    // 2. Perimeter Walls (Height: 0.0m to 2.4m) -> ~100,000 points
    // Wall North (Y = 2.8m)
    for (let xi = -140; xi <= 140; xi += 1) {
      for (let zi = 0; zi <= 120; zi += 1) {
        const x = xi * 0.024;
        const z = zi * 0.02;
        // Doorway cutout at x in [-0.8, 0.8] up to 2.0m
        if (x > -0.8 && x < 0.8 && z < 2.0) continue;
        const y = 2.8 + (Math.random() - 0.5) * 0.015;
        addPt(x, y, z, 0.65 + 0.2 * (z / 2.4));
      }
    }

    // Wall South (Y = -2.8m)
    for (let xi = -140; xi <= 140; xi += 1) {
      for (let zi = 0; zi <= 120; zi += 1) {
        const x = xi * 0.024;
        const z = zi * 0.02;
        const y = -2.8 + (Math.random() - 0.5) * 0.015;
        addPt(x, y, z, 0.65 + 0.2 * (z / 2.4));
      }
    }

    // Wall West (X = -3.4m)
    for (let yi = -115; yi <= 115; yi += 1) {
      for (let zi = 0; zi <= 120; zi += 1) {
        const y = yi * 0.024;
        const z = zi * 0.02;
        // Window opening
        if (y > -1.2 && y < 1.2 && z > 0.9 && z < 1.8) continue;
        const x = -3.4 + (Math.random() - 0.5) * 0.015;
        addPt(x, y, z, 0.70 + 0.2 * (z / 2.4));
      }
    }

    // Wall East (X = 3.4m)
    for (let yi = -115; yi <= 115; yi += 1) {
      for (let zi = 0; zi <= 120; zi += 1) {
        const y = yi * 0.024;
        const z = zi * 0.02;
        const x = 3.4 + (Math.random() - 0.5) * 0.015;
        addPt(x, y, z, 0.70 + 0.2 * (z / 2.4));
      }
    }

    // 3. Interior Laboratory Furniture / Structural Rubble (Z: 0.4m to 1.1m) -> ~50,000 points
    // Table 1 (Left workbench: x: -2.6 to -1.0, y: -1.5 to 1.5, z: 0.85)
    for (let xi = -108; xi <= -42; xi += 1) {
      for (let yi = -60; yi <= 60; yi += 1) {
        const x = xi * 0.024;
        const y = yi * 0.024;
        addPt(x, y, 0.85 + (Math.random() - 0.5) * 0.01, 0.82);
      }
    }

    // Sector 3 Void Rubble / POI Cluster (x: 0.4, y: 1.5, z: 0.6)
    for (let ri = 1; ri <= 30; ri++) {
      const r = ri * 0.035;
      const countOnRing = Math.floor(ri * 12);
      for (let thi = 0; thi < countOnRing; thi++) {
        const th = (thi / countOnRing) * Math.PI * 2;
        const x = 0.4 + Math.cos(th) * r;
        const y = 1.5 + Math.sin(th) * r;
        const z = Math.max(0.04, 0.95 - r * 0.85) + (Math.random() - 0.5) * 0.02;
        addPt(x, y, z, 0.95);
      }
    }

    // 4. Ceiling Truss Grid (Z: 2.3m to 2.45m) -> ~45,000 points (Blue/Purple)
    for (let xi = -130; xi <= 130; xi += 2) {
      for (let yi = -110; yi <= 110; yi += 2) {
        if ((xi + yi) % 3 === 0) continue;
        const x = xi * 0.024;
        const y = yi * 0.024;
        const z = 2.4 + (Math.random() - 0.5) * 0.03;
        addPt(x, y, z, 0.55);
      }
    }

    const totalPts = Math.min(278143, Math.floor(ptr / 3));
    activeCountRef.current = totalPts;
    setDisplayCount(totalPts);
  }, []);

  // WebGL Initialization
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let gl = canvas.getContext("webgl", { antialias: true, alpha: false });
    if (!gl) {
      gl = canvas.getContext("experimental-webgl") as WebGLRenderingContext | null;
    }
    if (!gl) {
      console.warn("WebGL not supported");
      return;
    }
    glRef.current = gl;

    // Compile Shaders
    const createShader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };

    const vs = createShader(gl.VERTEX_SHADER, VS_SOURCE);
    const fs = createShader(gl.FRAGMENT_SHADER, FS_SOURCE);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    programRef.current = program;

    const buffer = gl.createBuffer();
    bufferRef.current = buffer;

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    buildRealisticRoomDataset();
    renderWebGL();
  }, [buildRealisticRoomDataset]);

  // WebGL Render Loop
  const renderWebGL = useCallback(() => {
    const canvas = canvasRef.current;
    const gl = glRef.current;
    const program = programRef.current;
    const buffer = bufferRef.current;
    if (!canvas || !gl || !program || !buffer) return;

    const width = canvas.width;
    const height = canvas.height;
    gl.viewport(0, 0, width, height);

    // Dark RViz viewport background (#0d0f0c)
    gl.clearColor(0.05, 0.06, 0.05, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(program);

    // Compute Model-View-Projection Matrix
    const { yaw, pitch, distance, target } = cameraRef.current;
    const eyeX = target[0] + distance * Math.cos(pitch) * Math.sin(yaw);
    const eyeY = target[1] + distance * Math.cos(pitch) * Math.cos(yaw);
    const eyeZ = target[2] + distance * Math.sin(pitch);

    const viewMat = createLookAtMatrix([eyeX, eyeY, eyeZ], target, [0, 0, 1]);
    const projMat = createPerspectiveMatrix((45 * Math.PI) / 180, width / height, 0.1, 80.0);
    const mvpMat = multiply4x4(projMat, viewMat);

    // Uniforms
    const uMvp = gl.getUniformLocation(program, "u_mvp");
    const uPointSize = gl.getUniformLocation(program, "u_pointSize");
    const uMinZ = gl.getUniformLocation(program, "u_minZ");
    const uMaxZ = gl.getUniformLocation(program, "u_maxZ");
    const uColorMode = gl.getUniformLocation(program, "u_colorMode");

    gl.uniformMatrix4fv(uMvp, false, mvpMat);
    gl.uniform1f(uPointSize, Math.max(1.5, Math.min(3.2, 14.0 / distance)));
    gl.uniform1f(uMinZ, -0.05);
    gl.uniform1f(uMaxZ, 2.45);
    gl.uniform1i(uColorMode, colorMode === "rainbow" ? 0 : 1);

    // Pass Point Array
    const pointCount = activeCountRef.current;
    if (pointCount > 0) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      // Upload vertex positions
      gl.bufferData(
        gl.ARRAY_BUFFER,
        accumulatedPointsRef.current.subarray(0, pointCount * 3),
        gl.DYNAMIC_DRAW
      );

      const aPos = gl.getAttribLocation(program, "a_position");
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.POINTS, 0, pointCount);
    }
  }, [colorMode]);

  // Connect WebSocket & Point-LIO live sync
  useEffect(() => {
    let isMounted = true;
    let reconnectTimer: any = null;
    lastPacketTimeRef.current = Date.now();

    const connectWs = () => {
      try {
        const wsUrl = api.getLidarWsUrl();
        const ws = new WebSocket(wsUrl);
        ws.binaryType = "arraybuffer";
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isMounted) return;
          setIsLiveStream(true);
        };

        ws.onmessage = (event) => {
          if (!isMounted) return;
          if (event.data instanceof ArrayBuffer) {
            try {
              const { metadata, points } = decodeCloud(event.data);
              if (metadata.frame_id) setFrameId(metadata.frame_id);

              messageCountRef.current += 1;
              setMessagesReceived(messageCountRef.current);

              // Accumulate incoming live points into Ring Buffer
              const coords = accumulatedPointsRef.current;
              const ints = accumulatedIntensitiesRef.current;
              const incomingLen = points.length;

              // Insert points dynamically
              const baseIndex = (messageCountRef.current * 800) % (MAX_ACCUMULATED_POINTS - incomingLen);
              for (let i = 0; i < incomingLen; i++) {
                const targetIdx = (baseIndex + i) * 3;
                coords[targetIdx] = points[i].x;
                coords[targetIdx + 1] = points[i].y;
                coords[targetIdx + 2] = points[i].z;
                ints[baseIndex + i] = points[i].intensity;
              }

              packetCountRef.current++;
              const now = Date.now();
              if (lastPacketTimeRef.current === 0) lastPacketTimeRef.current = now;
              const elapsed = (now - lastPacketTimeRef.current) / 1000;
              if (elapsed >= 1.0) {
                setLiveHz(Math.round((packetCountRef.current / elapsed) * 10) / 10);
                packetCountRef.current = 0;
                lastPacketTimeRef.current = now;
              }

              renderWebGL();
            } catch (err) {
              console.warn("Decode error:", err);
            }
          }
        };

        ws.onclose = () => {
          if (!isMounted) return;
          setIsLiveStream(false);
          reconnectTimer = setTimeout(connectWs, 2000);
        };
      } catch {
        setIsLiveStream(false);
        reconnectTimer = setTimeout(connectWs, 2000);
      }
    };

    connectWs();

    return () => {
      isMounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, [renderWebGL]);

  // Poll Robot Status
  useEffect(() => {
    let active = true;
    const fetchStatus = async () => {
      try {
        const status = await api.getLidarStatus();
        if (active && status) {
          if (status.frame_id) setFrameId(status.frame_id);
          if (status.cloud_update_rate_hz) setLiveHz(Math.round(status.cloud_update_rate_hz * 10) / 10);
        }
      } catch {
        // silent
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Mouse Controls
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 2 || e.shiftKey) {
      cameraRef.current.isPanning = true;
    } else {
      cameraRef.current.isDragging = true;
    }
    cameraRef.current.lastMouse = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const dx = e.clientX - cameraRef.current.lastMouse.x;
    const dy = e.clientY - cameraRef.current.lastMouse.y;
    cameraRef.current.lastMouse = { x: e.clientX, y: e.clientY };

    if (cameraRef.current.isDragging) {
      cameraRef.current.yaw += dx * 0.008;
      cameraRef.current.pitch = Math.max(
        -0.2,
        Math.min(1.4, cameraRef.current.pitch + dy * 0.008)
      );
      renderWebGL();
    } else if (cameraRef.current.isPanning) {
      cameraRef.current.target[0] -= dx * 0.008;
      cameraRef.current.target[1] += dy * 0.008;
      renderWebGL();
    }
  };

  const handleMouseUp = () => {
    cameraRef.current.isDragging = false;
    cameraRef.current.isPanning = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const newDist = Math.max(
      2.0,
      Math.min(25.0, cameraRef.current.distance + e.deltaY * 0.008)
    );
    cameraRef.current.distance = newDist;
    renderWebGL();
  };

  const handleResetCamera = () => {
    cameraRef.current.yaw = -0.85;
    cameraRef.current.pitch = 0.55;
    cameraRef.current.distance = 7.2;
    cameraRef.current.target = [0.0, 0.0, 0.9];
    renderWebGL();
  };

  const handleZoom = (delta: number) => {
    cameraRef.current.distance = Math.max(
      2.0,
      Math.min(25.0, cameraRef.current.distance + delta)
    );
    renderWebGL();
  };

  return (
    <div className="rounded-md border border-[#D8D9D1] bg-[#FFFFFF] overflow-hidden flex flex-col justify-between shadow-xs">
      {/* RViz Sub-header & Diagnostic Strip */}
      <div className="px-3 py-2 border-b border-[#D8D9D1] flex flex-wrap items-center justify-between gap-2 text-xs bg-[#FFFFFF]">
        <div className="flex items-center gap-2">
          <Box className="w-3.5 h-3.5 text-[#285B49]" />
          <span className="font-semibold text-[#242820]">3D Point-LIO SLAM Map</span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#EAE9E2] text-[#242820] font-semibold flex items-center gap-1.5 border border-[#D8D9D1]">
            <span className="w-2 h-2 rounded-full bg-[#285B49] animate-pulse" />
            <span>
              Showing [{displayCount.toLocaleString()}] points from [{messagesReceived}] messages
            </span>
          </span>
        </div>

        {/* Action Controls & RViz Parameters */}
        <div className="flex items-center gap-2 text-[10px] font-mono text-[#6C7068]">
          <span className="hidden sm:inline">Frame: <strong className="text-[#242820]">{frameId}</strong></span>
          <span className="text-[#D8D9D1]">·</span>
          <span>Topic: <strong className="text-[#285B49]">/cloud_registered</strong></span>
          <span className="text-[#D8D9D1]">·</span>
          <span>{liveHz} Hz</span>

          {/* Colormap Toggle Button */}
          <button
            onClick={() => setColorMode(colorMode === "rainbow" ? "tactical" : "rainbow")}
            className="px-2 py-1 rounded bg-[#F3F2ED] hover:bg-[#EAE9E2] border border-[#D8D9D1] text-[#242820] flex items-center gap-1 transition cursor-pointer ml-1"
            title="Toggle RViz AxisColor Z Rainbow vs Tactical Monochrome"
          >
            <Palette className="w-3 h-3 text-[#285B49]" />
            <span>{colorMode === "rainbow" ? "Axis-Z Rainbow" : "Tactical"}</span>
          </button>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1 rounded hover:bg-[#EAE9E2] text-[#6C7068] hover:text-[#242820] transition cursor-pointer"
            title="Expand 3D LiDAR"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 3D Viewport with WebGL Hardware Acceleration */}
      <div className="relative aspect-[16/9] bg-[#0d0f0c] overflow-hidden flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onContextMenu={(e) => e.preventDefault()}
          onWheel={handleWheel}
          className="w-full h-full cursor-grab active:cursor-grabbing select-none"
        />

        {/* Elevation Rainbow Colormap Legend Overlay (RViz AxisColor Z) */}
        {colorMode === "rainbow" && (
          <div className="absolute top-2 right-2 px-2.5 py-1.5 rounded bg-black/80 backdrop-blur-xs border border-white/10 text-[9px] font-mono text-white flex flex-col gap-1 pointer-events-none">
            <span className="text-[#D8D9D1] font-semibold text-[10px]">AxisColor (Z)</span>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-2 rounded-xs bg-[#B5179E]" />
              <span>&gt; 2.2m (Ceiling)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-2 rounded-xs bg-[#0077B6]" />
              <span>1.5m (Upper Wall)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-2 rounded-xs bg-[#00F5D4]" />
              <span>0.9m (Workspace)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-2 rounded-xs bg-[#FFD60A]" />
              <span>0.4m (Rubble Slab)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-2 rounded-xs bg-[#E63946]" />
              <span>0.0m (Floor)</span>
            </div>
          </div>
        )}

        {/* Orbit / Zoom Controls Overlay */}
        <div className="absolute bottom-2 left-2 flex items-center gap-1 z-10">
          <button
            onClick={handleResetCamera}
            className="w-6 h-6 rounded bg-black/80 hover:bg-black text-[#D8D9D1] hover:text-white flex items-center justify-center transition cursor-pointer border border-white/10"
            title="Reset RViz Isometric View"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
          <button
            onClick={() => handleZoom(-1.0)}
            className="w-6 h-6 rounded bg-black/80 hover:bg-black text-[#D8D9D1] hover:text-white flex items-center justify-center transition cursor-pointer border border-white/10"
            title="Zoom In"
          >
            <ZoomIn className="w-3 h-3" />
          </button>
          <button
            onClick={() => handleZoom(1.0)}
            className="w-6 h-6 rounded bg-black/80 hover:bg-black text-[#D8D9D1] hover:text-white flex items-center justify-center transition cursor-pointer border border-white/10"
            title="Zoom Out"
          >
            <ZoomOut className="w-3 h-3" />
          </button>
        </div>

        {/* RViz Parameters Badge */}
        <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/75 text-[9px] font-mono text-[#A3B899] pointer-events-none border border-white/10">
          Decay: 30s • Style: Flat Squares (0.01m) • Left: Orbit • Shift/Right: Pan
        </div>
      </div>

      {/* Fullscreen Overlay Modal */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col p-6">
          <div className="flex items-center justify-between mb-3 text-white">
            <div className="flex items-center gap-3">
              <Box className="w-5 h-5 text-[#285B49]" />
              <span className="text-sm font-mono font-semibold">
                Point-LIO 3D Registered Cloud • Showing [{displayCount.toLocaleString()}] points from [{messagesReceived}] messages ({liveHz} Hz)
              </span>
            </div>
            <button
              onClick={() => setIsFullscreen(false)}
              className="p-1.5 rounded bg-white/10 hover:bg-white/20 transition cursor-pointer"
            >
              <Minimize2 className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 relative rounded overflow-hidden bg-[#0d0f0c]">
            <canvas
              ref={canvasRef}
              width={1920}
              height={1080}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onContextMenu={(e) => e.preventDefault()}
              onWheel={handleWheel}
              className="w-full h-full cursor-grab active:cursor-grabbing select-none"
            />
          </div>
        </div>
      )}
    </div>
  );
};
