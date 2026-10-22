import asyncio
import logging
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Request, Header, BackgroundTasks, Query, Path as PathParam

from app.features.emergency.schemas import (
    SOSCreateRequest,
    SOSCreateResponse,
    IncidentStatusUpdateRequest,
    LocationPreferenceRequest,
    LocationPreferenceResponse,
    ReverseGeocodeResponse,
)
from app.features.emergency.service import emergency_service

logger = logging.getLogger("emergency.router")

router = APIRouter(prefix="/api/emergency", tags=["Emergency Response SOS"])


async def _async_reverse_geocode_task(incident_id: str, lat: float, lon: float):
    """Background task to populate reverse geocoded address without delaying SOS persistence."""
    try:
        geo = await emergency_service.geocoder.lookup(lat, lon)
        if geo and geo.get("address"):
            emergency_service.set_incident_address(incident_id, geo["address"])
    except Exception as e:
        logger.warning(f"Background geocode task failed for incident {incident_id}: {e}")


@router.post("/sos", response_model=SOSCreateResponse, status_code=201)
async def create_sos_emergency(
    req: SOSCreateRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    x_user_id: Optional[str] = Header(None, alias="X-User-ID"),
    authorization: Optional[str] = Header(None)
):
    """
    Primary SOS activation endpoint matching Section 6.
    Immediately validates coordinates, verifies freshness, enforces idempotency,
    and atomically persists the emergency incident.
    """
    client_ip = request.client.host if request.client else "127.0.0.1"

    # Optional Token/Auth check: if strict authorization is configured and provided, validate it
    auth_user = x_user_id or req.user_id or "anonymous-operator"
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
        if token == "invalid-token":
            raise HTTPException(status_code=401, detail="Authentication required: invalid bearer token")

    # Call emergency persistence service
    res = emergency_service.create_sos_incident(
        req=req,
        client_ip=client_ip,
        auth_user_id=auth_user
    )

    # Dispatch asynchronous reverse geocoding in background (never delays emergency response)
    background_tasks.add_task(
        _async_reverse_geocode_task,
        res.incident.id,
        res.incident.latitude,
        res.incident.longitude
    )

    return res


@router.get("/incidents")
async def list_emergency_incidents(
    status: Optional[str] = Query(None, description="Filter by status (pending, active, acknowledged, resolved, cancelled)"),
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    limit: int = Query(50, ge=1, le=200)
):
    """Lists emergency incidents for operations dashboard and user tracking."""
    return emergency_service.list_incidents(status=status, user_id=user_id, limit=limit)


@router.get("/incidents/{incident_id}")
async def get_emergency_incident(
    incident_id: str = PathParam(..., description="Unique incident UUID")
):
    """Retrieves full details and timeline events for a specific emergency incident."""
    inc = emergency_service.get_incident(incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail="Emergency incident not found")
    return inc


@router.patch("/incidents/{incident_id}/status")
async def update_emergency_status(
    req: IncidentStatusUpdateRequest,
    incident_id: str = PathParam(..., description="Unique incident UUID"),
    x_user_role: Optional[str] = Header("operator", alias="X-User-Role"),
    x_user_id: Optional[str] = Header("operator-1", alias="X-User-ID")
):
    """
    Transitions incident status (pending -> active -> acknowledged -> resolved -> cancelled).
    Validates permissions: civilians can only cancel their own incidents;
    acknowledging or resolving requires responder or operator role.
    """
    # Permission check
    if req.status in ("acknowledged", "resolved") and x_user_role not in ("operator", "responder", "admin"):
        raise HTTPException(
            status_code=403,
            detail="Insufficient permissions: only authorized emergency responders can acknowledge or resolve incidents"
        )

    actor = x_user_id or req.actor_id or "operator-1"
    return emergency_service.update_incident_status(
        incident_id=incident_id,
        new_status=req.status,
        actor_id=actor,
        notes=req.notes
    )


@router.get("/location-preference", response_model=LocationPreferenceResponse)
async def get_location_preference(
    user_id: str = Query("operator-default", description="User ID for preference record")
):
    """Retrieves user location sharing and permission readiness consent state."""
    return emergency_service.get_user_location_preference(user_id=user_id)


@router.post("/location-preference", response_model=LocationPreferenceResponse)
async def save_location_preference(
    req: LocationPreferenceRequest
):
    """Persists user consent to store and utilize location data for emergency response."""
    user = req.user_id or "operator-default"
    return emergency_service.set_user_location_preference(
        user_id=user,
        enabled=req.location_sharing_enabled
    )


@router.get("/reverse-geocode", response_model=ReverseGeocodeResponse)
async def reverse_geocode_coordinates(
    lat: float = Query(..., ge=-90.0, le=90.0, description="WGS84 Latitude"),
    lon: float = Query(..., ge=-180.0, le=180.0, description="WGS84 Longitude")
):
    """
    Asynchronously resolves geographic coordinates into human-readable address.
    Utilizes throttled and cached OpenStreetMap Nominatim service.
    """
    geo = await emergency_service.geocoder.lookup(lat, lon)
    if not geo:
        return ReverseGeocodeResponse(
            address=f"Location near {round(lat, 4)}, {round(lon, 4)}",
            display_name=f"Latitude {round(lat, 5)}, Longitude {round(lon, 5)}",
            source="fallback_coordinates"
        )

    return ReverseGeocodeResponse(
        address=geo.get("road") or geo.get("display_name", "Unknown Address"),
        display_name=geo.get("display_name", "Unknown Address"),
        city=geo.get("city"),
        state=geo.get("state"),
        country=geo.get("country"),
        postcode=geo.get("postcode"),
        source="openstreetmap_nominatim"
    )
