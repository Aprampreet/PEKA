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
        last_upstream_attempt = 0.0
        retry_cooldown = 6.0  # seconds between probe attempts to upstream tunnel

        while True:
            now = time.time()
            if now - last_upstream_attempt >= retry_cooldown:
                last_upstream_attempt = now
                try:
                    client = await self.get_client()
                    async with client.stream(
                        "GET",
                        f"{upstream_url}/api/camera/stream",
                        timeout=httpx.Timeout(connect=1.5, read=None, write=2.0, pool=2.0)
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

            # Standby generator if upstream is temporarily unreachable, retries connection on cooldown
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
                await asyncio.sleep(0.06)
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
        last_upstream_attempt = 0.0
        retry_cooldown = 6.0

        while True:
            now = time.time()
            if now - last_upstream_attempt >= retry_cooldown:
                last_upstream_attempt = now
                try:
                    client = await self.get_client()
                    async with client.stream(
                        "GET",
                        f"{upstream_url}/api/camera/stream",
                        timeout=httpx.Timeout(connect=1.5, read=None, write=2.0, pool=2.0)
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
                await asyncio.sleep(0.06)
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

    async def capture_pcd(self):
        """
        Proxies GET /api/lidar/capture.pcd to upstream robot bridge (30s capture).
        Saves the captured PCD to frontend/public/map.pcd.
        If upstream is unavailable, provides the fallback PCD from frontend/public/map.pcd.
        """
        from starlette.responses import Response
        from fastapi import HTTPException
        from pathlib import Path

        upstream_url = settings.piper_robot_api_url.rstrip("/")
        client = await self.get_client()
        frontend_map_path = Path(__file__).resolve().parents[4] / "frontend" / "public" / "map.pcd"

        try:
            resp = await client.get(
                f"{upstream_url}/api/lidar/capture.pcd",
                timeout=httpx.Timeout(60.0, connect=2.0)
            )
            if resp.status_code == 200:
                frame_id = resp.headers.get("X-PointCloud-Frame-Id", "camera_init")
                content = resp.content

                try:
                    frontend_map_path.write_bytes(content)
                except Exception:
                    pass

                event_logger.log(
                    category="camera",
                    level="success",
                    message=f"Live 30s Point-LIO PCD captured ({len(content)//1024} KB, frame: {frame_id})."
                )
                return Response(
                    content=content,
                    media_type="application/vnd.pcd",
                    headers={
                        "Content-Disposition": 'attachment; filename="cloud_capture.pcd"',
                        "X-PointCloud-Frame-Id": frame_id,
                        "X-PointCloud-Source": "live",
                    }
                )
            elif resp.status_code == 409:
                raise HTTPException(status_code=409, detail="LiDAR capture already in progress. Please wait for it to finish.")
            elif resp.status_code == 422:
                detail = "Unprocessable LiDAR cloud entity from upstream."
                try:
                    detail = resp.json().get("detail", detail)
                except Exception:
                    pass
                raise HTTPException(status_code=422, detail=detail)
        except HTTPException:
            raise
        except Exception as e:
            event_logger.log(
                category="camera",
                level="info",
                message=f"Upstream 30s PCD capture timed out/unavailable ({str(e)[:40]}). Serving cached map.",
                is_simulated=True
            )

        # Fallback: serve local map.pcd
        if frontend_map_path.exists():
            content = frontend_map_path.read_bytes()
            return Response(
                content=content,
                media_type="application/vnd.pcd",
                headers={
                    "Content-Disposition": 'attachment; filename="cloud_capture.pcd"',
                    "X-PointCloud-Frame-Id": "camera_init",
                    "X-PointCloud-Source": "cached",
                }
            )

        raise HTTPException(status_code=503, detail="No usable PCD point cloud available")

    async def send_cmd_vel(self, linear_x: float, angular_z: float) -> Dict[str, Any]:
        """
        Publishes velocity command to upstream ROS 2 topic /cmd_vel via POST /api/robot/cmd_vel.
        Enforces teammate's exact ROS 2 validation range:
        - linear_x: -0.5 to 0.5 (m/s)
        - angular_z: -1.0 to 1.0 (rad/s)
        Also updates local spatial pose in map adapter for smooth UI tracking.
        """
        # Strict clamping to ROS 2 limits
        clamped_x = max(-0.5, min(0.5, float(linear_x)))
        clamped_z = max(-1.0, min(1.0, float(angular_z)))

        # Update local simulated pose so the robot marker actually drives on the UI map!
        from app.features.map.adapter import map_adapter
        map_adapter.update_teleop_pose(clamped_x, clamped_z, dt=0.15)

        upstream_url = settings.piper_robot_api_url.rstrip("/")
        client = await self.get_client()
        upstream_success = False
        upstream_msg = "Velocity command processed"

        try:
            resp = await client.post(
                f"{upstream_url}/api/robot/cmd_vel",
                json={
                    "linear_x": round(clamped_x, 3),
                    "angular_z": round(clamped_z, 3),
                },
                timeout=1.0
            )
            if resp.status_code == 200:
                upstream_success = True
                upstream_msg = resp.json().get("message", "Velocity command published to ROS 2")
            else:
                upstream_msg = f"HTTP {resp.status_code}"
        except Exception as e:
            upstream_msg = f"Upstream offline: {str(e)[:40]}"

        return {
            "success": upstream_success or settings.enable_simulation_fallback,
            "topic": "/cmd_vel",
            "linear_x": clamped_x,
            "angular_z": clamped_z,
            "message": upstream_msg,
            "upstream_published": upstream_success,
        }

    async def send_teleop(self, linear_x: float, angular_z: float, command: str = "stop") -> Dict[str, Any]:
        """Legacy compatibility wrapper for teleop endpoint."""
        res = await self.send_cmd_vel(linear_x, angular_z)
        res["command"] = command
        return res


robot_client = RobotApiClient()

