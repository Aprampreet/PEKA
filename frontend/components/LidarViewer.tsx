"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  RotateCcw,
  Box,
  Maximize2,
  Minimize2,
  Crosshair,
  Compass,
  Navigation,
  Scan,
  Radio,
  Download,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { parsePCD, ParsedPCD } from "../lib/pcdParser";
import { useDashboard } from "../lib/DashboardContext";
import { api } from "../lib/api";

interface LidarViewerProps {
  selectedCandidateCoords?: { x: number; y: number; z: number } | null;
  pcdUrl?: string;
}

const PCD_CAPTURE_SECONDS = 30;

export const LidarViewer: React.FC<LidarViewerProps> = ({
  selectedCandidateCoords,
  pcdUrl = "/map.pcd",
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const pointsMeshRef = useRef<THREE.Points | null>(null);
  const robotGroupRef = useRef<THREE.Group | null>(null);
  const lidarSweepMeshRef = useRef<THREE.Mesh | null>(null);
  const trajectoryLineRef = useRef<THREE.Line | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  const { mapData, robotStatus, robotInfo } = useDashboard();

  // State
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadProgress, setLoadProgress] = useState<number>(0);
  const [pointCount, setPointCount] = useState<number>(0);
  const [pointSize, setPointSize] = useState<number>(0.06);
  const [isFollowingRobot, setIsFollowingRobot] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [cameraPreset, setCameraPreset] = useState<"orbit" | "topdown" | "follow">("orbit");
  const [mapBounds, setMapBounds] = useState<{
    min: [number, number, number];
    max: [number, number, number];
    center: [number, number, number];
    size: [number, number, number];
  } | null>(null);

  // Live Continuous PCD Auto-Update State (10-second ROS 2 Point-LIO SLAM captures)
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(true);
  const [isCapturingPcd, setIsCapturingPcd] = useState<boolean>(false);
  const [captureSecondsLeft, setCaptureSecondsLeft] = useState<number>(PCD_CAPTURE_SECONDS);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [lastCaptureInfo, setLastCaptureInfo] = useState<{
    timestamp: string;
    points: number;
    frameId: string;
    sizeBytes: number;
    source: string;
  } | null>(null);
  const [rawPcdBlobUrl, setRawPcdBlobUrl] = useState<string | null>(null);
  const captureAbortRef = useRef<AbortController | null>(null);
  const isCapturingRef = useRef<boolean>(false);

  const [livePose, setLivePose] = useState<{ x: number; y: number; z: number; yawDeg: number }>({
    x: 0,
    y: 0,
    z: 0.15,
    yawDeg: 0,
  });

  const parsedPCDRef = useRef<ParsedPCD | null>(null);
  const trajectoryCoordsRef = useRef<number[]>([]);

  // Apply parsed PCD buffer to Three.js scene
  const applyParsedPCD = useCallback(
    (parsed: ParsedPCD, recenterCamera: boolean = false) => {
      parsedPCDRef.current = parsed;
      setPointCount(parsed.pointCount);
      setMapBounds({
        min: parsed.min,
        max: parsed.max,
        center: parsed.center,
        size: parsed.size,
      });

      if (sceneRef.current) {
        if (pointsMeshRef.current) {
          sceneRef.current.remove(pointsMeshRef.current);
          pointsMeshRef.current.geometry.dispose();
          if (Array.isArray(pointsMeshRef.current.material)) {
            pointsMeshRef.current.material.forEach((m) => m.dispose());
          } else {
            pointsMeshRef.current.material.dispose();
          }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(parsed.positions, 3));
        geometry.setAttribute("color", new THREE.BufferAttribute(parsed.colors, 3));

        const material = new THREE.PointsMaterial({
          size: pointSize,
          vertexColors: true,
          sizeAttenuation: true,
          transparent: true,
          opacity: 0.95,
        });

        const points = new THREE.Points(geometry, material);
        sceneRef.current.add(points);
        pointsMeshRef.current = points;

        if (recenterCamera && cameraRef.current && controlsRef.current) {
          const [cx, cy, cz] = parsed.center;
          controlsRef.current.target.set(cx, cy, cz);
          cameraRef.current.position.set(cx - 30, cy - 38, cz + 26);
          controlsRef.current.update();
        }
      }
    },
    [pointSize]
  );

  // 1. Fetch & Parse PCD file (Original Multi-Color RViz Jet Spectrum)
  const loadPcdFile = useCallback(
    async (url: string) => {
      setIsLoading(true);
      setLoadProgress(15);
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
        }

        setLoadProgress(45);
        const arrayBuffer = await response.arrayBuffer();

        setLoadProgress(75);
        const parsed = parsePCD(arrayBuffer);
        applyParsedPCD(parsed, true);

        setLoadProgress(100);
      } catch (err) {
        console.error("Error loading PCD file:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [applyParsedPCD]
  );

  // 10-Second Live PCD Capture Handler
  const handleCapturePcd = useCallback(async () => {
    if (isCapturingRef.current) return;
    isCapturingRef.current = true;
    setIsCapturingPcd(true);
    setCaptureSecondsLeft(PCD_CAPTURE_SECONDS);
    setCaptureError(null);

    const controller = new AbortController();
    captureAbortRef.current = controller;

    // Countdown interval
    const interval = setInterval(() => {
      setCaptureSecondsLeft((prev) => (prev > 1 ? prev - 1 : 1));
    }, 1000);

    try {
      const result = await api.captureLidarPcd(controller.signal);
      clearInterval(interval);

      if (result?.buffer) {
        // Create downloadable ObjectURL
        const blob = new Blob([result.buffer], { type: "application/vnd.pcd" });
        const blobUrl = URL.createObjectURL(blob);
        setRawPcdBlobUrl(blobUrl);

        // Parse and apply directly to 3D scene in real time
        const parsed = parsePCD(result.buffer);
        applyParsedPCD(parsed, false);

        setLastCaptureInfo({
          timestamp: new Date().toLocaleTimeString(),
          points: parsed.pointCount,
          frameId: result.frameId,
          sizeBytes: result.sizeBytes,
          source: result.source,
        });
      }
    } catch (err: unknown) {
      clearInterval(interval);
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("AbortError")) {
        setCaptureError(msg || "Failed to capture 10s PCD from LiDAR topic.");
      }
    } finally {
      clearInterval(interval);
      isCapturingRef.current = false;
      setIsCapturingPcd(false);
      captureAbortRef.current = null;
    }
  }, [applyParsedPCD]);

  // Continuous Auto-Update Loop
  useEffect(() => {
    let isCancelled = false;
    let loopTimeout: NodeJS.Timeout | null = null;

    const cycle = async () => {
      if (isCancelled || !autoSyncEnabled) return;
      await handleCapturePcd();
      if (isCancelled || !autoSyncEnabled) return;

      // 2.0s cooldown before starting next 10s capture
      loopTimeout = setTimeout(() => {
        if (!isCancelled && autoSyncEnabled) {
          cycle();
        }
      }, 2000);
    };

    if (autoSyncEnabled) {
      loopTimeout = setTimeout(() => {
        cycle();
      }, 2000);
    }

    return () => {
      isCancelled = true;
      if (loopTimeout) clearTimeout(loopTimeout);
      if (captureAbortRef.current) {
        captureAbortRef.current.abort();
      }
    };
  }, [autoSyncEnabled, handleCapturePcd]);

  const handleCancelCapture = () => {
    if (captureAbortRef.current) {
      captureAbortRef.current.abort();
    }
  };

  const handleDownloadPcd = () => {
    const url = rawPcdBlobUrl || pcdUrl;
    const link = document.createElement("a");
    link.href = url;
    link.download = `cloud_capture_${Date.now()}.pcd`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // Dynamic point size update without reloading geometry
  useEffect(() => {
    if (pointsMeshRef.current && pointsMeshRef.current.material) {
      (pointsMeshRef.current.material as THREE.PointsMaterial).size = pointSize;
    }
  }, [pointSize]);

  // 2. Initialize Three.js Scene, Camera, Renderer, Controls
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 640;
    const height = container.clientHeight || 400;

    // Dark Stage Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e1117); // Dark clean navy-charcoal background
    sceneRef.current = scene;

    // Camera (Z is UP to strictly match Point-LIO / ROS 2 coordinate frame)
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 500);
    camera.up.set(0, 0, 1);
    camera.position.set(-20, -32, 22);
    cameraRef.current = camera;

    // WebGL Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.innerHTML = "";
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;
    controls.maxPolarAngle = Math.PI - 0.02;
    controls.minDistance = 1.0;
    controls.maxDistance = 280;
    controlsRef.current = controls;

    // Tactical Ground Reference Grid
    const groundZ = -1.9;
    const gridHelper = new THREE.GridHelper(100, 50, 0x06b6d4, 0x1e293b);
    gridHelper.rotation.x = Math.PI / 2;
    gridHelper.position.z = groundZ;
    scene.add(gridHelper);

    // Glowing Coordinate Origin Axes (X: Red, Y: Green, Z: Blue)
    const axes = new THREE.AxesHelper(3.5);
    axes.position.set(0, 0, groundZ + 0.03);
    scene.add(axes);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.75);
    dirLight.position.set(15, 25, 35);
    scene.add(dirLight);

    // ==========================================
    // 3. Construct 3D Robot & LiDAR Marker
    // ==========================================
    const robotGroup = new THREE.Group();
    robotGroupRef.current = robotGroup;

    // Base Pulsing Sonar Ring 1
    const haloGeo1 = new THREE.RingGeometry(0.55, 0.82, 36);
    const haloMat1 = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const haloMesh1 = new THREE.Mesh(haloGeo1, haloMat1);
    haloMesh1.name = "halo1";
    robotGroup.add(haloMesh1);

    // Robot Armored Chassis Box
    const bodyGeo = new THREE.BoxGeometry(0.72, 0.52, 0.28);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.3,
      metalness: 0.7,
    });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.z = 0.24;
    robotGroup.add(bodyMesh);

    // Rotating LiDAR Sensor Turret
    const domeGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.18, 28);
    const domeMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x0891b2,
      emissiveIntensity: 0.9,
    });
    const domeMesh = new THREE.Mesh(domeGeo, domeMat);
    domeMesh.name = "lidarDome";
    domeMesh.rotation.x = Math.PI / 2;
    domeMesh.position.z = 0.52;
    robotGroup.add(domeMesh);

    // Forward Direction Pointer Arrow (Cyan)
    const arrowGeo = new THREE.ConeGeometry(0.18, 0.48, 16);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
    arrowMesh.rotation.z = -Math.PI / 2;
    arrowMesh.rotation.x = Math.PI / 2;
    arrowMesh.position.set(0.68, 0, 0.24);
    robotGroup.add(arrowMesh);

    // Real-Time 360° LiDAR Dynamic Sweeping Scan Fan
    const sweepGeo = new THREE.RingGeometry(0.5, 6.0, 32, 1, 0, Math.PI / 4);
    const sweepMat = new THREE.MeshBasicMaterial({
      color: 0x06b6d4,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
    });
    const sweepMesh = new THREE.Mesh(sweepGeo, sweepMat);
    sweepMesh.name = "lidarSweep";
    sweepMesh.position.z = 0.52;
    robotGroup.add(sweepMesh);
    lidarSweepMeshRef.current = sweepMesh;

    scene.add(robotGroup);

    // Trajectory Polyline (Cyan)
    const trajGeo = new THREE.BufferGeometry();
    const trajMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 2,
      transparent: true,
      opacity: 0.9,
    });
    const trajLine = new THREE.Line(trajGeo, trajMat);
    trajectoryLineRef.current = trajLine;
    scene.add(trajLine);

    // Load PCD
    loadPcdFile(pcdUrl);

    // Animation Loop
    const startTime = performance.now();
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);

      const elapsedTime = (performance.now() - startTime) * 0.001;

      // Pulsate ground sonar halo
      const halo1 = robotGroup.getObjectByName("halo1") as THREE.Mesh;
      if (halo1) {
        const scale1 = 1.0 + Math.sin(elapsedTime * 4.0) * 0.15;
        halo1.scale.set(scale1, scale1, 1);
        (halo1.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(elapsedTime * 4.0) * 0.35;
      }

      // Rotate LiDAR Sensor Turret & Sweeping Fan (Simulates 10 Hz rotation)
      const dome = robotGroup.getObjectByName("lidarDome") as THREE.Mesh;
      if (dome) {
        dome.rotation.y = elapsedTime * 8.0;
      }
      if (lidarSweepMeshRef.current) {
        lidarSweepMeshRef.current.rotation.z = elapsedTime * 6.28;
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize Observer
    const resizeObserver = new ResizeObserver(() => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0) {
        cameraRef.current.aspect = w / h;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(w, h);
      }
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
      controls.dispose();
      renderer.dispose();
    };
  }, [loadPcdFile, pcdUrl]);

  // 3. Update Point Size
  useEffect(() => {
    if (!pointsMeshRef.current) return;
    (pointsMeshRef.current.material as THREE.PointsMaterial).size = pointSize;
  }, [pointSize]);

  // 4. Live LiDAR / Robot Tracking Synchronization
  useEffect(() => {
    let animId: any;
    let t = 0;

    const updatePose = () => {
      t += 0.025;

      let x = 0;
      let y = 0;
      let z = 0.05;
      let yawDeg = 0;

      // Real or smooth simulated disaster-patrol path
      if (mapData?.simulated_robot_pose) {
        x = mapData.simulated_robot_pose.x;
        y = mapData.simulated_robot_pose.y;
        yawDeg = mapData.simulated_robot_pose.yaw_deg;
      } else {
        x = Math.sin(t * 0.35) * 8.5 - 2.0;
        y = Math.cos(t * 0.28) * 12.5 - 5.0;
        z = -0.15 + Math.sin(t * 0.18) * 0.08;
        yawDeg = (Math.atan2(Math.cos(t * 0.35) * 3.0, -Math.sin(t * 0.28) * 3.5) * 180) / Math.PI;
      }

      setLivePose({ x, y, z, yawDeg });

      // Update 3D Robot Marker position & orientation
      if (robotGroupRef.current) {
        robotGroupRef.current.position.set(x, y, z);
        robotGroupRef.current.rotation.z = (yawDeg * Math.PI) / 180;
      }

      // Record Breadcrumb Trajectory
      const trajCoords = trajectoryCoordsRef.current;
      const lastLen = trajCoords.length;
      if (
        lastLen === 0 ||
        Math.hypot(x - trajCoords[lastLen - 3], y - trajCoords[lastLen - 2]) > 0.3
      ) {
        trajCoords.push(x, y, z + 0.05);
        if (trajCoords.length > 4000) {
          trajCoords.splice(0, 3);
        }

        if (trajectoryLineRef.current) {
          trajectoryLineRef.current.geometry.setAttribute(
            "position",
            new THREE.Float32BufferAttribute(trajCoords, 3)
          );
          trajectoryLineRef.current.geometry.attributes.position.needsUpdate = true;
        }
      }

      // Camera Follow Mode
      if (isFollowingRobot && controlsRef.current && cameraRef.current) {
        controlsRef.current.target.set(x, y, z);
      }

      animId = requestAnimationFrame(updatePose);
    };

    animId = requestAnimationFrame(updatePose);
    return () => cancelAnimationFrame(animId);
  }, [mapData, isFollowingRobot]);

  // Camera Presets
  const resetCamera = () => {
    if (!controlsRef.current || !cameraRef.current || !parsedPCDRef.current) return;
    const [cx, cy, cz] = parsedPCDRef.current.center;
    controlsRef.current.target.set(cx, cy, cz);
    cameraRef.current.position.set(cx - 30, cy - 38, cz + 26);
    controlsRef.current.update();
    setIsFollowingRobot(false);
    setCameraPreset("orbit");
  };

  const setTopDownView = () => {
    if (!controlsRef.current || !cameraRef.current || !parsedPCDRef.current) return;
    const [cx, cy, cz] = parsedPCDRef.current.center;
    controlsRef.current.target.set(cx, cy, cz);
    cameraRef.current.position.set(cx, cy, cz + 72);
    controlsRef.current.update();
    setIsFollowingRobot(false);
    setCameraPreset("topdown");
  };

  const focusOnRobot = () => {
    if (!controlsRef.current || !cameraRef.current) return;
    controlsRef.current.target.set(livePose.x, livePose.y, livePose.z);
    cameraRef.current.position.set(livePose.x - 7, livePose.y - 8, livePose.z + 5.5);
    controlsRef.current.update();
    setIsFollowingRobot(true);
    setCameraPreset("follow");
  };

  return (
    <div
      className={`relative rounded-lg border border-[#D8D9D1] bg-[#0E1117] overflow-hidden flex flex-col shadow-lg ${
        isFullscreen ? "fixed inset-0 z-50 rounded-none border-none" : "w-full"
      }`}
    >
      {/* 1. Ultra-Sleek Glassmorphic Header Toolbar */}
      <div className="px-3 py-2 bg-[#161B22]/95 border-b border-[#21262D] flex items-center justify-between gap-3 z-10 backdrop-blur-md">
        {/* Left: Streamlined Title & Live Sync Status */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 font-mono">
            <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
            <span className="text-xs font-semibold text-white tracking-wide uppercase">
              3D LiDAR Map
            </span>
          </div>

          <div className="h-3 w-px bg-slate-700 hidden sm:block" />

          {/* Auto-Sync Toggle Badge */}
          <button
            onClick={() => setAutoSyncEnabled((prev) => !prev)}
            className={`px-2 py-0.5 rounded-full text-[10px] font-mono transition cursor-pointer flex items-center gap-1.5 border ${
              autoSyncEnabled
                ? "bg-emerald-950/60 border-emerald-500/40 text-emerald-300"
                : "bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200"
            }`}
            title={
              autoSyncEnabled
                ? "Continuous 3D sync active. Click to pause."
                : "Sync paused. Click to resume continuous updates."
            }
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                autoSyncEnabled ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
              }`}
            />
            <span>
              {autoSyncEnabled
                ? isCapturingPcd
                  ? captureSecondsLeft > 1
                    ? `Syncing (${captureSecondsLeft}s)`
                    : "Compiling Cloud..."
                  : "Live Sync"
                : "Sync Paused"}
            </span>
          </button>
        </div>

        {/* Right: Unified Segmented View Controls & Actions */}
        <div className="flex items-center gap-1.5">
          {/* Segmented Camera Presets */}
          <div className="flex items-center p-0.5 rounded-md bg-[#0D1117] border border-[#30363D]">
            <button
              onClick={resetCamera}
              className={`px-2 py-1 rounded text-[10px] font-mono transition cursor-pointer ${
                cameraPreset === "orbit"
                  ? "bg-cyan-500/20 text-cyan-300 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="3D Isometric Overview"
            >
              3D
            </button>
            <button
              onClick={setTopDownView}
              className={`px-2 py-1 rounded text-[10px] font-mono transition cursor-pointer ${
                cameraPreset === "topdown"
                  ? "bg-cyan-500/20 text-cyan-300 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="2D Top-Down View"
            >
              Top
            </button>
            <button
              onClick={focusOnRobot}
              className={`px-2 py-1 rounded text-[10px] font-mono transition cursor-pointer flex items-center gap-1 ${
                isFollowingRobot
                  ? "bg-cyan-500/20 text-cyan-300 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
              title="Follow Rover Marker"
            >
              <Crosshair className="w-2.5 h-2.5 text-cyan-400" />
              <span>Follow</span>
            </button>
          </div>

          <div className="h-3 w-px bg-slate-800" />

          {/* Quick Point Size Cycle */}
          <button
            onClick={() => setPointSize((prev) => (prev <= 0.035 ? 0.12 : prev - 0.025))}
            className="px-2 py-1 rounded-md border border-[#30363D] bg-[#21262D] text-[10px] font-mono text-slate-300 hover:text-white cursor-pointer"
            title="Cycle Point Size"
          >
            {pointSize.toFixed(3)}m
          </button>

          {/* Instant Sync */}
          <button
            onClick={handleCapturePcd}
            disabled={isCapturingPcd}
            className="p-1.5 rounded-md border border-[#30363D] bg-[#21262D] text-slate-300 hover:text-white hover:border-slate-500 transition cursor-pointer disabled:opacity-40"
            title="Force immediate 10s cloud sync"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCapturingPcd ? "animate-spin text-emerald-400" : ""}`} />
          </button>

          {/* Export PCD */}
          <button
            onClick={handleDownloadPcd}
            className="p-1.5 rounded-md border border-[#30363D] bg-[#21262D] text-slate-300 hover:text-white hover:border-slate-500 transition cursor-pointer"
            title="Download .pcd file"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {/* Fullscreen */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-md border border-[#30363D] bg-[#21262D] text-slate-300 hover:text-white hover:border-slate-500 transition cursor-pointer"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen 3D Viewer"}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* 2. Top Edge Ambient Streaming Progress Bar */}
      {isCapturingPcd && (
        <div className="absolute top-[41px] left-0 right-0 h-[2px] bg-slate-800/80 z-20 overflow-hidden pointer-events-none">
          <div
            className="h-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-amber-300 transition-all duration-1000 shadow-[0_0_8px_#34d399]"
            style={{ width: `${((PCD_CAPTURE_SECONDS - captureSecondsLeft) / PCD_CAPTURE_SECONDS) * 100}%` }}
          />
        </div>
      )}

      {/* 3. Three.js Canvas Container */}
      <div
        ref={containerRef}
        className={`relative w-full bg-[#0E1117] ${
          isFullscreen ? "flex-1 h-full" : "h-[340px] lg:h-[420px]"
        }`}
      />

      {/* 4. Floating Robot Coordinates Badge (Top-Left, Clean Glass) */}
      <div className="absolute top-13 left-3 z-10 pointer-events-none flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#161B22]/85 border border-[#30363D] text-[10px] font-mono text-slate-300 backdrop-blur-md shadow-sm">
        <Navigation className="w-3 h-3 text-cyan-400 animate-pulse" />
        <span>X: <strong className="text-white">{livePose.x >= 0 ? `+${livePose.x.toFixed(1)}` : livePose.x.toFixed(1)}m</strong></span>
        <span>Y: <strong className="text-white">{livePose.y >= 0 ? `+${livePose.y.toFixed(1)}` : livePose.y.toFixed(1)}m</strong></span>
        <span className="text-slate-600">|</span>
        <span className="text-amber-400 font-semibold">{livePose.yawDeg.toFixed(0)}°</span>
      </div>

      {/* 5. Minimalist Elevation Scale Strip (Left) */}
      {mapBounds && (
        <div className="absolute top-22 left-3 z-10 hidden sm:flex flex-col items-center gap-1 pointer-events-none bg-[#161B22]/70 px-1 py-1.5 rounded border border-white/5 backdrop-blur-xs">
          <span className="text-[8px] font-mono text-red-400 font-semibold">
            +{mapBounds.max[2].toFixed(0)}
          </span>
          <div className="w-1 h-14 rounded-full bg-gradient-to-t from-blue-600 via-emerald-400 via-yellow-400 to-red-500 opacity-80" />
          <span className="text-[8px] font-mono text-blue-400 font-semibold">
            {mapBounds.min[2].toFixed(0)}
          </span>
        </div>
      )}

      {/* 6. Dismissible Error Toast */}
      {captureError && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 bg-red-950/90 border border-red-500/60 rounded-md px-3 py-1.5 text-xs font-mono text-red-200 flex items-center gap-2.5 backdrop-blur-md shadow-xl max-w-md">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <span className="flex-1 truncate">{captureError}</span>
          <button
            onClick={() => setCaptureError(null)}
            className="text-red-400 hover:text-white font-bold px-1 rounded cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* 7. Initial PCD Loading Spinner */}
      {isLoading && (
        <div className="absolute inset-0 z-30 bg-[#0E1117]/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center space-y-3">
          <div className="w-9 h-9 border-2 border-slate-700 border-t-cyan-400 rounded-full animate-spin" />
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-white tracking-wider uppercase font-mono">
              Loading 3D Point-LIO Cloud
            </h4>
            <p className="text-[11px] text-slate-400 font-mono">
              Unpacking {loadProgress}%...
            </p>
          </div>
        </div>
      )}

      {/* 8. Bottom Minimalist Glass Status Bar */}
      <div className="absolute bottom-2 left-3 right-3 z-10 pointer-events-none flex items-center justify-between text-[10px] font-mono text-slate-400 flex-wrap gap-2">
        <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-[#161B22]/85 border border-[#30363D] backdrop-blur-md shadow-xs">
          <span className="text-cyan-400 font-semibold">{pointCount > 0 ? `${(pointCount / 1000).toFixed(0)}k points` : "Mapping"}</span>
          {mapBounds && (
            <>
              <span className="text-slate-600">·</span>
              <span>{(mapBounds.max[0] - mapBounds.min[0]).toFixed(0)}×{(mapBounds.max[1] - mapBounds.min[1]).toFixed(0)}m</span>
            </>
          )}
          {lastCaptureInfo && (
            <>
              <span className="text-slate-600">·</span>
              <span className="text-emerald-400">Synced {lastCaptureInfo.timestamp}</span>
            </>
          )}
        </div>

        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#161B22]/85 border border-[#30363D] backdrop-blur-md shadow-xs text-slate-400">
          <span>Rotate: Drag</span>
          <span className="text-slate-600">·</span>
          <span>Pan: Right-Click</span>
          <span className="text-slate-600">·</span>
          <span>Zoom: Scroll</span>
        </div>
      </div>
    </div>
  );
};
