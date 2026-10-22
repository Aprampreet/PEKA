from fastapi import APIRouter
from app.features.robot.client import robot_client
from app.features.robot.schemas import (
    RobotInfoResponse,
    RobotStatusResponse,
    RobotCommandRequest,
    RobotCommandResponse,
)
from app.core.config import settings

router = APIRouter(tags=["Robot"])


@router.get("/api/health")
async def health():
    info = await robot_client.get_info()
    return {
        "dashboard_backend": "healthy",
        "robot_upstream_connected": info.upstream_connected,
        "robot_upstream_url": settings.piper_robot_api_url,
        "operational_mode": "live" if info.upstream_connected else "standby_demo",
    }


@router.get("/api/robot/info", response_model=RobotInfoResponse)
async def get_robot_info():
    """Checks upstream robot service identity (GET / on external robot API)."""
    return await robot_client.get_info()


@router.get("/api/robot/status", response_model=RobotStatusResponse)
async def get_robot_status():
    """
    Fetches cached status object from upstream GET /api/robot/status.
    Detects stale data and provides fallback during link loss.
    """
    return await robot_client.get_status()


@router.post("/api/robot/command", response_model=RobotCommandResponse)
async def post_robot_command(request: RobotCommandRequest):
    """
    Dispatches one of three supported robot commands:
    - start_patrol
    - pause_patrol
    - return_to_base
    Confirms publication to ROS bridge (does NOT claim physical execution).
    """
    return await robot_client.send_command(request.command)
