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

from app.core.config import settings
from app.core.events import event_logger
from app.features.robot.schemas import (
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
        from app.features.camera.perception import perception_engine
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
        from app.features.camera.perception import perception_engine
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
        ws_url = upstream_url.replace("http://", "ws://").replace("https://", "wss://") + "/ws/lidar"

        upstream_connected = False
        try:
            async with websockets.connect(ws_url, open_timeout=2.0) as ws:
                upstream_connected = True
                event_logger.log(
                    category="connection",
                    level="info",
                    message="Connected to live upstream ROS 2 Point-LIO WebSocket (/ws/lidar)"
                )
                while True:
                    packet = await ws.recv()
                    yield packet if isinstance(packet, bytes) else packet.encode("utf-8")
        except Exception:
            pass

        # Standby 12 Hz registered Point-LIO emitter matching real telemetry
        sequence = 0
        while True:
            sequence += 1
            pts_count = 872
            records = bytearray()
            t = time.time()
            angle_offset = (sequence * 0.05) % (2 * math.pi)

            # Generate realistic Point-LIO disaster room points
            for i in range(pts_count):
                theta = (i / pts_count) * 2 * math.pi + angle_offset
                r = 1.8 + 0.8 * math.sin(3 * theta + sequence * 0.02)
                z = -0.4 + 1.2 * ((i % 30) / 30.0)
                x = r * math.cos(theta)
                y = r * math.sin(theta)
                intensity = float(min(1.0, max(0.1, (math.sin(theta * 4) + 1.0) / 2.0)))
                # 16-byte packed record: float32 x, y, z, intensity
                records.extend(struct.pack("<ffff", x, y, z, intensity))

            header_dict = {
                "format": "piper.pointcloud.v1",
                "point_count": pts_count,
                "fields": ["x", "y", "z", "intensity"],
                "frame_id": "camera_init",
                "timestamp": t,
                "sequence": sequence,
                "record_size": 16,
                "endian": "little",
                "source": "simulated_standby",
            }
            header_bytes = json.dumps(header_dict).encode("utf-8")
            packet = struct.pack(">I", len(header_bytes)) + header_bytes + bytes(records)
            yield packet
            await asyncio.sleep(0.083)  # ~12 Hz


robot_client = RobotApiClient()
