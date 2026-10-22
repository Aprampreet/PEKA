"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  Crosshair,
  Layers,
  Maximize2,
  Minimize2,
  Radio,
  Shield,
} from "lucide-react";
import { MapData, ObservationRecord } from "../lib/types";

interface TeslaMap3DProps {
  mapData: MapData | null;
  isLoading?: boolean;
  observations?: ObservationRecord[];
  selectedObservationId?: string | null;
  onSelectObservation?: (obs: ObservationRecord) => void;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

export const TeslaMap3D: React.FC<TeslaMap3DProps> = ({
  mapData,
  isLoading = false,
  observations = [],
  selectedObservationId = null,
  onSelectObservation,
  isExpanded = false,
  onToggleExpand,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Minimal UI State
  const [activeView, setActiveView] = useState<"free" | "top" | "chase">("free");
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showLayersMenu, setShowLayersMenu] = useState<boolean>(false);
  const [selectedObs, setSelectedObs] = useState<ObservationRecord | null>(null);
  const [hoveredObs, setHoveredObs] = useState<ObservationRecord | null>(null);

  // Layer Visibility
  const [showObstacles, setShowObstacles] = useState<boolean>(true);
  const [showPointCloud, setShowPointCloud] = useState<boolean>(true);
  const [showTrajectory, setShowTrajectory] = useState<boolean>(true);
  const [showObservations, setShowObservations] = useState<boolean>(true);

  // Telemetry Readout
  const [speedVal, setSpeedVal] = useState<number>(0.85);
  const [coords, setCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Three.js Core Refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const animFrameIdRef = useRef<number | null>(null);

  // Scene Objects
  const roverGroupRef = useRef<THREE.Group | null>(null);
  const lidarPuckRef = useRef<THREE.Group | null>(null);
  const wheelsRef = useRef<THREE.Group[]>([]);
  const obstacleMeshRef = useRef<THREE.InstancedMesh | null>(null);
  const pointCloudRef = useRef<THREE.Points | null>(null);
  const trajectoryLineRef = useRef<THREE.Line | null>(null);
  const sonarWavesRef = useRef<THREE.Mesh[]>([]);
  const beaconGroupRef = useRef<THREE.Group | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseCoordsRef = useRef<THREE.Vector2>(new THREE.Vector2(-999, -999));

  // State refs to prevent scene re-mounting
  const onSelectObservationRef = useRef(onSelectObservation);
  onSelectObservationRef.current = onSelectObservation;

  const showObstaclesRef = useRef(showObstacles);
  showObstaclesRef.current = showObstacles;

  const showPointCloudRef = useRef(showPointCloud);
  showPointCloudRef.current = showPointCloud;

  const showTrajectoryRef = useRef(showTrajectory);
  showTrajectoryRef.current = showTrajectory;

  const showObservationsRef = useRef(showObservations);
  showObservationsRef.current = showObservations;

  // Rover target & visual pose tracking
  const targetRoverPoseRef = useRef<{ x: number; y: number; z: number; yaw: number }>({
    x: 0,
    y: 0,
    z: 0.08,
    yaw: 0.785,
  });
  const currentRoverPoseRef = useRef<{ x: number; y: number; z: number; yaw: number }>({
    x: 0,
    y: 0,
    z: 0.08,
    yaw: 0.785,
  });

  // Sync simulated robot pose smoothly
  useEffect(() => {
    if (mapData?.simulated_robot_pose) {
      const pose = mapData.simulated_robot_pose;
      targetRoverPoseRef.current.x = pose.x;
      targetRoverPoseRef.current.y = pose.y;
      targetRoverPoseRef.current.yaw = (pose.yaw_deg * Math.PI) / 180;
      setCoords({ x: pose.x, y: pose.y });
    }
  }, [mapData]);

  // Sync selected observation
  useEffect(() => {
    if (selectedObservationId) {
      const match = observations.find((o) => o.id === selectedObservationId);
      if (match) setSelectedObs(match);
    }
  }, [selectedObservationId, observations]);

  // Build Premium, Solid Tesla Cyber-Rover 3D Model
  const buildRoverModel = (): THREE.Group => {
    const rover = new THREE.Group();

    // 0. Soft Ground Contact Shadow (Firmly grounds vehicle onto the asphalt)
    const shadowGeom = new THREE.PlaneGeometry(2.3, 3.4);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x050810,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    const groundShadow = new THREE.Mesh(shadowGeom, shadowMat);
    groundShadow.rotation.x = -Math.PI / 2;
    groundShadow.position.y = 0.01;
    rover.add(groundShadow);

    // 1. Sleek Titanium Cyber-Alloy Hull (Lower, wider, more sculpted stance)
    const hullGeom = new THREE.BoxGeometry(1.68, 0.42, 2.75);
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8, // Titanium silver with realistic specular reflections
      metalness: 0.85,
      roughness: 0.22,
      envMapIntensity: 1.5,
    });
    const hull = new THREE.Mesh(hullGeom, hullMat);
    hull.position.y = 0.38;
    hull.castShadow = true;
    hull.receiveShadow = true;
    rover.add(hull);

    // Front Sloped Nose Hood (Cybertruck angled nose wedge)
    const noseGeom = new THREE.CylinderGeometry(0.55, 0.84, 0.8, 4);
    const noseMat = new THREE.MeshStandardMaterial({
      color: 0x8092a4,
      metalness: 0.9,
      roughness: 0.2,
    });
    const nose = new THREE.Mesh(noseGeom, noseMat);
    nose.rotation.y = Math.PI / 4;
    nose.rotation.x = 0.15;
    nose.position.set(0, 0.44, 0.95);
    nose.castShadow = true;
    rover.add(nose);

    // Dark Carbon Rocker Panels & Underbody Armor
    const underGeom = new THREE.BoxGeometry(1.48, 0.16, 2.6);
    const underMat = new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.9, roughness: 0.5 });
    const under = new THREE.Mesh(underGeom, underMat);
    under.position.y = 0.18;
    rover.add(under);

    // 2. Sculpted Flared Wheel Arches / Fenders
    const fenderGeom = new THREE.BoxGeometry(0.24, 0.22, 0.78);
    const fenderMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 });
    const fenderOffsets = [
      { x: -0.84, z: 0.9 },
      { x: 0.84, z: 0.9 },
      { x: -0.84, z: -0.9 },
      { x: 0.84, z: -0.9 },
    ];
    fenderOffsets.forEach((pos) => {
      const fender = new THREE.Mesh(fenderGeom, fenderMat);
      fender.position.set(pos.x, 0.48, pos.z);
      fender.castShadow = true;
      rover.add(fender);
    });

    // 3. Panoramic Tinted Obsidian Cockpit Canopy
    const cabinGeom = new THREE.CylinderGeometry(0.52, 0.74, 1.4, 4);
    const cabinMat = new THREE.MeshStandardMaterial({
      color: 0x090d16, // Pure smoked glass
      metalness: 0.96,
      roughness: 0.08,
      transparent: true,
      opacity: 0.92,
    });
    const cabin = new THREE.Mesh(cabinGeom, cabinMat);
    cabin.position.set(0, 0.74, -0.12);
    cabin.rotation.y = Math.PI / 4;
    cabin.castShadow = true;
    rover.add(cabin);

    // 4. Four High-Definition Cyber Wheels (Treaded Rubber + 5-Spoke Aero Rim)
    const tireGeom = new THREE.CylinderGeometry(0.33, 0.33, 0.28, 28);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.75, metalness: 0.2 });
    const rimGeom = new THREE.CylinderGeometry(0.22, 0.22, 0.29, 6);
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, metalness: 0.95, roughness: 0.12 });
    const capGeom = new THREE.CylinderGeometry(0.08, 0.08, 0.30, 16);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, metalness: 0.9, roughness: 0.1 });

    const wheelOffsets = [
      { x: -0.92, y: 0.33, z: 0.9 },
      { x: 0.92, y: 0.33, z: 0.9 },
      { x: -0.92, y: 0.33, z: -0.9 },
      { x: 0.92, y: 0.33, z: -0.9 },
    ];

    wheelsRef.current = [];
    wheelOffsets.forEach((pos) => {
      const hub = new THREE.Group();
      hub.position.set(pos.x, pos.y, pos.z);

      const tire = new THREE.Mesh(tireGeom, tireMat);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      hub.add(tire);

      const rim = new THREE.Mesh(rimGeom, rimMat);
      rim.rotation.z = Math.PI / 2;
      hub.add(rim);

      const cap = new THREE.Mesh(capGeom, capMat);
      cap.rotation.z = Math.PI / 2;
      hub.add(cap);

      rover.add(hub);
      wheelsRef.current.push(hub);
    });

    // 5. Low-Profile Aerodynamic Roof LiDAR (Clean, integrated, NO UGLY REVOLVING SHIELD)
    const roofMountGeom = new THREE.BoxGeometry(0.5, 0.08, 0.5);
    const roofMountMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85 });
    const roofMount = new THREE.Mesh(roofMountGeom, roofMountMat);
    roofMount.position.set(0, 0.98, -0.1);
    rover.add(roofMount);

    const lidarPuck = new THREE.Group();
    lidarPuck.position.set(0, 1.06, -0.1);

    const puckGeom = new THREE.CylinderGeometry(0.18, 0.18, 0.12, 24);
    const puckMat = new THREE.MeshStandardMaterial({ color: 0x090d16, metalness: 0.92, roughness: 0.1 });
    const puckMesh = new THREE.Mesh(puckGeom, puckMat);
    lidarPuck.add(puckMesh);

    // Glowing Status Ring on LiDAR Puck
    const ringGeom = new THREE.TorusGeometry(0.185, 0.015, 8, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
    const ringMesh = new THREE.Mesh(ringGeom, ringMat);
    ringMesh.rotation.x = Math.PI / 2;
    lidarPuck.add(ringMesh);

    rover.add(lidarPuck);
    lidarPuckRef.current = lidarPuck;

    // 6. Seamless Full-Width Front Horizon LED Light Bar (Tesla Signature)
    const headlightBarGeom = new THREE.BoxGeometry(1.42, 0.05, 0.06);
    const headlightBarMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
    const headlightBar = new THREE.Mesh(headlightBarGeom, headlightBarMat);
    headlightBar.position.set(0, 0.44, 1.38);
    rover.add(headlightBar);

    // Front Forward Road Illumination Patch (Realistic soft light on ground)
    const beamGeom = new THREE.PlaneGeometry(2.4, 5.0);
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    });
    const headlightFloorBeam = new THREE.Mesh(beamGeom, beamMat);
    headlightFloorBeam.rotation.x = -Math.PI / 2;
    headlightFloorBeam.position.set(0, 0.012, 3.8);
    rover.add(headlightFloorBeam);

    // 7. Full-Width Crimson Rear Taillight Bar
    const brakeGeom = new THREE.BoxGeometry(1.48, 0.06, 0.06);
    const brakeMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const brakeBar = new THREE.Mesh(brakeGeom, brakeMat);
    brakeBar.position.set(0, 0.48, -1.38);
    rover.add(brakeBar);

    return rover;
  };

  // Build Solid 3D Extruded Obstacles (InstancedMesh)
  const updateOccupancyPillars = useCallback(
    (scene: THREE.Scene, data: MapData | null) => {
      if (obstacleMeshRef.current) {
        scene.remove(obstacleMeshRef.current);
        obstacleMeshRef.current.geometry.dispose();
        (obstacleMeshRef.current.material as THREE.Material).dispose();
        obstacleMeshRef.current = null;
      }

      if (!data?.grid) return;

      const grid = data.grid;
      const rows = grid.length;
      const cols = grid[0]?.length || 0;
      const cellSize = 0.48;

      let count = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (grid[r][c] === 100) count++;
        }
      }

      if (count === 0) return;

      const boxGeom = new THREE.BoxGeometry(cellSize * 0.94, 1.0, cellSize * 0.94);
      const boxMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        roughness: 0.25,
        metalness: 0.85,
        emissive: 0x0f172a,
      });

      const instancedMesh = new THREE.InstancedMesh(boxGeom, boxMat, count);
      instancedMesh.castShadow = true;
      instancedMesh.receiveShadow = true;

      const dummy = new THREE.Object3D();
      const color = new THREE.Color();
      let index = 0;

      const halfW = (cols * cellSize) / 2;
      const halfH = (rows * cellSize) / 2;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (grid[r][c] === 100) {
            const worldX = c * cellSize - halfW;
            const worldZ = r * cellSize - halfH;

            const hash = Math.abs(Math.sin(c * 12.9898 + r * 78.233));
            const height = 0.45 + hash * 1.15;

            dummy.position.set(worldX, height / 2, worldZ);
            dummy.scale.set(1, height, 1);
            dummy.updateMatrix();

            instancedMesh.setMatrixAt(index, dummy.matrix);

            if (hash > 0.65) {
              color.setHex(0xf59e0b); // Amber rubble
            } else {
              color.setHex(0x334155); // Slate perimeter wall
            }
            instancedMesh.setColorAt(index, color);

            index++;
          }
        }
      }

      instancedMesh.instanceMatrix.needsUpdate = true;
      if (instancedMesh.instanceColor) instancedMesh.instanceColor.needsUpdate = true;
      instancedMesh.visible = showObstaclesRef.current;

      scene.add(instancedMesh);
      obstacleMeshRef.current = instancedMesh;
    },
    []
  );

  // Build Minimal Holographic POI Markers
  const updateObservationBeacons = useCallback(
    (scene: THREE.Scene, obsList: ObservationRecord[]) => {
      if (beaconGroupRef.current) {
        scene.remove(beaconGroupRef.current);
        beaconGroupRef.current.clear();
        beaconGroupRef.current = null;
      }

      const group = new THREE.Group();
      beaconGroupRef.current = group;

      // De-duplicate close observations
      const distinctObs: ObservationRecord[] = [];
      const seenCoords = new Set<string>();

      for (const obs of obsList) {
        const key = `${Math.round(obs.pos_x * 2) / 2},${Math.round(obs.pos_y * 2) / 2}`;
        if (!seenCoords.has(key)) {
          seenCoords.add(key);
          distinctObs.push(obs);
        }
        if (distinctObs.length >= 6) break;
      }

      distinctObs.forEach((obs) => {
        const beacon = new THREE.Group();
        beacon.position.set(obs.pos_x, 0, obs.pos_y);
        beacon.userData = { observation: obs };

        const isConfirmed = obs.review_status === "confirmed";
        const isHazard =
          obs.class_label.toLowerCase().includes("rupture") ||
          obs.class_label.toLowerCase().includes("hazard");
        const beaconColor = isHazard ? 0xef4444 : isConfirmed ? 0x10b981 : 0xf59e0b;

        // Small glowing sphere
        const orbGeom = new THREE.SphereGeometry(0.12, 16, 16);
        const orbMat = new THREE.MeshStandardMaterial({
          color: beaconColor,
          emissive: beaconColor,
          emissiveIntensity: 0.8,
          metalness: 0.9,
          roughness: 0.2,
        });
        const orb = new THREE.Mesh(orbGeom, orbMat);
        orb.position.y = 1.0;
        orb.name = "beaconOrb";
        beacon.add(orb);

        // Slender vertical light tether
        const beamGeom = new THREE.CylinderGeometry(0.012, 0.012, 1.0, 8);
        const beamMat = new THREE.MeshBasicMaterial({ color: beaconColor, transparent: true, opacity: 0.65 });
        const beam = new THREE.Mesh(beamGeom, beamMat);
        beam.position.y = 0.5;
        beacon.add(beam);

        // Ground target ring
        const ringGeom = new THREE.RingGeometry(0.22, 0.28, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: beaconColor, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
        const ring = new THREE.Mesh(ringGeom, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.02;
        beacon.add(ring);

        group.add(beacon);
      });

      group.visible = showObservationsRef.current;
      scene.add(group);
    },
    []
  );

  // Initialize Three.js ONCE on Mount (Allows 100% Free Mouse Navigation)
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111622); // Deep slate blue-gray
    scene.fog = new THREE.FogExp2(0x111622, 0.007);
    sceneRef.current = scene;

    // 2. Camera Setup
    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(0, 5.0, -8.0);
    cameraRef.current = camera;

    // 3. WebGL Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;

    container.innerHTML = "";
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Orbit Controls (ENABLED ALWAYS: Left Drag = Orbit, Right Drag = Pan, Scroll = Zoom)
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enabled = true;
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.minDistance = 1.5;
    controls.maxDistance = 80.0;
    controls.target.set(0, 0.45, 0);
    controlsRef.current = controls;

    // 5. Studio Multi-Point Lighting (Bright, clear, solid)
    const hemiLight = new THREE.HemisphereLight(0xf8fafc, 0x1e293b, 2.4);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 2.5);
    sunLight.position.set(15, 30, 20);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 1.4);
    fillLight.position.set(-15, 12, -15);
    scene.add(fillLight);

    // 6. Ground Metallic Floor & Coordinate Grid
    const floorGeom = new THREE.PlaneGeometry(140, 140);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x141b27, roughness: 0.65, metalness: 0.35 });
    const floor = new THREE.Mesh(floorGeom, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const majorGrid = new THREE.GridHelper(140, 70, 0x0ea5e9, 0x243248);
    majorGrid.position.y = 0.005;
    scene.add(majorGrid);

    // 7. Add Cyber-Rover
    const rover = buildRoverModel();
    scene.add(rover);
    roverGroupRef.current = rover;

    // 8. Add Sonar Waves
    sonarWavesRef.current = [];
    [1.8, 3.4, 5.5, 8.2].forEach((r, idx) => {
      const ringGeom = new THREE.RingGeometry(r - 0.04, r + 0.04, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x0ea5e9,
        transparent: true,
        opacity: 0.28 - idx * 0.05,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.015;
      scene.add(ring);
      sonarWavesRef.current.push(ring);
    });

    // 9. Add Planned Trajectory Ribbon
    const pathPoints: THREE.Vector3[] = [];
    for (let i = 0; i < 30; i++) {
      const t = i / 29;
      const x = Math.sin(t * 3.8) * 2.4;
      const z = t * 11.5;
      pathPoints.push(new THREE.Vector3(x, 0.05, z));
    }
    const pathCurve = new THREE.CatmullRomCurve3(pathPoints);
    const pathGeom = new THREE.BufferGeometry().setFromPoints(pathCurve.getPoints(60));
    const pathMat = new THREE.LineBasicMaterial({
      color: 0x06b6d4,
      linewidth: 3,
      transparent: true,
      opacity: 0.95,
    });
    const pathLine = new THREE.Line(pathGeom, pathMat);
    scene.add(pathLine);
    trajectoryLineRef.current = pathLine;

    // 10. Add Ambient Point Cloud
    const POINT_COUNT = 14000;
    const positions = new Float32Array(POINT_COUNT * 3);
    const colors = new Float32Array(POINT_COUNT * 3);
    const cyanColor = new THREE.Color(0x38bdf8);
    const amberColor = new THREE.Color(0xf59e0b);

    for (let i = 0; i < POINT_COUNT; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.2 + Math.pow(Math.random(), 0.6) * 14.0;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = (Math.sin(x * 0.7) + Math.cos(z * 0.7)) * 0.18 + (Math.random() - 0.5) * 0.25 + 0.12;

      positions[i * 3] = x;
      positions[i * 3 + 1] = Math.max(0.02, y);
      positions[i * 3 + 2] = z;

      const normY = THREE.MathUtils.clamp(y / 0.8, 0, 1);
      const c = new THREE.Color().lerpColors(cyanColor, amberColor, normY);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const pGeom = new THREE.BufferGeometry();
    pGeom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    pGeom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const pMat = new THREE.PointsMaterial({
      size: 0.07,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });
    const pCloud = new THREE.Points(pGeom, pMat);
    scene.add(pCloud);
    pointCloudRef.current = pCloud;

    // 11. Resize Observer
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    // 12. Mouse Pointer Raycasting for Interactive POIs
    const onMouseMove = (event: MouseEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      mouseCoordsRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseCoordsRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const onClick = () => {
      if (!beaconGroupRef.current || !camera) return;
      raycasterRef.current.setFromCamera(mouseCoordsRef.current, camera);
      const intersects = raycasterRef.current.intersectObjects(
        beaconGroupRef.current.children,
        true
      );
      if (intersects.length > 0) {
        let obj: THREE.Object3D | null = intersects[0].object;
        while (obj && !obj.userData?.observation && obj.parent) {
          obj = obj.parent;
        }
        if (obj?.userData?.observation) {
          const obs: ObservationRecord = obj.userData.observation;
          setSelectedObs(obs);
          onSelectObservationRef.current?.(obs);
        }
      }
    };

    renderer.domElement.addEventListener("mousemove", onMouseMove);
    renderer.domElement.addEventListener("click", onClick);

    // 13. High-Rate Animation Loop (Smooth, 60 FPS locked, completely clean)
    let lastTime = performance.now();

    const animate = (time: number) => {
      animFrameIdRef.current = requestAnimationFrame(animate);

      const delta = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      // Smooth Rover Motion
      const targetPose = targetRoverPoseRef.current;
      const curPose = currentRoverPoseRef.current;

      curPose.x = THREE.MathUtils.lerp(curPose.x, targetPose.x, 0.08);
      curPose.y = THREE.MathUtils.lerp(curPose.y, targetPose.y, 0.08);
      curPose.yaw = THREE.MathUtils.lerp(curPose.yaw, targetPose.yaw, 0.08);

      if (roverGroupRef.current) {
        roverGroupRef.current.position.set(curPose.x, curPose.z, curPose.y);
        roverGroupRef.current.rotation.y = curPose.yaw;

        // Rotate LiDAR Puck (Subtle, professional rotation without revolving wedge)
        if (lidarPuckRef.current) {
          lidarPuckRef.current.rotation.y += delta * 12.0;
        }
      }

      // Expand Sonar Waves Outward
      sonarWavesRef.current.forEach((wave, idx) => {
        if (roverGroupRef.current) {
          wave.position.x = roverGroupRef.current.position.x;
          wave.position.z = roverGroupRef.current.position.z;
        }
        const cycle = ((time * 0.001 + idx * 0.3) % 2.0) / 2.0;
        wave.scale.set(1 + cycle * 0.8, 1 + cycle * 0.8, 1);
        (wave.material as THREE.MeshBasicMaterial).opacity = (1 - cycle) * 0.3;
      });

      // Animate Observation Mini-Orbs
      if (beaconGroupRef.current) {
        beaconGroupRef.current.children.forEach((beacon, i) => {
          const orb = beacon.getObjectByName("beaconOrb");
          if (orb) {
            orb.position.y = 1.0 + Math.sin(time * 0.004 + i) * 0.08;
          }
        });

        // Hover raycast check
        raycasterRef.current.setFromCamera(mouseCoordsRef.current, camera);
        const intersects = raycasterRef.current.intersectObjects(
          beaconGroupRef.current.children,
          true
        );
        if (intersects.length > 0) {
          let obj: THREE.Object3D | null = intersects[0].object;
          while (obj && !obj.userData?.observation && obj.parent) {
            obj = obj.parent;
          }
          if (obj?.userData?.observation) {
            setHoveredObs(obj.userData.observation);
            document.body.style.cursor = "pointer";
          }
        } else {
          setHoveredObs(null);
          document.body.style.cursor = "default";
        }
      }

      // Update OrbitControls smoothly tracking rover center
      if (controls) {
        controls.update();
      }

      renderer.render(scene, camera);
    };

    animFrameIdRef.current = requestAnimationFrame(animate);

    // Initial population of obstacles and beacons
    if (mapData) updateOccupancyPillars(scene, mapData);
    if (observations.length > 0) updateObservationBeacons(scene, observations);

    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("mousemove", onMouseMove);
      renderer.domElement.removeEventListener("click", onClick);
      document.body.style.cursor = "default";
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  // Update Obstacles dynamically when mapData changes
  useEffect(() => {
    if (sceneRef.current) {
      updateOccupancyPillars(sceneRef.current, mapData);
    }
  }, [mapData, updateOccupancyPillars]);

  // Update Observation Beacons dynamically when observations change
  useEffect(() => {
    if (sceneRef.current) {
      updateObservationBeacons(sceneRef.current, observations);
    }
  }, [observations, updateObservationBeacons]);

  // Dynamic Layer Visibility Updates
  useEffect(() => {
    if (obstacleMeshRef.current) obstacleMeshRef.current.visible = showObstacles;
  }, [showObstacles]);

  useEffect(() => {
    if (pointCloudRef.current) pointCloudRef.current.visible = showPointCloud;
  }, [showPointCloud]);

  useEffect(() => {
    if (trajectoryLineRef.current) trajectoryLineRef.current.visible = showTrajectory;
  }, [showTrajectory]);

  useEffect(() => {
    if (beaconGroupRef.current) beaconGroupRef.current.visible = showObservations;
  }, [showObservations]);

  // Camera Presets
  const setCameraPerspective = (mode: "free" | "top" | "chase") => {
    setActiveView(mode);
    if (!cameraRef.current || !roverGroupRef.current || !controlsRef.current) return;
    const roverPos = roverGroupRef.current.position;
    const roverHeading = roverGroupRef.current.rotation.y;

    if (mode === "top") {
      cameraRef.current.position.set(roverPos.x, roverPos.y + 24.0, roverPos.z + 0.01);
      controlsRef.current.target.set(roverPos.x, roverPos.y, roverPos.z);
    } else if (mode === "chase") {
      const offsetDist = 7.0;
      const offsetHeight = 3.6;
      const cx = roverPos.x - Math.sin(roverHeading) * offsetDist;
      const cz = roverPos.z - Math.cos(roverHeading) * offsetDist;
      const cy = roverPos.y + offsetHeight;

      cameraRef.current.position.set(cx, cy, cz);
      controlsRef.current.target.set(roverPos.x, roverPos.y + 0.5, roverPos.z);
    } else {
      cameraRef.current.position.set(roverPos.x + 6.0, roverPos.y + 4.5, roverPos.z + 6.0);
      controlsRef.current.target.set(roverPos.x, roverPos.y + 0.5, roverPos.z);
    }
    controlsRef.current.update();
  };

  const handleRecenter = () => {
    if (!roverGroupRef.current || !controlsRef.current) return;
    const roverPos = roverGroupRef.current.position;
    controlsRef.current.target.set(roverPos.x, roverPos.y + 0.5, roverPos.z);
    controlsRef.current.update();
  };

  const toggleFullscreen = () => {
    if (!mountRef.current) return;
    if (!document.fullscreenElement) {
      mountRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  return (
    <div
      className={`relative w-full rounded-md border border-[#243248] bg-[#111622] overflow-hidden select-none font-sans shadow-xl ${
        isExpanded || isFullscreen ? "fixed inset-0 z-50 h-screen w-screen rounded-none" : "h-[620px]"
      }`}
    >
      {/* 3D WebGL Canvas (100% mouse interactive: drag to rotate, right-click to pan, scroll to zoom) */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing" />

      {/* MINIMAL TOP-RIGHT CONTROLS PILL */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 pointer-events-auto z-20">
        <div className="flex items-center bg-[#151c28]/85 backdrop-blur-md p-1 rounded-md border border-[#243248] text-xs font-mono shadow-md">
          <button
            onClick={() => setCameraPerspective("free")}
            className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition ${
              activeView === "free" ? "bg-cyan-600 text-white shadow-xs" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            3D Orbit
          </button>
          <button
            onClick={() => setCameraPerspective("top")}
            className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition ${
              activeView === "top" ? "bg-cyan-600 text-white shadow-xs" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Top
          </button>
          <button
            onClick={() => setCameraPerspective("chase")}
            className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer transition ${
              activeView === "chase" ? "bg-cyan-600 text-white shadow-xs" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Chase
          </button>
        </div>

        {/* Layer Dropdown Toggle */}
        <div className="relative">
          <button
            onClick={() => setShowLayersMenu((v) => !v)}
            className={`p-2 rounded-md bg-[#151c28]/85 backdrop-blur-md border border-[#243248] text-slate-300 hover:text-white transition shadow-md cursor-pointer ${
              showLayersMenu ? "border-cyan-500 text-cyan-400" : ""
            }`}
            title="Layers"
          >
            <Layers className="w-3.5 h-3.5" />
          </button>

          {showLayersMenu && (
            <div className="absolute right-0 mt-2 w-44 bg-[#151c28]/95 backdrop-blur-md rounded-md border border-[#243248] p-2.5 shadow-2xl z-30 space-y-2 text-xs">
              <label className="flex items-center justify-between text-slate-200 cursor-pointer">
                <span>3D Obstacles</span>
                <input
                  type="checkbox"
                  checked={showObstacles}
                  onChange={(e) => setShowObstacles(e.target.checked)}
                  className="accent-cyan-500 rounded"
                />
              </label>

              <label className="flex items-center justify-between text-slate-200 cursor-pointer">
                <span>LiDAR Cloud</span>
                <input
                  type="checkbox"
                  checked={showPointCloud}
                  onChange={(e) => setShowPointCloud(e.target.checked)}
                  className="accent-cyan-500 rounded"
                />
              </label>

              <label className="flex items-center justify-between text-slate-200 cursor-pointer">
                <span>Path Ribbon</span>
                <input
                  type="checkbox"
                  checked={showTrajectory}
                  onChange={(e) => setShowTrajectory(e.target.checked)}
                  className="accent-cyan-500 rounded"
                />
              </label>

              <label className="flex items-center justify-between text-slate-200 cursor-pointer">
                <span>POI Markers</span>
                <input
                  type="checkbox"
                  checked={showObservations}
                  onChange={(e) => setShowObservations(e.target.checked)}
                  className="accent-cyan-500 rounded"
                />
              </label>
            </div>
          )}
        </div>

        {/* Recenter Button */}
        <button
          onClick={handleRecenter}
          className="p-2 rounded-md bg-[#151c28]/85 backdrop-blur-md border border-[#243248] text-slate-300 hover:text-white transition shadow-md cursor-pointer"
          title="Recenter on Rover"
        >
          <Crosshair className="w-3.5 h-3.5" />
        </button>

        {/* Fullscreen Button */}
        <button
          onClick={onToggleExpand || toggleFullscreen}
          className="p-2 rounded-md bg-[#151c28]/85 backdrop-blur-md border border-[#243248] text-slate-300 hover:text-white transition shadow-md cursor-pointer"
          title="Fullscreen"
        >
          {isExpanded || isFullscreen ? (
            <Minimize2 className="w-3.5 h-3.5" />
          ) : (
            <Maximize2 className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* MINIMAL BOTTOM HUD: Small Translucent Velocity & Coordinate Pills */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2 pointer-events-none z-20">
        <div className="bg-[#151c28]/80 backdrop-blur-md px-2.5 py-1 rounded border border-[#243248] text-[11px] font-mono text-slate-300 flex items-center gap-1.5 shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span>{speedVal.toFixed(1)} m/s</span>
        </div>

        <div className="bg-[#151c28]/80 backdrop-blur-md px-2.5 py-1 rounded border border-[#243248] text-[11px] font-mono text-slate-300 shadow-sm">
          X: {coords.x.toFixed(2)}m · Y: {coords.y.toFixed(2)}m
        </div>
      </div>

      {/* Minimal Hover Tooltip */}
      {hoveredObs && (
        <div className="absolute top-14 left-4 z-40 bg-[#151c28]/95 backdrop-blur-md px-3 py-2 rounded-md border border-cyan-500/50 shadow-xl pointer-events-none max-w-xs space-y-1">
          <div className="text-xs font-semibold text-white">
            {hoveredObs.obs_code} · {hoveredObs.class_label}
          </div>
          <div className="text-[11px] font-mono text-slate-400">
            {hoveredObs.distance_m}m dist · {(hoveredObs.confidence * 100).toFixed(0)}% conf
          </div>
        </div>
      )}

      {/* Selected Observation Modal Card */}
      {selectedObs && (
        <div className="absolute top-14 right-4 z-40 bg-[#151c28]/95 backdrop-blur-md p-3 rounded-md border border-cyan-500 shadow-2xl max-w-xs space-y-2 font-sans">
          <div className="flex items-center justify-between border-b border-slate-700 pb-1.5">
            <span className="text-xs font-mono font-bold text-slate-100 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-cyan-400" />
              {selectedObs.obs_code}
            </span>
            <button
              onClick={() => setSelectedObs(null)}
              className="text-slate-400 hover:text-white text-xs px-1 rounded cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="text-xs text-slate-200">
            {selectedObs.title || selectedObs.class_label}
          </div>

          <div className="grid grid-cols-2 gap-1.5 text-[11px] font-mono bg-slate-900/60 p-1.5 rounded border border-slate-700">
            <div>
              <span className="text-slate-500 block text-[9px]">POS</span>
              <span className="text-cyan-400">
                {selectedObs.pos_x}m, {selectedObs.pos_y}m
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[9px]">DIST</span>
              <span className="text-slate-200">{selectedObs.distance_m}m</span>
            </div>
          </div>
        </div>
      )}

      {/* Minimal Loading State */}
      {isLoading && (
        <div className="absolute inset-0 bg-[#111622]/80 backdrop-blur-xs flex items-center justify-center z-50">
          <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs">
            <Radio className="w-4 h-4 animate-pulse" />
            <span>CONNECTING 3D STREAM...</span>
          </div>
        </div>
      )}
    </div>
  );
};
