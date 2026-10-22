from typing import List
from fastapi import APIRouter, Query
from app.core.events import event_logger, ActivityEvent

router = APIRouter(prefix="/api/events", tags=["Activity Events"])


@router.get("/feed", response_model=List[ActivityEvent])
async def get_activity_feed(limit: int = Query(50, ge=1, le=100)):
    """
    Returns actual observed client/system events (connections, commands, errors).
    """
    return event_logger.get_events(limit=limit)
