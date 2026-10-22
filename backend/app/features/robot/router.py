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


from pydantic import BaseModel, Field
from typing import Optional


class CmdVelRequest(BaseModel):
    linear_x: float = Field(0.0, ge=-0.5, le=0.5, description="Linear velocity in m/s (-0.5 to 0.5)")
    angular_z: float = Field(0.0, ge=-1.0, le=1.0, description="Angular velocity in rad/s (-1.0 to 1.0)")


class CmdVelResponse(BaseModel):
    success: bool
    topic: str = "/cmd_vel"
    linear_x: float
    angular_z: float
    message: str


@router.post("/api/robot/cmd_vel", response_model=CmdVelResponse)
async def post_cmd_vel(request: CmdVelRequest):
    """
    Publishes one geometry_msgs/msg/Twist message to ROS 2 /cmd_vel topic.
    Strictly adheres to teammate's ROS 2 bridge API spec.
    """
    return await robot_client.send_cmd_vel(request.linear_x, request.angular_z)


class TeleopRequest(BaseModel):
    linear_x: float = Field(0.0, description="Forward/backward linear velocity in m/s")
    angular_z: float = Field(0.0, description="Rotational angular velocity in rad/s")
    command: Optional[str] = Field("stop", description="Action tag: forward, backward, left, right, stop")


@router.post("/api/robot/teleop")
async def post_robot_teleop(request: TeleopRequest):
    """
    Real-time teleoperation driving controller for manual rover navigation.
    Publishes linear and angular velocity to ROS 2 /cmd_vel and advances map coordinates.
    """
    return await robot_client.send_teleop(request.linear_x, request.angular_z, request.command or "drive")

