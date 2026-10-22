"use client";

import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
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
} from "lucide-react";
import { parsePCD, ParsedPCD, elevationToColor, MapColorPalette } from "../lib/pcdParser";
import { useDashboard } from "../lib/DashboardContext";

interface LidarViewerProps {
  selectedCandidateCoords?: { x: number; y: number; z: number } | null;
  pcdUrl?: string;
}

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
  const [colorMode, setColorMode] = useState<MapColorPalette>("monochrome");
  const [pointSize, setPointSize] = useState<number>(0.065);
  const [isFollowingRobot, setIsFollowingRobot] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [cameraPreset, setCameraPreset] = useState<"orbit" | "topdown" | "follow">("orbit");
  const [mapBounds, setMapBounds] = useState<{
    min: [number, number, number];
    max: [number, number, number];
    center: [number, number, number];
    size: [number, number, number];
  } | null>(null);

  const [livePose, setLivePose] = useState<{ x: number; y: number; z: number; yawDeg: number }>({
    x: 0,
    y: 0,
    z: 0.15,
    yawDeg: 0,
  });

  const parsedPCDRef = useRef<ParsedPCD | null>(null);
  const trajectoryCoordsRef = useRef<number[]>([]);

  // Palettes definition for user selector
  const PALETTES: { id: MapColorPalette; label: string; preview: string; desc: string }[] = useMemo(
    () => [
      {
        id: "monochrome",
        label: "Stealth Gray",
        preview: "from-zinc-900 via-slate-400 to-white",
        desc: "Tactical Charcoal & Silver Monochrome",
      },
      {
        id: "cyber_slate",
        label: "Cyber Slate",
        preview: "from-slate-900 via-sky-600 to-cyan-300",
        desc: "Graphite with Icy Cyan Highlights",
      },
      {
        id: "tactical_amber",
        label: "Amber Alert",
        preview: "from-stone-900 via-amber-600 to-yellow-300",
        desc: "Matte Carbon with Warm Bronze & Gold",
      },
      {
        id: "matrix_emerald",
        label: "Night Vision",
        preview: "from-neutral-900 via-emerald-700 to-emerald-300",
        desc: "Military FLIR Night-Vision Green",
      },
      {
        id: "rainbow",
        label: "RViz Rainbow",
        preview: "from-blue-600 via-emerald-400 to-red-500",
        desc: "Standard Jet Spectrum",
      },
    ],
    []
  );

  // 1. Fetch & Parse PCD file
  const loadPcdFile = useCallback(async (url: string) => {
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
      const parsed = parsePCD(arrayBuffer, colorMode);
      parsedPCDRef.current = parsed;

      setPointCount(parsed.pointCount);
      setMapBounds({
        min: parsed.min,
        max: parsed.max,
        center: parsed.center,
        size: parsed.size,
      });

      // Build Three.js Point Cloud
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
          opacity: 0.96,
        });

        const points = new THREE.Points(geometry, material);
        sceneRef.current.add(points);
        pointsMeshRef.current = points;

        // Position initial camera to view entire facility in heroic isometric angle
        if (cameraRef.current && controlsRef.current) {
          const [cx, cy, cz] = parsed.center;
          controlsRef.current.target.set(cx, cy, cz);
          cameraRef.current.position.set(cx - 30, cy - 38, cz + 26);
          controlsRef.current.update();
        }
      }

      setLoadProgress(100);
    } catch (err) {
      console.error("Error loading PCD file:", err);
    } finally {
      setIsLoading(false);
    }
  }, [colorMode, pointSize]);

  // 2. Initialize Three.js Scene, Camera, Renderer, Controls
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = container.clientWidth || 640;
    const height = container.clientHeight || 400;

    // Tactical Obsidian Scene with Fog
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07080a); // Deep pitch obsidian black
    scene.fog = new THREE.FogExp2(0x07080a, 0.0065); // Atmospheric depth fade
    sceneRef.current = scene;

    // Camera (Z is UP to strictly match Point-LIO / ROS 2 coordinate frame)
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 500);
    camera.up.set(0, 0, 1);
    camera.position.set(-20, -32, 22);
    cameraRef.current = camera;

    // WebGL Renderer with High-DPI support
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
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

    // ==========================================
    // Tactical Ground Reference Grid & Radar Rings
    // ==========================================
    const groundZ = -1.9; // Lowest ground floor level

    // High-tech Tactical Floor Grid (Charcoal & Graphite)
    const gridHelper = new THREE.GridHelper(100, 50, 0x2e3542, 0x141820);
    gridHelper.rotation.x = Math.PI / 2;
    gridHelper.position.z = groundZ;
    scene.add(gridHelper);

    // Concentric Radar Distance Rings (10m, 20m, 30m, 40m, 50m)
    const radarGroup = new THREE.Group();
    radarGroup.name = "radarRings";
    const ringRadii = [10, 20, 30, 40, 50];
    ringRadii.forEach((r, idx) => {
      const ringGeo = new THREE.RingGeometry(r - 0.05, r + 0.05, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: idx % 2 === 0 ? 0x2e3846 : 0x1f2630,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.6,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.z = groundZ + 0.01;
      radarGroup.add(ringMesh);
    });

    // Cardinal Axes on Ground Grid (Subtle Silver & Slate)
    const cardinalMat = new THREE.LineBasicMaterial({ color: 0x3e495a, transparent: true, opacity: 0.7 });
    const cardinalGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-50, 0, groundZ + 0.02),
      new THREE.Vector3(50, 0, groundZ + 0.02),
      new THREE.Vector3(0, -50, groundZ + 0.02),
      new THREE.Vector3(0, 50, groundZ + 0.02),
    ]);
    const cardinalLines = new THREE.LineSegments(cardinalGeo, cardinalMat);
    radarGroup.add(cardinalLines);
    scene.add(radarGroup);

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
    // 3. Construct High-Tech 3D Robot & LiDAR Marker
    // ==========================================
    const robotGroup = new THREE.Group();
    robotGroupRef.current = robotGroup;

    // Base Pulsing Sonar Ring 1
    const haloGeo1 = new THREE.RingGeometry(0.55, 0.82, 36);
    const haloMat1 = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    const haloMesh1 = new THREE.Mesh(haloGeo1, haloMat1);
    haloMesh1.name = "halo1";
    robotGroup.add(haloMesh1);

    // Expanding Sonar Ring 2
    const haloGeo2 = new THREE.RingGeometry(0.85, 1.15, 36);
    const haloMat2 = new THREE.MeshBasicMaterial({
      color: 0x94a3b8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.45,
    });
    const haloMesh2 = new THREE.Mesh(haloGeo2, haloMat2);
    haloMesh2.name = "halo2";
    robotGroup.add(haloMesh2);

    // Robot Armored Chassis Box (Dark Titanium / Gunmetal finish)
    const bodyGeo = new THREE.BoxGeometry(0.72, 0.52, 0.28);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x141820,
      roughness: 0.25,
      metalness: 0.85,
    });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.z = 0.24;
    robotGroup.add(bodyMesh);

    // Chassis Top Armor Plate
    const plateGeo = new THREE.BoxGeometry(0.55, 0.38, 0.06);
    const plateMat = new THREE.MeshStandardMaterial({
      color: 0x222834,
      roughness: 0.3,
      metalness: 0.7,
    });
    const plateMesh = new THREE.Mesh(plateGeo, plateMat);
    plateMesh.position.z = 0.4;
    robotGroup.add(plateMesh);

    // Rotating LiDAR Sensor Turret (Livox / Velodyne style)
    const domeGeo = new THREE.CylinderGeometry(0.14, 0.16, 0.18, 28);
    const domeMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.9,
      roughness: 0.2,
      metalness: 0.8,
    });
    const domeMesh = new THREE.Mesh(domeGeo, domeMat);
    domeMesh.name = "lidarDome";
    domeMesh.rotation.x = Math.PI / 2;
    domeMesh.position.z = 0.52;
    robotGroup.add(domeMesh);

    // Forward Direction Pointer Arrow (Bright Cyan)
    const arrowGeo = new THREE.ConeGeometry(0.18, 0.48, 16);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
    arrowMesh.rotation.z = -Math.PI / 2;
    arrowMesh.rotation.x = Math.PI / 2;
    arrowMesh.position.set(0.68, 0, 0.24);
    robotGroup.add(arrowMesh);

    // Forward LED Searchlights (Twin Cones)
    const spotGeo = new THREE.ConeGeometry(0.8, 3.2, 16, 1, true);
    const spotMat = new THREE.MeshBasicMaterial({
      color: 0xf8fafc,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
    });
    const spotLeft = new THREE.Mesh(spotGeo, spotMat);
    spotLeft.rotation.z = -Math.PI / 2;
    spotLeft.rotation.x = Math.PI / 2;
    spotLeft.position.set(1.9, -0.16, 0.3);
    robotGroup.add(spotLeft);

    const spotRight = new THREE.Mesh(spotGeo, spotMat);
    spotRight.rotation.z = -Math.PI / 2;
    spotRight.rotation.x = Math.PI / 2;
    spotRight.position.set(1.9, 0.16, 0.3);
    robotGroup.add(spotRight);

    // Real-Time 360° LiDAR Dynamic Sweeping Scan Fan
    const sweepGeo = new THREE.RingGeometry(0.5, 6.5, 32, 1, 0, Math.PI / 4);
    const sweepMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
    });
    const sweepMesh = new THREE.Mesh(sweepGeo, sweepMat);
    sweepMesh.name = "lidarSweep";
    sweepMesh.position.z = 0.52;
    robotGroup.add(sweepMesh);
    lidarSweepMeshRef.current = sweepMesh;

    scene.add(robotGroup);

    // Trajectory Polyline (Stealth Silver / Cyan)
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
    let clock = new THREE.Clock();
    const animate = () => {
      animFrameIdRef.current = requestAnimationFrame(animate);

      const elapsedTime = clock.getElapsedTime();

      // Pulsate ground sonar halos
      const halo1 = robotGroup.getObjectByName("halo1") as THREE.Mesh;
      if (halo1) {
        const scale1 = 1.0 + Math.sin(elapsedTime * 4.0) * 0.15;
        halo1.scale.set(scale1, scale1, 1);
        (halo1.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(elapsedTime * 4.0) * 0.35;
      }

      const halo2 = robotGroup.getObjectByName("halo2") as THREE.Mesh;
      if (halo2) {
        const scale2 = 1.0 + Math.cos(elapsedTime * 3.0) * 0.22;
        halo2.scale.set(scale2, scale2, 1);
        (halo2.material as THREE.MeshBasicMaterial).opacity = 0.25 + Math.cos(elapsedTime * 3.0) * 0.2;
      }

      // Rotate LiDAR Sensor Turret & Sweeping Fan (Simulates 10 Hz rotation)
      const dome = robotGroup.getObjectByName("lidarDome") as THREE.Mesh;
      if (dome) {
        dome.rotation.y = elapsedTime * 8.0;
      }
      if (lidarSweepMeshRef.current) {
        lidarSweepMeshRef.current.rotation.z = elapsedTime * 6.28; // Full continuous 360 sweep
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

  // 4. Update Colors when Palette Changes
  useEffect(() => {
    if (!parsedPCDRef.current || !pointsMeshRef.current) return;
    const { positions, min, max, pointCount } = parsedPCDRef.current;
    const colors = new Float32Array(pointCount * 3);

    let cIdx = 0;
    for (let i = 0; i < pointCount; i++) {
      const z = positions[i * 3 + 2];
      const [r, g, b] = elevationToColor(z, min[2], max[2], colorMode);
      colors[cIdx] = r;
      colors[cIdx + 1] = g;
      colors[cIdx + 2] = b;
      cIdx += 3;
    }

    const geom = pointsMeshRef.current.geometry;
    geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geom.attributes.color.needsUpdate = true;
  }, [colorMode]);

  // 5. Update Point Size
  useEffect(() => {
    if (!pointsMeshRef.current) return;
    (pointsMeshRef.current.material as THREE.PointsMaterial).size = pointSize;
  }, [pointSize]);

  // 6. Live LiDAR / Robot Tracking Synchronization
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
      className={`relative rounded-lg border border-[#232832] bg-[#07080a] overflow-hidden flex flex-col shadow-2xl ${
        isFullscreen ? "fixed inset-0 z-50 rounded-none border-none" : "w-full"
      }`}
    >
      {/* 1. Tactical Stealth Header Toolbar */}
      <div className="px-3.5 py-2.5 bg-[#0c0e13]/95 backdrop-blur-md border-b border-[#1f242e] flex items-center justify-between gap-3 z-10 flex-wrap">
        {/* Left: Title & Point Count Badge */}
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-md bg-white/5 border border-white/10 text-cyan-400">
            <Scan className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white tracking-wider uppercase font-mono">
                3D Point-LIO SLAM Cloud
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                {pointCount > 0 ? `${(pointCount / 1000).toFixed(0)}k PTS` : "MAPPING"}
              </span>
            </div>
            <span className="text-[10px] text-zinc-400 font-mono hidden sm:inline">
              Source: map.pcd • ROS 2 /cloud_registered • Z-Up Frame
            </span>
          </div>
        </div>

        {/* Center: Live Robot Coordinates HUD */}
        <div className="flex items-center gap-2.5 px-3 py-1 rounded-md bg-[#12151c] border border-cyan-500/30 text-[11px] font-mono text-cyan-300 shadow-inner">
          <Navigation className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
          <span className="text-zinc-400 font-semibold hidden md:inline">ROBOT POSE:</span>
          <span>X: {livePose.x >= 0 ? `+${livePose.x.toFixed(2)}` : livePose.x.toFixed(2)}m</span>
          <span>Y: {livePose.y >= 0 ? `+${livePose.y.toFixed(2)}` : livePose.y.toFixed(2)}m</span>
          <span>Z: {livePose.z.toFixed(2)}m</span>
          <span className="text-zinc-600">|</span>
          <span className="text-amber-400">{livePose.yawDeg.toFixed(0)}°</span>
        </div>

        {/* Right: Camera Presets & Palette Selector */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Palette Selector Pills */}
          <div className="flex items-center gap-1 p-0.5 rounded-md bg-[#13161f] border border-[#232832]">
            {PALETTES.map((p) => {
              const active = colorMode === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setColorMode(p.id)}
                  title={`${p.label} - ${p.desc}`}
                  className={`px-2 py-1 rounded text-[10px] font-medium font-mono transition-all flex items-center gap-1.5 cursor-pointer ${
                    active
                      ? "bg-white/15 text-white border border-white/25 shadow-sm"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full bg-gradient-to-r ${p.preview}`} />
                  <span className="hidden xl:inline">{p.label}</span>
                </button>
              );
            })}
          </div>

          {/* Camera Preset: Follow Robot */}
          <button
            onClick={focusOnRobot}
            className={`px-2.5 py-1.5 rounded-md border text-[11px] font-mono font-medium transition cursor-pointer flex items-center gap-1.5 ${
              isFollowingRobot
                ? "bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-xs"
                : "border-[#252b37] bg-[#141720] text-zinc-300 hover:text-white hover:border-zinc-500"
            }`}
            title="Lock camera to live robot position"
          >
            <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Follow</span>
          </button>

          {/* Camera Preset: 2D Top-Down */}
          <button
            onClick={setTopDownView}
            className={`p-1.5 rounded-md border text-zinc-300 hover:text-white transition cursor-pointer ${
              cameraPreset === "topdown"
                ? "bg-cyan-500/20 border-cyan-400 text-cyan-300"
                : "border-[#252b37] bg-[#141720] hover:border-zinc-500"
            }`}
            title="Switch to Top-Down 2D Tactical Plan View"
          >
            <Compass className="w-4 h-4" />
          </button>

          {/* Reset Camera */}
          <button
            onClick={resetCamera}
            className="p-1.5 rounded-md border border-[#252b37] bg-[#141720] text-zinc-300 hover:text-white hover:border-zinc-500 transition cursor-pointer"
            title="Reset to 3D Isometric Overview"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Point Size Adjuster */}
          <button
            onClick={() => setPointSize((prev) => (prev <= 0.035 ? 0.12 : prev - 0.025))}
            className="px-2 py-1.5 rounded-md border border-[#252b37] bg-[#141720] text-[10px] font-mono text-zinc-300 hover:text-white cursor-pointer"
            title="Cycle Point Size"
          >
            {pointSize.toFixed(3)}m
          </button>

          {/* Fullscreen */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-md border border-[#252b37] bg-[#141720] text-zinc-300 hover:text-white hover:border-zinc-500 transition cursor-pointer"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen 3D Viewer"}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 2. Three.js Canvas Container */}
      <div
        ref={containerRef}
        className={`relative w-full bg-[#07080a] ${
          isFullscreen ? "flex-1 h-full" : "h-[340px] lg:h-[420px]"
        }`}
      />

      {/* 3. Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-30 bg-[#07080a]/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center space-y-4">
          <div className="relative">
            <div className="w-12 h-12 border-2 border-zinc-700 border-t-cyan-400 rounded-full animate-spin" />
            <Box className="w-5 h-5 text-cyan-400 absolute inset-0 m-auto" />
          </div>
          <div className="space-y-1.5">
            <h4 className="text-sm font-bold text-white tracking-wider uppercase font-mono">
              Parsing 3D Point-LIO SLAM Map
            </h4>
            <p className="text-xs text-zinc-400 font-mono">
              Decompressing 819,405 points from /map.pcd ({loadProgress}%)
            </p>
          </div>
          <div className="w-56 h-1.5 bg-zinc-800 rounded-full overflow-hidden border border-zinc-700">
            <div
              className="h-full bg-gradient-to-r from-zinc-500 via-slate-300 to-white transition-all duration-300"
              style={{ width: `${loadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* 4. Left Elevation Scale Bar (Stealth Black & Gray Gradient) */}
      {mapBounds && (
        <div className="absolute top-16 left-3 z-10 hidden sm:flex flex-col items-center gap-1 pointer-events-none bg-[#0a0d13]/85 p-2 rounded-md border border-[#1f2530] backdrop-blur-xs">
          <span className="text-[9px] font-mono text-zinc-400">
            +{mapBounds.max[2].toFixed(1)}m
          </span>
          <div
            className={`w-2.5 h-28 rounded-xs border border-white/20 shadow-inner ${
              colorMode === "monochrome"
                ? "bg-gradient-to-t from-zinc-900 via-slate-400 to-white"
                : colorMode === "cyber_slate"
                ? "bg-gradient-to-t from-slate-900 via-sky-600 to-cyan-300"
                : colorMode === "tactical_amber"
                ? "bg-gradient-to-t from-stone-900 via-amber-600 to-yellow-300"
                : colorMode === "matrix_emerald"
                ? "bg-gradient-to-t from-neutral-900 via-emerald-700 to-emerald-300"
                : "bg-gradient-to-t from-blue-600 via-emerald-400 to-red-500"
            }`}
          />
          <span className="text-[9px] font-mono text-zinc-400">
            {mapBounds.min[2].toFixed(1)}m
          </span>
          <span className="text-[8px] font-mono text-zinc-500 uppercase tracking-tighter mt-0.5">
            Z-ELEV
          </span>
        </div>
      )}

      {/* 5. Top-Right Tactical Compass & Heading Tag */}
      <div className="absolute top-16 right-3 z-10 pointer-events-none hidden md:flex items-center gap-2 bg-[#0a0d13]/85 px-2.5 py-1.5 rounded-md border border-[#1f2530] backdrop-blur-xs">
        <Compass className="w-4 h-4 text-cyan-400" />
        <div className="text-[10px] font-mono text-zinc-300 leading-tight">
          <div>NORTH ALIGNED</div>
          <div className="text-zinc-500 text-[9px]">Y+ GRID FORWARD</div>
        </div>
      </div>

      {/* 6. Bottom Tactical HUD Bar */}
      <div className="absolute bottom-2.5 left-3 right-3 z-10 flex items-center justify-between gap-3 pointer-events-none flex-wrap">
        {/* Left: Spatial Metrics Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="px-2.5 py-1 rounded bg-[#0a0d13]/90 border border-[#1f2530] text-[10px] font-mono text-cyan-400 flex items-center gap-2 backdrop-blur-xs">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span>THREE.JS v0.180 • ORBIT ACTIVE</span>
          </div>

          {mapBounds && (
            <div className="hidden lg:flex px-2.5 py-1 rounded bg-[#0a0d13]/90 border border-[#1f2530] text-[10px] font-mono text-zinc-300 backdrop-blur-xs">
              <span className="text-zinc-500 mr-1.5">BOUNDS:</span>
              <span>
                {(mapBounds.max[0] - mapBounds.min[0]).toFixed(1)}m ×{" "}
                {(mapBounds.max[1] - mapBounds.min[1]).toFixed(1)}m ×{" "}
                {(mapBounds.max[2] - mapBounds.min[2]).toFixed(1)}m
              </span>
            </div>
          )}

          <div className="hidden xl:flex px-2.5 py-1 rounded bg-[#0a0d13]/90 border border-[#1f2530] text-[10px] font-mono text-zinc-400 backdrop-blur-xs">
            THEME: <span className="text-zinc-200 font-semibold ml-1 capitalize">{colorMode.replace("_", " ")}</span>
          </div>
        </div>

        {/* Right: Controls Guide */}
        <div className="text-[10px] font-mono text-zinc-400 bg-[#0a0d13]/90 px-3 py-1 rounded border border-[#1f2530] backdrop-blur-xs">
          ROTATE: <span className="text-zinc-200">Drag</span> • PAN: <span className="text-zinc-200">Right-Click</span> • ZOOM: <span className="text-zinc-200">Scroll</span>
        </div>
      </div>
    </div>
  );
};
