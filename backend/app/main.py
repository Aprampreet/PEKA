import asyncio
import sys
from pathlib import Path
from contextlib import asynccontextmanager
from typing import List, Optional
from pydantic import BaseModel

# Ensure 'backend' directory is on sys.path regardless of working directory
backend_dir = str(Path(__file__).resolve().parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from fastapi import FastAPI, HTTPException, Path as PathParam, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.db import EVIDENCE_DIR
from app.observations import observation_manager
from app.report_generator import generate_incident_html_report

from app.config import settings
from app.client import robot_client
from app.map_adapter import map_adapter
from app.recognition_adapter import recognition_adapter
from app.event_log import event_logger
from app.schemas import (
    RobotInfoResponse,
    RobotStatusResponse,
    RobotCommandRequest,
    RobotCommandResponse,
    MapDataResponse,
    RecognitionStatusResponse,
    ActivityEvent,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    event_logger.log(
        category="system",
        
        level="info",
        message=f"PIPER Rescue Dashboard Backend starting on port {settings.backend_port}."
    )
    yield
    await robot_client.close()
    event_logger.log(
        category="system",
        level="info",
        message="PIPER Rescue Dashboard Backend shutdown completed."
    )


app = FastAPI(
    title="PIPER Rescue Intelligence API",
    description="Emergency Response Operator Dashboard Backend for PIPER ROS 2 Rescue Robot",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve evidence images (photos, crops, avatars)
app.mount("/evidence", StaticFiles(directory=str(EVIDENCE_DIR)), name="evidence")


@app.get("/")
async def root():
    return {
        "service": "PIPER Rescue Intelligence Dashboard Backend",
        "status": "operational",
        "version": "1.0.0",
        "docs_url": "/docs",
        "robot_upstream": settings.piper_robot_api_url,
    }


@app.get("/api/health")
async def health():
    info = await robot_client.get_info()
    return {
        "dashboard_backend": "healthy",
        "robot_upstream_connected": info.upstream_connected,
        "robot_upstream_url": settings.piper_robot_api_url,
        "operational_mode": "live" if info.upstream_connected else "standby_demo",
    }


@app.get("/api/robot/info", response_model=RobotInfoResponse)
async def get_robot_info():
    """
    Checks upstream robot service identity (GET / on external robot API).
    """
    return await robot_client.get_info()


@app.get("/api/robot/status", response_model=RobotStatusResponse)
async def get_robot_status():
    """
    Fetches cached status object from upstream GET /api/robot/status.
    Detects stale data and provides fallback during link loss.
    """
    return await robot_client.get_status()


@app.post("/api/robot/command", response_model=RobotCommandResponse)
async def post_robot_command(request: RobotCommandRequest):
    """
    Dispatches one of three supported robot commands:
    - start_patrol
    - pause_patrol
    - return_to_base
    Confirms publication to ROS bridge (does NOT claim physical execution).
    """
    return await robot_client.send_command(request.command)


@app.get("/api/camera/stream")
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


@app.websocket("/api/camera/ws")
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


@app.get("/api/lidar/status")
async def get_lidar_status():
    """
    Returns Point-LIO LiDAR reception and stream status.
    Proxies upstream robot GET /api/lidar/status.
    """
    return await robot_client.get_lidar_status()


@app.websocket("/api/lidar/ws")
@app.websocket("/ws/lidar")
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


@app.get("/api/map/data", response_model=MapDataResponse)
async def get_map_data():
    """
    Returns local occupancy grid coordinates and spatial metadata.
    Currently labeled DEMO DATA - NOT CONNECTED until upstream ROS /map node is linked.
    """
    return map_adapter.get_map_data()


@app.get("/api/recognition/events", response_model=RecognitionStatusResponse)
async def get_recognition_events():
    """
    Boundary for future external facial recognition / victim identification service.
    Currently labeled NOT CONNECTED with clear contract specifications.
    """
    return recognition_adapter.get_status()


@app.post("/api/recognition/candidate/{event_id}/review")
async def review_recognition_candidate(
    event_id: str = PathParam(..., description="ID of the candidate event"),
    decision: str = Query(..., pattern="^(confirmed|rejected|pending)$")
):
    """
    Simulates human-in-the-loop review confirmation/rejection of unverified candidate.
    """
    updated = recognition_adapter.update_candidate_status(event_id, decision)
    if not updated:
        raise HTTPException(status_code=404, detail="Candidate event not found")
    
    event_logger.log(
        category="system",
        level="info",
        message=f"[DEMO REVIEW] Candidate {event_id} marked as '{decision}' by operator.",
        is_simulated=True
    )
    return {"status": "updated", "candidate": updated}


@app.get("/api/events/feed", response_model=List[ActivityEvent])
async def get_activity_feed(limit: int = Query(50, ge=1, le=100)):
    """
    Returns actual observed client/system events (connections, commands, errors).
    """
    return event_logger.get_events(limit=limit)


# ==============================================================================
# Survivor Observation & Incident Pipeline (Sections 10, 11, 13, 14)
# ==============================================================================

class IncidentCreateRequest(BaseModel):
    observation_id: str
    priority: str = "P1 - Immediate"
    assigned_team: str = "Team Alpha (Search & Rescue)"
    summary: str = ""


@app.get("/api/observations")
async def list_observations(status: Optional[str] = Query(None)):
    """Lists observations with matched candidate dossier from database."""
    return observation_manager.list_observations(status=status)


@app.post("/api/observations/trigger")
async def trigger_observation():
    """Triggers an observation detection on camera stream, matches candidate, and saves evidence."""
    return observation_manager.trigger_observation()


@app.delete("/api/observations/unreviewed")
async def clear_unreviewed_observations():
    """Purges unreviewed observation queue to reset clean state."""
    count = observation_manager.clear_unreviewed_observations()
    return {"status": "cleared", "count": count}



@app.post("/api/observations/{obs_id}/review")
async def review_observation(
    obs_id: str = PathParam(..., description="Observation ID"),
    decision: str = Query(..., pattern="^(confirmed|rejected|uncertain)$"),
    notes: str = Query("", description="Operator verification notes")
):
    """Submits human-in-the-loop review decision (confirm / reject / uncertain)."""
    updated = observation_manager.review_observation(obs_id, decision, notes)
    if not updated:
        raise HTTPException(status_code=404, detail="Observation not found")
    return updated


@app.post("/api/incidents")
async def create_incident(request: IncidentCreateRequest):
    """Creates an official incident report from a confirmed observation."""
    return observation_manager.create_incident(
        obs_id=request.observation_id,
        priority=request.priority,
        assigned_team=request.assigned_team,
        summary=request.summary
    )


@app.get("/api/incidents")
async def list_incidents():
    """Lists all official incident reports."""
    return observation_manager.list_incidents()


@app.get("/api/incidents/{incident_id}/report")
async def get_incident_report(incident_id: str = PathParam(..., description="Incident ID")):
    """Generates 1-page printable disaster incident report matching Section 13."""
    incidents = observation_manager.list_incidents()
    target_inc = next((i for i in incidents if i["id"] == incident_id or i["incident_code"] == incident_id), None)
    if not target_inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    obs = observation_manager.get_observation(target_inc["observation_id"])
    if not obs:
        raise HTTPException(status_code=404, detail="Observation data not found")
    
    html = generate_incident_html_report(target_inc, obs)
    return HTMLResponse(content=html)


# ==============================================================================
# Persons Registry & Face Enrollment API
# ==============================================================================

class PersonEnrollRequest(BaseModel):
    full_name: str
    category: str = "Missing Civilian"  # "Missing Civilian", "Operator / Team Lead", "Emergency Responder", "VIP"
    badge_or_id: Optional[str] = None
    reported_last_seen: Optional[str] = None
    medical_alerts: Optional[str] = None
    photo_base64: Optional[str] = None
    capture_from_camera: bool = False


@app.get("/api/registry/persons")
async def list_registry_persons():
    """Lists all enrolled persons in the facial recognition database."""
    return observation_manager.list_persons()


@app.post("/api/registry/persons")
async def enroll_person(req: PersonEnrollRequest):
    """
    Enrolls a person into the facial recognition database.
    Can either use an uploaded photo or grab the current live camera frame snapshot.
    """
    import base64
    import uuid
    import cv2
    import numpy as np
    from app.perception import perception_engine

    photo_fn = None
    filename_id = f"person_{uuid.uuid4().hex[:8]}.jpg"
    photo_path = EVIDENCE_DIR / filename_id

    if req.capture_from_camera:
        raw_frame = perception_engine.get_latest_raw_frame()
        if raw_frame:
            np_arr = np.frombuffer(raw_frame, np.uint8)
            frame_bgr = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            if frame_bgr is not None:
                # Try to crop detected face if one exists
                gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
                faces = perception_engine.face_cascade.detectMultiScale(gray, 1.15, 3, minSize=(30, 30))
                if len(faces) == 0 and hasattr(perception_engine, "face_cascade_alt2"):
                    faces = perception_engine.face_cascade_alt2.detectMultiScale(gray, 1.15, 3, minSize=(30, 30))
                if len(faces) == 0 and hasattr(perception_engine, "profile_cascade"):
                    faces = perception_engine.profile_cascade.detectMultiScale(gray, 1.15, 3, minSize=(30, 30))
                if len(faces) > 0:
                    fx, fy, fw, fh = faces[0]
                    pad_x = int(fw * 0.15)
                    pad_y = int(fh * 0.15)
                    x1 = max(0, fx - pad_x)
                    y1 = max(0, fy - pad_y)
                    x2 = min(frame_bgr.shape[1], fx + fw + pad_x)
                    y2 = min(frame_bgr.shape[0], fy + fh + pad_y)
                    crop = frame_bgr[y1:y2, x1:x2]
                    cv2.imwrite(str(photo_path), crop)
                else:
                    # Save entire frame if no face isolated
                    cv2.imwrite(str(photo_path), frame_bgr)
                photo_fn = filename_id

    if not photo_fn and req.photo_base64:
        try:
            b64_data = req.photo_base64
            if "," in b64_data:
                b64_data = b64_data.split(",", 1)[1]
            img_bytes = base64.b64decode(b64_data)
            with open(photo_path, "wb") as f:
                f.write(img_bytes)
            photo_fn = filename_id
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid photo image data: {str(e)[:80]}")

    new_person = observation_manager.add_person(
        full_name=req.full_name,
        category=req.category,
        badge_or_id=req.badge_or_id,
        photo_filename=photo_fn,
        reported_last_seen=req.reported_last_seen,
        medical_alerts=req.medical_alerts,
    )

    # Immediately reload perception cache so live camera recognizes the face
    perception_engine.reload_registry()

    return new_person


@app.delete("/api/registry/persons/{person_id}")
async def delete_registry_person(person_id: str = PathParam(..., description="Person ID")):
    """Removes a person from the recognition registry."""
    from app.perception import perception_engine
    success = observation_manager.delete_person(person_id)
    if not success:
        raise HTTPException(status_code=404, detail="Person not found")
    perception_engine.reload_registry()
    return {"status": "deleted", "id": person_id}

