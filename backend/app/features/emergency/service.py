import json
import logging
import sqlite3
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Tuple
from fastapi import HTTPException
import httpx

from app.core.database import get_db_connection
from app.core.events import event_logger
from app.features.emergency.schemas import (
    SOSCreateRequest,
    SOSIncidentSummary,
    SOSCreateResponse,
    ALLOWED_STATUSES,
)

logger = logging.getLogger("emergency.service")


class RateLimiter:
    """Sliding-window rate limiter per client key (IP or user ID)."""

    def __init__(self, max_requests: int = 15, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests: Dict[str, List[float]] = {}

    def is_allowed(self, client_key: str) -> Tuple[bool, int]:
        now = time.time()
        timestamps = self.requests.get(client_key, [])
        # Prune expired timestamps
        cutoff = now - self.window_seconds
        valid_timestamps = [t for t in timestamps if t > cutoff]
        self.requests[client_key] = valid_timestamps

        if len(valid_timestamps) >= self.max_requests:
            retry_after = int(self.window_seconds - (now - valid_timestamps[0])) + 1
            return False, max(1, retry_after)

        self.requests[client_key].append(now)
        return True, 0


class ReverseGeocoder:
    """In-memory cached and throttled reverse geocoder using OpenStreetMap Nominatim."""

    def __init__(self):
        self.cache: Dict[str, Dict[str, Any]] = {}
        self.last_request_time = 0.0

    async def lookup(self, lat: float, lon: float) -> Optional[Dict[str, Any]]:
        cache_key = f"{round(lat, 4)},{round(lon, 4)}"
        if cache_key in self.cache:
            return self.cache[cache_key]

        # Respect OSM Nominatim usage policy (max 1 req/sec)
        now = time.time()
        elapsed = now - self.last_request_time
        if elapsed < 1.0:
            import asyncio
            await asyncio.sleep(1.0 - elapsed)

        url = "https://nominatim.openstreetmap.org/reverse"
        headers = {
            "User-Agent": "PEKA-Emergency-Response-System/1.0 (rescue-ops@piper-intel.local)",
            "Accept": "application/json",
        }
        params = {
            "lat": lat,
            "lon": lon,
            "format": "jsonv2",
            "addressdetails": 1,
            "zoom": 18,
        }

        try:
            self.last_request_time = time.time()
            async with httpx.AsyncClient(timeout=4.0) as client:
                resp = await client.get(url, params=params, headers=headers)
                if resp.status_code == 200:
                    data = resp.json()
                    addr = data.get("address", {})
                    display_name = data.get("display_name", "Unknown Location")
                    result = {
                        "address": display_name,
                        "display_name": display_name,
                        "road": addr.get("road") or addr.get("pedestrian") or addr.get("suburb"),
                        "city": addr.get("city") or addr.get("town") or addr.get("village") or addr.get("county"),
                        "state": addr.get("state"),
                        "country": addr.get("country"),
                        "postcode": addr.get("postcode"),
                    }
                    self.cache[cache_key] = result
                    return result
        except Exception as e:
            logger.warning(f"Reverse geocode lookup failed: {e}")

        return None


class EmergencyService:
    def __init__(self):
        self.rate_limiter = RateLimiter(max_requests=15, window_seconds=60)
        self.geocoder = ReverseGeocoder()

    def validate_timestamp(self, captured_at_str: str) -> datetime:
        """Validates timestamp format, reasonable clock skew, and freshness."""
        try:
            # Replace 'Z' with +00:00 for fromisoformat compatibility
            clean_str = captured_at_str.replace("Z", "+00:00")
            dt = datetime.fromisoformat(clean_str)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
        except Exception as e:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid location timestamp format: {e}. Expected ISO-8601 format."
            )

        now = datetime.now(timezone.utc)
        # Check future clock skew (allow up to 5 minutes for client drift)
        if dt > now + timedelta(minutes=5):
            raise HTTPException(
                status_code=422,
                detail="Location timestamp is in the future. Please check device system clock."
            )

        # Check staleness: Reject positions captured > 24 hours ago
        if dt < now - timedelta(hours=24):
            raise HTTPException(
                status_code=422,
                detail="Location timestamp is stale (> 24 hours). A fresh geolocation fix is required."
            )

        return dt

    def create_sos_incident(
        self,
        req: SOSCreateRequest,
        client_ip: str = "127.0.0.1",
        auth_user_id: Optional[str] = None
    ) -> SOSCreateResponse:
        """
        Creates an emergency incident with validated coordinates and idempotency protection.
        Matches Section 6: /api/emergency/sos endpoint specifications.
        """
        # 1. Check Rate Limit
        rate_key = f"{client_ip}:{auth_user_id or 'anon'}"
        allowed, retry_after = self.rate_limiter.is_allowed(rate_key)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded. Emergency activation throttled. Please retry in {retry_after}s.",
                headers={"Retry-After": str(retry_after)}
            )

        # 2. Validate Coordinate Telemetry and Freshness
        self.validate_timestamp(req.location_captured_at)

        # 3. Connect to Database with strict Foreign Keys and WAL Mode
        conn = get_db_connection()
        cursor = conn.cursor()

        try:
            # 4. Check Idempotency Key
            cursor.execute(
                "SELECT * FROM emergency_incidents WHERE idempotency_key = ?",
                (req.idempotency_key,)
            )
            existing = cursor.fetchone()

            if existing:
                existing_dict = dict(existing)
                # Verify coordinates match existing incident within ~10 meters (0.0001 deg)
                lat_diff = abs(existing_dict["latitude"] - req.latitude)
                lon_diff = abs(existing_dict["longitude"] - req.longitude)

                if lat_diff > 0.001 or lon_diff > 0.001:
                    # Conflicting payload reused same key
                    conn.close()
                    raise HTTPException(
                        status_code=409,
                        detail="Conflicting or invalid idempotency request: idempotency key was previously submitted with different coordinates."
                    )

                # Return existing incident idempotently
                conn.close()
                return SOSCreateResponse(
                    success=True,
                    message="Idempotent replay: emergency incident already recorded",
                    incident=SOSIncidentSummary(
                        id=existing_dict["id"],
                        status=existing_dict["status"],
                        latitude=existing_dict["latitude"],
                        longitude=existing_dict["longitude"],
                        location_accuracy_meters=existing_dict["location_accuracy_meters"],
                        created_at=existing_dict["created_at"],
                        updated_at=existing_dict["updated_at"],
                        location_source=existing_dict["location_source"],
                        address=existing_dict["address"],
                        description=existing_dict["description"],
                        user_id=existing_dict["user_id"],
                        idempotency_key=existing_dict["idempotency_key"],
                    )
                )

            # 5. Generate Server-Side Identifiers & Timestamps
            incident_id = str(uuid.uuid4())
            now_iso = datetime.now(timezone.utc).isoformat()
            user_id = auth_user_id or req.user_id or "anonymous-operator"
            initial_status = "pending"

            # 6. Execute Atomic Transaction: Insert Incident + Insert Audit Event
            conn.execute("BEGIN TRANSACTION;")

            cursor.execute(
                """
                INSERT INTO emergency_incidents (
                    id, user_id, idempotency_key, status, latitude, longitude,
                    location_accuracy_meters, location_captured_at, location_source,
                    address, description, created_at, updated_at, resolved_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
                """,
                (
                    incident_id,
                    user_id,
                    req.idempotency_key,
                    initial_status,
                    req.latitude,
                    req.longitude,
                    req.accuracy_meters,
                    req.location_captured_at,
                    req.location_source,
                    None,  # Address populated asynchronously
                    req.description,
                    now_iso,
                    now_iso,
                )
            )

            # Insert initial creation audit event
            event_id = str(uuid.uuid4())
            cursor.execute(
                """
                INSERT INTO emergency_incident_events (
                    id, incident_id, actor_user_id, event_type, metadata, created_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    event_id,
                    incident_id,
                    user_id,
                    "incident_created",
                    json.dumps({
                        "latitude": req.latitude,
                        "longitude": req.longitude,
                        "accuracy_meters": req.accuracy_meters,
                        "location_source": req.location_source,
                        "is_test_mode": req.is_test_mode,
                    }),
                    now_iso,
                )
            )

            # Insert into system-wide audit_logs for Mission History integration
            cursor.execute(
                """
                INSERT INTO audit_logs (timestamp, actor, action, target_id, details)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    now_iso,
                    user_id,
                    "SOS_EMERGENCY_ACTIVATED",
                    incident_id,
                    f"SOS Emergency beacon triggered at [{req.latitude}, {req.longitude}] (Accuracy: ±{req.accuracy_meters}m). Test mode: {req.is_test_mode}"
                )
            )

            conn.commit()

            # Log to system event feed
            event_logger.log(
                category="system",
                level="error",
                message=f"SOS EMERGENCY ACTIVATED! Incident ID: {incident_id[:8]} at [{req.latitude}, {req.longitude}] (Accuracy: {req.accuracy_meters}m)"
            )

            return SOSCreateResponse(
                success=True,
                message="Emergency incident successfully persisted to database",
                incident=SOSIncidentSummary(
                    id=incident_id,
                    status=initial_status,
                    latitude=req.latitude,
                    longitude=req.longitude,
                    location_accuracy_meters=req.accuracy_meters,
                    created_at=now_iso,
                    updated_at=now_iso,
                    location_source=req.location_source,
                    address=None,
                    description=req.description,
                    user_id=user_id,
                    idempotency_key=req.idempotency_key,
                    is_test=req.is_test_mode,
                )
            )

        except HTTPException:
            raise
        except sqlite3.IntegrityError as e:
            conn.rollback()
            raise HTTPException(
                status_code=400,
                detail=f"Database constraint violation: {e}"
            )
        except Exception as e:
            conn.rollback()
            logger.error(f"Failed to persist SOS incident: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Incident persistence failure: {e}"
            )
        finally:
            conn.close()

    def get_incident(self, incident_id: str) -> Optional[Dict[str, Any]]:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM emergency_incidents WHERE id = ?", (incident_id,))
        row = cursor.fetchone()
        if not row:
            conn.close()
            return None

        incident = dict(row)
        cursor.execute(
            "SELECT * FROM emergency_incident_events WHERE incident_id = ? ORDER BY created_at ASC",
            (incident_id,)
        )
        events = [dict(r) for r in cursor.fetchall()]
        for e in events:
            if e.get("metadata"):
                try:
                    e["metadata"] = json.loads(e["metadata"])
                except Exception:
                    pass
        incident["events"] = events
        conn.close()
        return incident

    def list_incidents(
        self,
        status: Optional[str] = None,
        user_id: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        conn = get_db_connection()
        cursor = conn.cursor()

        query = "SELECT * FROM emergency_incidents"
        params = []
        conditions = []

        if status:
            conditions.append("status = ?")
            params.append(status.lower())
        if user_id:
            conditions.append("user_id = ?")
            params.append(user_id)

        if conditions:
            query += " WHERE " + " AND ".join(conditions)

        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)

        cursor.execute(query, tuple(params))
        rows = [dict(r) for r in cursor.fetchall()]
        conn.close()
        return rows

    def update_incident_status(
        self,
        incident_id: str,
        new_status: str,
        actor_id: str = "operator-1",
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Validates state machine transitions and logs auditable event.
        Allowed transitions:
        pending -> active, cancelled
        active -> acknowledged, resolved, cancelled
        acknowledged -> resolved, cancelled
        """
        new_status = new_status.lower()
        if new_status not in ALLOWED_STATUSES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status: {new_status}. Allowed: {', '.join(sorted(ALLOWED_STATUSES))}"
            )

        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM emergency_incidents WHERE id = ?", (incident_id,))
        incident = cursor.fetchone()
        if not incident:
            conn.close()
            raise HTTPException(status_code=404, detail="Incident not found")

        current_status = incident["status"]

        # Validate Allowed Transitions
        valid_transitions = {
            "pending": {"active", "cancelled"},
            "active": {"acknowledged", "resolved", "cancelled"},
            "acknowledged": {"resolved", "cancelled"},
            "resolved": set(),  # Terminal
            "cancelled": set(),  # Terminal
        }

        if new_status != current_status and new_status not in valid_transitions.get(current_status, set()):
            conn.close()
            raise HTTPException(
                status_code=400,
                detail=f"Illegal status transition from '{current_status}' to '{new_status}'"
            )

        now_iso = datetime.now(timezone.utc).isoformat()
        resolved_at = now_iso if new_status in ("resolved", "cancelled") else None

        conn.execute("BEGIN TRANSACTION;")
        cursor.execute(
            """
            UPDATE emergency_incidents
            SET status = ?, updated_at = ?, resolved_at = COALESCE(?, resolved_at)
            WHERE id = ?
            """,
            (new_status, now_iso, resolved_at, incident_id)
        )

        event_id = str(uuid.uuid4())
        cursor.execute(
            """
            INSERT INTO emergency_incident_events (
                id, incident_id, actor_user_id, event_type, metadata, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                event_id,
                incident_id,
                actor_id,
                f"status_changed_to_{new_status}",
                json.dumps({
                    "previous_status": current_status,
                    "new_status": new_status,
                    "notes": notes,
                }),
                now_iso,
            ),
        )
        cursor.execute(
            """
            INSERT INTO audit_logs (timestamp, actor, action, target_id, details)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                now_iso,
                actor_id,
                f"SOS_STATUS_{new_status.upper()}",
                incident_id,
                f"SOS incident transitioned from {current_status} to {new_status}. Notes: {notes or 'None'}"
            )
        )

        conn.commit()
        conn.close()

        event_logger.log(
            category="system",
            level="info",
            message=f"SOS Incident {incident_id[:8]} transitioned: {current_status} -> {new_status} by {actor_id}"
        )

        return self.get_incident(incident_id)

    def set_incident_address(self, incident_id: str, address: str):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE emergency_incidents SET address = ? WHERE id = ?",
            (address, incident_id)
        )
        conn.commit()
        conn.close()

    def get_user_location_preference(self, user_id: str) -> Dict[str, Any]:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT * FROM user_location_preferences WHERE user_id = ?",
            (user_id,)
        )
        row = cursor.fetchone()
        conn.close()

        if row:
            d = dict(row)
            return {
                "userId": d["user_id"],
                "locationSharingEnabled": bool(d["location_sharing_enabled"]),
                "consentRecordedAt": d["consent_recorded_at"],
                "updatedAt": d["updated_at"],
            }

        now_iso = datetime.now(timezone.utc).isoformat()
        return {
            "userId": user_id,
            "locationSharingEnabled": False,
            "consentRecordedAt": now_iso,
            "updatedAt": now_iso,
        }

    def set_user_location_preference(self, user_id: str, enabled: bool) -> Dict[str, Any]:
        conn = get_db_connection()
        cursor = conn.cursor()
        now_iso = datetime.now(timezone.utc).isoformat()

        cursor.execute(
            """
            INSERT INTO user_location_preferences (user_id, location_sharing_enabled, consent_recorded_at, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                location_sharing_enabled = excluded.location_sharing_enabled,
                updated_at = excluded.updated_at
            """,
            (user_id, 1 if enabled else 0, now_iso, now_iso)
        )
        conn.commit()
        conn.close()

        return {
            "userId": user_id,
            "locationSharingEnabled": enabled,
            "consentRecordedAt": now_iso,
            "updatedAt": now_iso,
        }


emergency_service = EmergencyService()
