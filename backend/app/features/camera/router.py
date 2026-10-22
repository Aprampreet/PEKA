import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from app.features.robot.client import robot_client

router = APIRouter(prefix="/api/camera", tags=["Camera"])


@router.get("/stream")
async def get_camera_stream():
    """
    MJPEG stream proxying upstream GET /api/camera/stream with multipart/x-mixed-replace.
    If upstream is unavailable, outputs a dynamic simulated HUD test pattern.
    """
    return StreamingResponse(
        robot_client.stream_mjpeg(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Connection": "close",
        }
    )


@router.websocket("/ws")
async def websocket_camera_stream(websocket: WebSocket):
    """
    High-performance binary WebSocket frame stream.
    Transmits each JPEG frame as a binary message directly to the browser,
    eliminating HTTP multipart buffering, head-of-line blocking, and lag.
    """
    await websocket.accept()
    try:
        async for frame_bytes in robot_client.stream_ws_frames():
            await websocket.send_bytes(frame_bytes)
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    except Exception:
        pass
