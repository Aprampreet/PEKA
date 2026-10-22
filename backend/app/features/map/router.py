from fastapi import APIRouter
from app.features.map.adapter import map_adapter
from app.features.map.schemas import MapDataResponse

router = APIRouter(prefix="/api/map", tags=["Map"])


@router.get("/data", response_model=MapDataResponse)
async def get_map_data():
    """
    Returns local occupancy grid coordinates and spatial metadata.
    Currently labeled DEMO DATA - NOT CONNECTED until upstream ROS /map node is linked.
    """
    return map_adapter.get_map_data()
