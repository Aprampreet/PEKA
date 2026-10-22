from typing import Optional
from fastapi import APIRouter, HTTPException, Path as PathParam, Query
from fastapi.responses import HTMLResponse
from app.features.observations.service import observation_manager
from app.features.observations.schemas import IncidentCreateRequest
from app.features.reports.generator import generate_incident_html_report

router = APIRouter(tags=["Observations & Incidents"])


@router.get("/api/observations")
async def list_observations(status: Optional[str] = Query(None)):
    """Lists observations with matched candidate dossier from database."""
    return observation_manager.list_observations(status=status)


@router.post("/api/observations/trigger")
async def trigger_observation():
    """Triggers an observation detection on camera stream, matches candidate, and saves evidence."""
    return observation_manager.trigger_observation()


@router.delete("/api/observations/unreviewed")
async def clear_unreviewed_observations():
    """Purges unreviewed observation queue to reset clean state."""
    count = observation_manager.clear_unreviewed_observations()
    return {"status": "cleared", "count": count}


@router.post("/api/observations/{obs_id}/review")
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


@router.post("/api/incidents")
async def create_incident(request: IncidentCreateRequest):
    """Creates an official incident report from a confirmed observation."""
    return observation_manager.create_incident(
        obs_id=request.observation_id,
        priority=request.priority,
        assigned_team=request.assigned_team,
        summary=request.summary
    )


@router.get("/api/incidents")
async def list_incidents():
    """Lists all official incident reports."""
    return observation_manager.list_incidents()


@router.get("/api/incidents/{incident_id}/report")
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
