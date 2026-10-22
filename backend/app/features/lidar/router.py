import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.features.robot.client import robot_client

router = APIRouter(tags=["LiDAR"])


@router.get("/api/lidar/status")
async def get_lidar_status():
    """
    Returns Point-LIO LiDAR reception and stream status.
    Proxies upstream robot GET /api/lidar/status.
    """
    return await robot_client.get_lidar_status()


@router.websocket("/api/lidar/ws")
@router.websocket("/ws/lidar")
async def websocket_lidar_stream(websocket: WebSocket):
    """
    Streams Point-LIO 3D registered pointcloud binary frames.
    Protocol: piper.pointcloud.v1 (Big-endian JSON header + raw packed records).
    """
    await websocket.accept()
    try:
        async for packet in robot_client.stream_lidar_ws_frames():
            await websocket.send_bytes(packet)
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    except Exception:
        pass
