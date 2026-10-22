from pydantic import BaseModel, Field
from typing import Literal, Optional, List, Dict, Any


AllowedRobotCommand = Literal["start_patrol", "pause_patrol", "return_to_base"]


class RobotInfoResponse(BaseModel):
    robot: str = "Piper"
    api_status: str = "running"
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


class MapMetadata(BaseModel):
    frame_id: str = "map"
    coordinate_system: str = "local_metric_occupancy_grid"
    resolution: float = 0.05  # meters per cell
    width: int = 50           # cells
    height: int = 50          # cells
    origin_x: float = -1.25   # meters
    origin_y: float = -1.25   # meters
    status_badge: str = "DEMO DATA - NOT CONNECTED"
    is_simulated: bool = True


class SimulatedRobotPose(BaseModel):
    x: float = 0.0           # meters in local map frame
    y: float = 0.0           # meters in local map frame
    yaw_deg: float = 45.0    # heading in degrees
    is_simulated: bool = True
    notice: str = "Simulated coordinates for UI development only. Real robot API provides no pose endpoint."


class MapDataResponse(BaseModel):
    status_badge: str = "DEMO DATA - NOT CONNECTED"
    source: str = "simulated_local_occupancy_grid"
    metadata: MapMetadata
    grid: List[List[int]]  # 0 = free, 100 = occupied, -1 = unknown
    simulated_robot_pose: SimulatedRobotPose
    contract_docs: Dict[str, Any]


class RecognitionCandidate(BaseModel):
    event_id: str
    timestamp: str
    camera_source: str
    review_status: Literal["pending", "confirmed", "rejected"]
    candidate_label: str
    confidence_semantics: str
    evidence_ref: str
    notes: str
    is_simulated: bool = True


class RecognitionStatusResponse(BaseModel):
    status_badge: str = "NOT CONNECTED"
    status_message: str = (
        "External facial-recognition service has not been deployed. "
        "Displaying placeholder integration boundary and mock candidates for UI verification."
    )
    contract_requirements: Dict[str, Any]
    candidates: List[RecognitionCandidate]


class ActivityEvent(BaseModel):
    id: str
    timestamp: str
    category: Literal["connection", "command", "camera", "system", "perception"]
    level: Literal["info", "warning", "error", "success"]
    message: str
    is_simulated: bool = False
