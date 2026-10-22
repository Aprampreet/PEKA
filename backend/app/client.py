import asyncio
import io
import time
import struct
import json
import math
from datetime import datetime, timezone
from typing import AsyncGenerator, Optional, Dict, Any
import httpx
from PIL import Image, ImageDraw

from app.config import settings
from app.event_log import event_logger
from app.schemas import (
    RobotInfoResponse,
    RobotStatusResponse,
    RobotCommandResponse,
    AllowedRobotCommand,
)


class RobotApiClient:
    """
    Dedicated typed HTTP client for upstream ROS 2 robot bridge.
    Manages client connection pooling, timeouts, fallback states,
    and multipart MJPEG streaming.
    """

    def __init__(self):
        self._client: Optional[httpx.AsyncClient] = None
        self._last_known_status: Optional[Dict[str, Any]] = None
        self._last_status_time: float = 0.0

    async def get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(settings.robot_api_timeout_seconds, connect=2.0)
            )
        return self._client

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def get_info(self) -> RobotInfoResponse:
        client = await self.get_client()
        upstream_url = settings.piper_robot_api_url.rstrip("/")
        try:
            resp = await client.get(f"{upstream_url}/")
            if resp.status_code == 200:
                data = resp.json()
                event_logger.log(
                    category="connection",
                    level="info",
                    message=f"Connected to upstream robot API: {data.get('robot', 'Piper')} ({data.get('api_status', 'running')})"
                )
                return RobotInfoResponse(
                    robot=data.get("robot", "Piper"),
                    api_status=data.get("api_status", "running"),
                    upstream_connected=True,
                    source="live",
                    upstream_url=upstream_url
                )
        except Exception as e:
            event_logger.log(
                category="connection",
                level="warning",
                message=f"Upstream robot API probe failed at {upstream_url}: {str(e)[:100]}",
                is_simulated=settings.enable_simulation_fallback
            )

        if settings.enable_simulation_fallback:
            return RobotInfoResponse(
                robot="Piper (Simulated Fallback)",
                api_status="standby",
                upstream_connected=False,
                source="demo",
                upstream_url=upstream_url
            )
        
        return RobotInfoResponse(
            robot="Piper",
            api_status="unreachable",
            upstream_connected=False,
            source="live",
            upstream_url=upstream_url
        )

    async def get_status(self) -> RobotStatusResponse:
        client = await self.get_client()
        upstream_url = settings.piper_robot_api_url.rstrip("/")
        now_iso = datetime.now(timezone.utc).isoformat()
        current_time = time.time()

        try:
            resp = await client.get(f"{upstream_url}/api/robot/status")
            if resp.status_code == 200:
                data = resp.json()
                is_stale = False
                # If upstream returned identical payload and time between checks is high
                if self._last_known_status == data and (current_time - self._last_status_time) > 10.0:
                    is_stale = True

                self._last_known_status = data
                self._last_status_time = current_time

                return RobotStatusResponse(
                    state=data.get("state", "unknown"),
                    message=data.get("message", "ROS 2 status reported"),
                    upstream_available=True,
                    is_stale=is_stale,
                    last_updated_at=now_iso,
                    source="live"
                )
        except Exception as e:
            event_logger.log(
                category="connection",
                level="warning",
                message=f"Status check failed against {upstream_url}: {str(e)[:100]}",
                is_simulated=settings.enable_simulation_fallback
            )

        # Fallback state when upstream robot is unreachable
        if settings.enable_simulation_fallback:
            return RobotStatusResponse(
                state="standby_simulated",
                message="Upstream robot API unreachable; operating in safe demo standby mode.",
                upstream_available=False,
                is_stale=False,
                last_updated_at=now_iso,
                source="demo"
            )

        return RobotStatusResponse(
            state="disconnected",
            message=f"Cannot reach upstream robot API at {upstream_url}",
            upstream_available=False,
            is_stale=True,
            last_updated_at=now_iso,
            source="live"
        )

    async def send_command(self, command: AllowedRobotCommand) -> RobotCommandResponse:
        client = await self.get_client()
        upstream_url = settings.piper_robot_api_url.rstrip("/")
        now_iso = datetime.now(timezone.utc).isoformat()

        try:
            resp = await client.post(
                f"{upstream_url}/api/robot/command",
                json={"command": command}
            )
            if resp.status_code in (200, 201, 202):
                data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
                detail = data.get("detail", f"Command '{command}' published successfully to ROS 2 topic.")
                event_logger.log(
                    category="command",
                    level="success",
                    message=f"Command '{command}' published to upstream ROS bridge."
                )
                return RobotCommandResponse(
                    command=command,
                    status="published_to_ros",
                    detail=detail,
                    timestamp=now_iso
                )
            else:
                event_logger.log(
                    category="command",
                    level="error",
                    message=f"Upstream returned HTTP {resp.status_code} for command '{command}'"
                )
                return RobotCommandResponse(
                    command=command,
                    status="failed",
                    detail=f"Upstream returned status {resp.status_code}: {resp.text[:120]}",
                    timestamp=now_iso
                )
        except Exception as e:
            if settings.enable_simulation_fallback:
                event_logger.log(
                    category="command",
                    level="info",
                    message=f"[DEMO SIMULATION] Command '{command}' logged locally (upstream offline).",
                    is_simulated=True
                )
                return RobotCommandResponse(
                    command=command,
                    status="simulated",
                    detail=f"Simulated command dispatch: '{command}' acknowledged in local demo mode. Upstream is unreachable.",
                    timestamp=now_iso
                )

            event_logger.log(
                category="command",
                level="error",
                message=f"Command '{command}' delivery failed: {str(e)[:100]}"
            )
            return RobotCommandResponse(
                command=command,
                status="failed",
                detail=f"Connection failure to upstream robot at {upstream_url}: {str(e)[:100]}",
                timestamp=now_iso
            )

    async def stream_mjpeg(self) -> AsyncGenerator[bytes, None]:
        """
        Streams multipart/x-mixed-replace frames.
        Continuously proxies upstream MJPEG frames from the robot camera.
        If upstream drops or stutters, delivers standby frames while automatically
        retrying the connection so the live feed seamlessly resumes.
        """
        upstream_url = settings.piper_robot_api_url.rstrip("/")
        from app.perception import perception_engine
        frame_counter = 0

        while True:
            try:
                client = await self.get_client()
                async with client.stream(
                    "GET",
                    f"{upstream_url}/api/camera/stream",
                    timeout=None
                ) as response:
                    if response.status_code == 200:
                        event_logger.log(
                            category="camera",
                            level="info",
                            message="Connected to live upstream MJPEG camera stream."
                        )
                        buffer = bytearray()
                        async for chunk in response.aiter_raw():
                            buffer.extend(chunk)
                            while True:
                                start = buffer.find(b"\xff\xd8")
                                if start == -1:
                                    buffer.clear()
                                    break
                                if start > 0:
                                    buffer = buffer[start:]
                                    start = 0
                                end = buffer.find(b"\xff\xd9", 2)
                                if end == -1:
                                    break
                                raw_frame = bytes(buffer[: end + 2])
                                buffer = buffer[end + 2 :]
                                try:
                                    processed = perception_engine.process_frame(raw_frame)
                                except Exception:
                                    processed = raw_frame
                                header = (
                                    b"--frame\r\n"
                                    b"Content-Type: image/jpeg\r\n"
                                    b"Content-Length: " + str(len(processed)).encode("ascii") + b"\r\n\r\n"
                                )
                                yield header + processed + b"\r\n"
                                await asyncio.sleep(0)
            except (asyncio.CancelledError, GeneratorExit):
                return
            except Exception:
                pass

            # Standby generator if upstream is temporarily unreachable, retries connection every loop
            try:
                frame_counter += 1
                raw_frame = self._create_test_frame(frame_counter)
                try:
                    processed = perception_engine.process_frame(raw_frame)
                except Exception:
                    processed = raw_frame
                header = (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n"
                    b"Content-Length: " + str(len(processed)).encode("ascii") + b"\r\n\r\n"
                )
                yield header + processed + b"\r\n"
                await asyncio.sleep(0.08)
            except (asyncio.CancelledError, GeneratorExit):
                return

    async def stream_ws_frames(self) -> AsyncGenerator[bytes, None]:
        """
        Yields raw JPEG frame bytes directly for WebSocket binary delivery.
        Continuously streams frames through PerceptionEngine for real-time face detection,
        HUD markers, and automated observation logging without freezing the video stream.
        """
        upstream_url = settings.piper_robot_api_url.rstrip("/")
        from app.perception import perception_engine
        frame_counter = 0

        while True:
            try:
                client = await self.get_client()
                async with client.stream(
                    "GET",
                    f"{upstream_url}/api/camera/stream",
                    timeout=None
                ) as response:
                    if response.status_code == 200:
                        buffer = bytearray()
                        async for chunk in response.aiter_raw():
                            buffer.extend(chunk)
                            while True:
                                start = buffer.find(b"\xff\xd8")
                                if start == -1:
                                    buffer.clear()
                                    break
                                if start > 0:
                                    buffer = buffer[start:]
                                    start = 0
                                end = buffer.find(b"\xff\xd9", 2)
                                if end == -1:
                                    break
                                raw_frame = bytes(buffer[: end + 2])
                                buffer = buffer[end + 2 :]
                                try:
                                    processed = perception_engine.process_frame(raw_frame)
                                except Exception:
                                    processed = raw_frame
                                yield processed
                                await asyncio.sleep(0)
            except (asyncio.CancelledError, GeneratorExit):
                return
            except Exception:
                pass

            # Standby generator if upstream is temporarily unreachable, auto-retrying upstream
            try:
                frame_counter += 1
                raw_frame = self._create_test_frame(frame_counter)
                try:
                    processed = perception_engine.process_frame(raw_frame)
                except Exception:
                    processed = raw_frame
                yield processed
                await asyncio.sleep(0.08)
            except (asyncio.CancelledError, GeneratorExit):
                return

    def _create_test_frame(self, frame_num: int) -> bytes:
        """Generates a synthetic disaster-response test pattern frame with HUD"""
        w, h = 640, 400
        img = Image.new("RGB", (w, h), color=(15, 23, 42))  # slate-900
        draw = ImageDraw.Draw(img)

        # Draw subtle grid lines
        for x in range(0, w, 40):
            draw.line([(x, 0), (x, h)], fill=(30, 41, 59), width=1)
        for y in range(0, h, 40):
            draw.line([(0, y), (w, y)], fill=(30, 41, 59), width=1)

        # Draw center crosshair
        cx, cy = w // 2, h // 2
        draw.line([(cx - 25, cy), (cx + 25, cy)], fill=(234, 179, 8), width=1)
        draw.line([(cx, cy - 25), (cx, cy + 25)], fill=(234, 179, 8), width=1)
        draw.ellipse([(cx - 15, cy - 15), (cx + 15, cy + 15)], outline=(234, 179, 8), width=1)

        # Outer bounding reticle corners
        margin = 30
        corner_len = 20
        # Top-left
        draw.line([(margin, margin), (margin + corner_len, margin)], fill=(56, 189, 248), width=2)
        draw.line([(margin, margin), (margin, margin + corner_len)], fill=(56, 189, 248), width=2)
        # Top-right
        draw.line([(w - margin, margin), (w - margin - corner_len, margin)], fill=(56, 189, 248), width=2)
        draw.line([(w - margin, margin), (w - margin, margin + corner_len)], fill=(56, 189, 248), width=2)
        # Bottom-left
        draw.line([(margin, h - margin), (margin + corner_len, h - margin)], fill=(56, 189, 248), width=2)
        draw.line([(margin, h - margin), (margin, h - margin - corner_len)], fill=(56, 189, 248), width=2)
        # Bottom-right
        draw.line([(w - margin, h - margin), (w - margin - corner_len, h - margin)], fill=(56, 189, 248), width=2)
        draw.line([(w - margin, h - margin), (w - margin, h - margin - corner_len)], fill=(56, 189, 248), width=2)

        # Tactical HUD Text
        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        draw.text((margin + 5, margin + 5), "PIPER RESCUE - OPTICAL SENSOR [SIMULATED]", fill=(248, 250, 252))
        draw.text((margin + 5, margin + 25), f"TIMESTAMP: {now_str}", fill=(148, 163, 184))
        draw.text((margin + 5, margin + 45), f"FRAME SEQ: #{frame_num:06d} | RES: 640x400 JPEG", fill=(148, 163, 184))
        draw.text((margin + 5, h - margin - 25), "STATUS: UPSTREAM ROS 2 CAMERA OFFLINE (TEST PATTERN ACTIVE)", fill=(234, 179, 8))

        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=75)
        return buf.getvalue()

    async def get_lidar_status(self) -> Dict[str, Any]:
        """
        Queries upstream GET /api/lidar/status on robot bridge.
        Returns Point-LIO live status snapshot.
        """
        upstream_url = settings.piper_robot_api_url.rstrip("/")
        client = await self.get_client()
        try:
            resp = await client.get(f"{upstream_url}/api/lidar/status")
            if resp.status_code == 200:
                return resp.json()
        except Exception:
            pass

        return {
            "topic": "/cloud_registered",
            "receiving": False,
            "last_cloud_timestamp": None,
            "last_received_age_seconds": None,
            "point_count": 0,
            "frame_id": "camera_init",
            "streaming": False,
            "connected_clients": 0,
            "cloud_update_rate_hz": None,
            "sequence": 0,
            "max_points": 50000,
            "max_rate_hz": 10.0,
            "source": "simulated_standby",
        }

    async def stream_lidar_ws_frames(self) -> AsyncGenerator[bytes, None]:
        """
        Streams binary pointcloud frames adhering to piper.pointcloud.v1 protocol.
        Connects to upstream /ws/lidar if reachable; otherwise yields high-density
        registered Point-LIO frames matching the active robot's topic telemetry (12 Hz, ~872 pts).
        """
        import websockets
        upstream_url = settings.piper_robot_api_url.rstrip("/")
        ws_url = upstream_url.replace("https://", "wss://").replace("http://", "ws://") + "/ws/lidar"

        # Fast probe upstream /ws/lidar (0.5s timeout) without blocking the client
        upstream_ok = False
        try:
            async with websockets.connect(ws_url, open_timeout=0.6) as ws:
                upstream_ok = True
                while True:
                    packet = await ws.recv()
                    if isinstance(packet, bytes):
                        yield packet
                    await asyncio.sleep(0)
        except (asyncio.CancelledError, GeneratorExit):
            return
        except Exception:
            pass

        # High-Fidelity Point-LIO Fallback Generator at 12 Hz matching live robot metrics
        seq = 0
        while True:
            try:
                seq += 1
                packet = self._create_test_pointcloud(seq)
                yield packet
                await asyncio.sleep(0.083)  # ~12 Hz
            except (asyncio.CancelledError, GeneratorExit):
                break

    def _create_test_pointcloud(self, sequence: int, target_count: int = 872) -> bytes:
        """
        Builds a valid piper.pointcloud.v1 binary packet representing
        a real-world disaster-response collapsed void corridor with rich 3D geometry
        matching the exact ~872 registered points from Point-LIO /cloud_registered.
        """
        pts = []

        # 1. Floor terrain with micro-rubble relief (-2.4m to 2.4m)
        sweep_angle = (sequence * 0.12) % (2 * math.pi)
        for xi in range(-14, 15):
            for yi in range(-14, 15):
                if (xi * xi + yi * yi) % 4 == 0:
                    continue
                x = xi * 0.16
                y = yi * 0.16
                # Dynamic laser sweep micro-elevation
                wave = math.sin(x * 1.5 + y * 1.2 + sweep_angle) * 0.05
                z = wave + 0.06
                intensity = 0.35 + 0.12 * math.sin(x + y)
                pts.append((x, y, z, intensity))

        # 2. Structural collapsed slab / wall (x: -2.0 to -0.2, z: 0.1 to 1.6)
        for zi in range(1, 16):
            z = zi * 0.10
            for xi in range(-12, 1):
                x = xi * 0.14
                y = -1.2 + (x + 1.8) * 0.4 + math.sin(z * 3.0 + sweep_angle) * 0.03
                intensity = 0.65 + z * 0.18
                pts.append((x, y, z, intensity))

        # 3. Sector 3 Void cluster (ROI at x: 0.4, y: 1.5, z: 0.6)
        for ri in range(1, 8):
            r = ri * 0.09
            for thi in range(0, 14):
                th = thi * (math.pi / 7)
                x = 0.4 + math.cos(th) * r
                y = 1.5 + math.sin(th) * r
                z = max(0.08, 0.85 - r * 0.65)
                pts.append((x, y, z, 0.90))

        # 4. Perimeter rubble bounds (corridor framing)
        for bi in range(-10, 11):
            y_b = bi * 0.22
            pts.append((2.2, y_b, 0.4 + 0.3 * math.sin(bi), 0.70))
            pts.append((-2.2, y_b, 0.5 + 0.2 * math.cos(bi), 0.75))

        # Trim or pad to target Point-LIO count (~872 pts)
        if len(pts) > target_count:
            pts = pts[:target_count]

        point_count = len(pts)
        meta = {
            "protocol": "piper.pointcloud.v1",
            "sequence": sequence,
            "stamp": {"sec": int(time.time()), "nanosec": int((time.time() % 1) * 1e9)},
            "frame_id": "camera_init",
            "source_width": point_count,
            "source_height": 1,
            "source_point_count": point_count,
            "width": point_count,
            "height": 1,
            "point_count": point_count,
            "point_step": 16,
            "row_step": point_count * 16,
            "is_bigendian": False,
            "is_dense": True,
            "payload_bytes": point_count * 16,
            "fields": [
                {"name": "x", "offset": 0, "datatype": 7, "datatype_name": "FLOAT32", "count": 1},
                {"name": "y", "offset": 4, "datatype": 7, "datatype_name": "FLOAT32", "count": 1},
                {"name": "z", "offset": 8, "datatype": 7, "datatype_name": "FLOAT32", "count": 1},
                {"name": "intensity", "offset": 12, "datatype": 7, "datatype_name": "FLOAT32", "count": 1},
            ],
            "sampling": "uniform_index",
        }

        meta_bytes = json.dumps(meta).encode("utf-8")
        header = struct.pack("!I", len(meta_bytes))
        records = bytearray()
        for (x, y, z, intensity) in pts:
            records.extend(struct.pack("<ffff", float(x), float(y), float(z), float(intensity)))

        return header + meta_bytes + records


robot_client = RobotApiClient()
