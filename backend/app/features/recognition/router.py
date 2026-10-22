from fastapi import APIRouter, HTTPException, Path as PathParam, Query
from app.features.recognition.adapter import recognition_adapter
from app.features.recognition.schemas import RecognitionStatusResponse
from app.core.events import event_logger

router = APIRouter(prefix="/api/recognition", tags=["Recognition"])


@router.get("/events", response_model=RecognitionStatusResponse)
async def get_recognition_events():
    """
    Boundary for future external facial recognition / victim identification service.
    Currently labeled NOT CONNECTED with clear contract specifications.
    """
    return recognition_adapter.get_status()


@router.post("/candidate/{event_id}/review")
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
