from typing import List, Dict, Any
from pydantic import BaseModel


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
