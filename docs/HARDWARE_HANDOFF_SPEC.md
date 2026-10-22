# PIPER Rescue Intelligence - Hardware Bridge Handoff Specification

## Part 1: Copy-Paste Prompt for your Hardware Agent

Copy and send this prompt to your hardware agent / robotics engineer:

```markdown
You are the Robotics Hardware Systems Engineer and ROS 2 Integration Lead for the PIPER Rescue Intelligence Platform.

MISSION:
Create a complete technical handoff report and automated diagnostic script for the hardware-side ROS 2 bridge connecting our physical rover / sensor stack to the PIPER command server (via Cloudflare tunnel / localhost.run).

OBJECTIVES:
1. Document every network connection made between your hardware node and the upstream server.
2. For each feed and telemetry channel, detail:
   - Endpoint URL & Protocol (HTTP REST vs WebSocket vs MJPEG stream)
   - Mechanism: Is it Real-Time (streaming push) or Polling (pull interval / frequency in Hz)?
   - Data payload format (JSON, binary structs, multipart JPEG)
   - Real-world bit rate / data throughput (KB/s, Mbps, FPS, point count)
3. Provide an executable Python validation script (`verify_hardware_bridge.py`) that boots on the hardware machine, probes each endpoint, checks socket liveness, and measures the active streaming bit rates and polling latencies.

SERVER CONTRACT REQUIREMENTS EXPECTED BY OUR BACKEND:
- GET / (Liveness probe returning {"robot": "Piper", "api_status": "running"})
- GET /api/robot/status (Current rover state, battery, motor status)
- POST /api/robot/command (Receives {"command": "start_patrol" | "pause_patrol" | "return_to_base"})
- GET /api/camera/stream (Continuous MJPEG stream multipart/x-mixed-replace; boundary=frame at 640x400 ~15 FPS)
- WSS /ws/lidar (WebSocket streaming binary 'piper.pointcloud.v1' packets at ~12 Hz / ~872 points)
- GET /api/lidar/status (LiDAR frame_id and update rate metadata)
- GET /api/map/data (Nav2 / Cartographer occupancy grid, resolution, and robot pose)

Please analyze your active ROS 2 nodes, confirm the exact bitrates, and generate the handoff report and verification script.
```

---

## Part 2: Complete Connection, Data Feed & Bitrate Handoff Specification

This is the exact contract the PIPER Dashboard backend currently connects to on upstream:

```text
+-----------------------------------------------------------------------------------------+
|                                    PIPER ARCHITECTURE                                   |
|                                                                                         |
|  [ Physical Rover / ROS 2 ]                                                             |
|   - OAK-D / USB Camera                                                                  |
|   - Livox / Point-LIO LiDAR                                                             |
|   - Nav2 / Odometry                                                                     |
|        │                                                                                |
|        ▼ (ROS 2 Topics)                                                                 |
|  [ Hardware Bridge API ] (port 8080)                                                    |
|        │                                                                                |
|        ▼ (Cloudflare Tunnel: https://fraction-barrel-banners-score.trycloudflare.com)    |
|  [ PIPER Dashboard Backend ] (FastAPI :8000)                                           |
|        │                                                                                |
|        ▼ (HTTP REST / WebSocket / MJPEG)                                                |
|  [ Tactical Command Frontend ] (Next.js :3000)                                          |
+-----------------------------------------------------------------------------------------+
```

### Detailed Connection & Data Matrix

| Channel / Feed | Protocol & Endpoint | Direction | Mode | Frequency / FPS | Expected Bitrate / Payload |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Camera Video** | HTTP `GET /api/camera/stream` (or WS `/api/camera/ws`) | Robot ➔ Backend | REAL-TIME (Streaming) | 12 – 15 FPS | 450 Kbps – 2.4 Mbps (~30–45 KB/frame JPEG, 640×400) |
| **LiDAR Point Cloud** | WS `wss://.../ws/lidar` | Robot ➔ Backend | REAL-TIME (Push) | 10 – 12 Hz | 1.35 Mbps (~14 KB/packet, 872 pts × 16 bytes) |
| **LiDAR Status** | HTTP `GET /api/lidar/status` | Backend ➔ Robot | POLLING | Every 3.0 s (0.33 Hz) | < 1 Kbps (~200 bytes JSON: `frame_id`, `rate_hz`) |
| **Robot Telemetry** | HTTP `GET /api/robot/status` | Backend ➔ Robot | POLLING | Every 2.5 s (0.4 Hz) | < 1 Kbps (~300 bytes JSON: `state`, `battery`, `message`) |
| **Liveness Probe** | HTTP `GET /` | Backend ➔ Robot | POLLING | Every 2.5 s (0.4 Hz) | < 1 Kbps (~150 bytes JSON: `robot`, `api_status`) |
| **Control Commands** | HTTP `POST /api/robot/command` | Backend ➔ Robot | EVENT-DRIVEN | On Operator Action | < 1 Kbps (JSON: `{"command": "..."}`) |
| **SLAM Occupancy Map** | HTTP `GET /api/map/data` | Backend ➔ Robot | POLLING / ON-DEMAND | On map mount / refresh | ~10 – 25 KB (JSON 2D grid matrix 50×50 + origin) |

---

## Part 3: Binary Point Cloud Wire Protocol (`piper.pointcloud.v1`)

The hardware WebSocket stream on `/ws/lidar` expects binary packets formatted as:

1. **Header Length**: 4 bytes (Big-endian uint32 `!I`) specifying the length of the JSON metadata string.
2. **JSON Metadata**: UTF-8 encoded metadata dictionary containing:
```json
{
  "protocol": "piper.pointcloud.v1",
  "sequence": 1042,
  "frame_id": "camera_init",
  "point_count": 872,
  "point_step": 16,
  "is_bigendian": false,
  "fields": [
    {"name": "x", "offset": 0, "datatype": 7, "count": 1},
    {"name": "y", "offset": 4, "datatype": 7, "count": 1},
    {"name": "z", "offset": 8, "datatype": 7, "count": 1},
    {"name": "intensity", "offset": 12, "datatype": 7, "count": 1}
  ]
}
```
3. **Payload Data**: `point_count * 16` bytes of little-endian float32 values (`<ffff` = x, y, z, intensity).

---

## Part 4: Hardware Handoff Verification Script

Run `verify_hardware_bridge.py` on the hardware rover machine or local testing environment:

```bash
python3 verify_hardware_bridge.py http://localhost:8080
```
Or with custom Cloudflare tunnel URL:
```bash
python3 verify_hardware_bridge.py https://fraction-barrel-banners-score.trycloudflare.com
```

---

## Summary of What to Tell Your Team

- **Camera Feed & LiDAR Point Cloud are REAL-TIME streams**: They do not poll. They stream continuously over HTTP multipart and WebSockets.
- **Telemetry, Liveness, and Incidents are POLLING / REST**: Frontend checks status and events at a safe 2.5s interval (0.4 Hz), consuming negligible bandwidth (< 5 Kbps).
- **When the Cloudflare Tunnel is re-opened**: The backend and frontend automatically switch from demo/standby fallback to live streaming in sub-second time without requiring a server reboot.
