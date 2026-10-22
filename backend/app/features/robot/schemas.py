from typing import Literal
from pydantic import BaseModel, Field

AllowedRobotCommand = Literal["start_patrol", "pause_patrol", "return_to_base"]


class RobotInfoResponse(BaseModel):
    robot: str
    api_status: str
    upstream_connected: bool
    source: Literal["live", "demo"]
    upstream_url: str


class RobotStatusResponse(BaseModel):
    state: str
    message: str
    upstream_available: bool
    is_stale: bool = False
    last_updated_at: str
    source: Literal["live", "demo"]


class RobotCommandRequest(BaseModel):
    command: AllowedRobotCommand = Field(
        ...,
        description="One of the three commands supported by the robot API: start_patrol, pause_patrol, return_to_base"
    )


class RobotCommandResponse(BaseModel):
    command: str
    status: Literal["published_to_ros", "simulated", "failed"]
    detail: str
    disclaimer: str = (
        "Command publication confirmed to ROS 2 bridge. Does NOT verify physical robot execution. "
        "Software controls do NOT replace a physical hardware Emergency Stop."
    )
    timestamp: str
