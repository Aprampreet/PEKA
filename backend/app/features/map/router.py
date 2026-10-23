from fastapi import APIRouter, HTTPException
from app.features.map.adapter import map_adapter
from app.features.map.schemas import MapDataResponse
from app.features.robot.client import robot_client

router = APIRouter(prefix="/api/map", tags=["Map"])


@router.get("/data", response_model=MapDataResponse)
async def get_map_data():
    """
    Returns 2D occupancy grid and spatial metadata.
    Adapts live RTAB-Map ROS 2 /map occupancy grid from upstream when connected,
    or falls back gracefully.
    """
    return await map_adapter.get_map_data()


@router.get("/occupancy-grid")
async def get_occupancy_grid():
    """
    Direct endpoint matching ROS 2 RTAB-Map Occupancy Grid API specification.
    Proxies to upstream GET /api/map/occupancy-grid.
    Returns 503 if no map message has been received yet from ROS 2.
    """
    grid = await robot_client.get_occupancy_grid()
    if grid is not None:
        return grid

    raise HTTPException(
        status_code=503,
        detail={"message": "No occupancy grid has been received", "topic": "/map"}
    )
