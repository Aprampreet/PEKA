import pytest
import uuid
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.core.database import init_database, get_db_connection
from app.features.emergency.service import emergency_service


@pytest.fixture(autouse=True)
def setup_db():
    init_database()
    yield


@pytest.mark.asyncio
async def test_sos_submission_success():
    """Integration Test: Successful SOS submission stores verified coordinates in database."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        idempotency_key = str(uuid.uuid4())
        now_iso = datetime.now(timezone.utc).isoformat()

        payload = {
            "idempotencyKey": idempotency_key,
            "latitude": 31.326,
            "longitude": 75.576,
            "accuracyMeters": 12.5,
            "locationCapturedAt": now_iso,
            "locationSource": "browser_geolocation",
            "description": "Test civilian distress call"
        }

        resp = await client.post("/api/emergency/sos", json=payload)
        assert resp.status_code == 201
        data = resp.json()
        assert data["success"] is True
        incident = data["incident"]
        assert incident["id"] is not None
        assert incident["status"] == "pending"
        assert incident["latitude"] == 31.326
        assert incident["longitude"] == 75.576
        assert incident["locationAccuracyMeters"] == 12.5
        assert incident["createdAt"] is not None

        # Verify database record
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM emergency_incidents WHERE id = ?", (incident["id"],))
        row = cursor.fetchone()
        conn.close()
        assert row is not None
        assert row["idempotency_key"] == idempotency_key
        assert row["status"] == "pending"


@pytest.mark.asyncio
async def test_sos_idempotency_same_key_duplicate_protection():
    """Test idempotency: A retry with the same key returns existing incident without creating a duplicate."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        idempotency_key = str(uuid.uuid4())
        now_iso = datetime.now(timezone.utc).isoformat()

        payload = {
            "idempotencyKey": idempotency_key,
            "latitude": 37.7749,
            "longitude": -122.4194,
            "accuracyMeters": 8.0,
            "locationCapturedAt": now_iso,
            "locationSource": "browser_geolocation",
            "description": "Initial emergency dispatch"
        }

        # First request
        resp1 = await client.post("/api/emergency/sos", json=payload)
        assert resp1.status_code == 201
        data1 = resp1.json()
        inc_id1 = data1["incident"]["id"]

        # Duplicate click or network retry
        resp2 = await client.post("/api/emergency/sos", json=payload)
        assert resp2.status_code in (200, 201)
        data2 = resp2.json()
        inc_id2 = data2["incident"]["id"]

        # Must return identical incident without duplicate insertion
        assert inc_id1 == inc_id2

        # Verify only 1 record exists in database
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as cnt FROM emergency_incidents WHERE idempotency_key = ?", (idempotency_key,))
        count = cursor.fetchone()["cnt"]
        conn.close()
        assert count == 1


@pytest.mark.asyncio
async def test_sos_idempotency_conflict_error():
    """Test 409 Conflict: Reusing same idempotency key with conflicting coordinates."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        idempotency_key = str(uuid.uuid4())
        now_iso = datetime.now(timezone.utc).isoformat()

        payload1 = {
            "idempotencyKey": idempotency_key,
            "latitude": 30.0,
            "longitude": 70.0,
            "accuracyMeters": 10.0,
            "locationCapturedAt": now_iso,
        }
        resp1 = await client.post("/api/emergency/sos", json=payload1)
        assert resp1.status_code == 201

        # Same key, completely different coordinates
        payload2 = {
            "idempotencyKey": idempotency_key,
            "latitude": 45.0,
            "longitude": 90.0,
            "accuracyMeters": 10.0,
            "locationCapturedAt": now_iso,
        }
        resp2 = await client.post("/api/emergency/sos", json=payload2)
        assert resp2.status_code == 409
        assert "conflicting" in resp2.json()["detail"].lower()


@pytest.mark.asyncio
async def test_coordinate_boundary_validation():
    """Unit test: Validates latitude [-90, 90] and longitude [-180, 180] boundaries."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        now_iso = datetime.now(timezone.utc).isoformat()

        # Latitude > 90
        resp = await client.post("/api/emergency/sos", json={
            "idempotencyKey": str(uuid.uuid4()),
            "latitude": 91.5,
            "longitude": 0.0,
            "accuracyMeters": 5.0,
            "locationCapturedAt": now_iso,
        })
        assert resp.status_code == 422

        # Latitude < -90
        resp = await client.post("/api/emergency/sos", json={
            "idempotencyKey": str(uuid.uuid4()),
            "latitude": -95.0,
            "longitude": 0.0,
            "accuracyMeters": 5.0,
            "locationCapturedAt": now_iso,
        })
        assert resp.status_code == 422

        # Longitude > 180
        resp = await client.post("/api/emergency/sos", json={
            "idempotencyKey": str(uuid.uuid4()),
            "latitude": 0.0,
            "longitude": 185.0,
            "accuracyMeters": 5.0,
            "locationCapturedAt": now_iso,
        })
        assert resp.status_code == 422

        # Negative accuracy
        resp = await client.post("/api/emergency/sos", json={
            "idempotencyKey": str(uuid.uuid4()),
            "latitude": 0.0,
            "longitude": 0.0,
            "accuracyMeters": -5.0,
            "locationCapturedAt": now_iso,
        })
        assert resp.status_code == 422


@pytest.mark.asyncio
async def test_stale_and_future_timestamp_validation():
    """Test: Stale coordinates (>24h) and future timestamps (>5m) are rejected with 422."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Stale (> 24 hours ago)
        stale_time = (datetime.now(timezone.utc) - timedelta(hours=36)).isoformat()
        resp_stale = await client.post("/api/emergency/sos", json={
            "idempotencyKey": str(uuid.uuid4()),
            "latitude": 10.0,
            "longitude": 10.0,
            "accuracyMeters": 5.0,
            "locationCapturedAt": stale_time,
        })
        assert resp_stale.status_code == 422
        assert "stale" in resp_stale.json()["detail"].lower()

        # Future time (> 5 minutes ahead)
        future_time = (datetime.now(timezone.utc) + timedelta(minutes=20)).isoformat()
        resp_future = await client.post("/api/emergency/sos", json={
            "idempotencyKey": str(uuid.uuid4()),
            "latitude": 10.0,
            "longitude": 10.0,
            "accuracyMeters": 5.0,
            "locationCapturedAt": future_time,
        })
        assert resp_future.status_code == 422
        assert "future" in resp_future.json()["detail"].lower()


@pytest.mark.asyncio
async def test_incident_status_transitions():
    """Test: Incident lifecycle transitions (pending -> active -> acknowledged -> resolved) and audit event insertion."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Create incident
        now_iso = datetime.now(timezone.utc).isoformat()
        create_resp = await client.post("/api/emergency/sos", json={
            "idempotencyKey": str(uuid.uuid4()),
            "latitude": 34.0522,
            "longitude": -118.2437,
            "accuracyMeters": 15.0,
            "locationCapturedAt": now_iso,
        })
        assert create_resp.status_code == 201
        inc_id = create_resp.json()["incident"]["id"]

        # 2. Transition pending -> active
        t1 = await client.patch(
            f"/api/emergency/incidents/{inc_id}/status",
            json={"status": "active", "notes": "Dispatching nearest unit"}
        )
        assert t1.status_code == 200
        assert t1.json()["status"] == "active"

        # 3. Transition active -> acknowledged
        t2 = await client.patch(
            f"/api/emergency/incidents/{inc_id}/status",
            json={"status": "acknowledged", "notes": "Team Alpha acknowledges"}
        )
        assert t2.status_code == 200
        assert t2.json()["status"] == "acknowledged"

        # 4. Transition acknowledged -> resolved
        t3 = await client.patch(
            f"/api/emergency/incidents/{inc_id}/status",
            json={"status": "resolved", "notes": "Civilian rescued safely"}
        )
        assert t3.status_code == 200
        assert t3.json()["status"] == "resolved"
        assert t3.json()["resolved_at"] is not None

        # 5. Verify audit event log entries
        detail_resp = await client.get(f"/api/emergency/incidents/{inc_id}")
        assert detail_resp.status_code == 200
        events = detail_resp.json()["events"]
        assert len(events) >= 4  # creation + 3 transitions


@pytest.mark.asyncio
async def test_unauthorized_status_transition_rejection():
    """Test: Civilian role cannot jump to acknowledged or resolved status (HTTP 403)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        now_iso = datetime.now(timezone.utc).isoformat()
        create_resp = await client.post("/api/emergency/sos", json={
            "idempotencyKey": str(uuid.uuid4()),
            "latitude": 28.6139,
            "longitude": 77.2090,
            "accuracyMeters": 10.0,
            "locationCapturedAt": now_iso,
        })
        inc_id = create_resp.json()["incident"]["id"]

        # Civilian attempts to resolve
        resp = await client.patch(
            f"/api/emergency/incidents/{inc_id}/status",
            json={"status": "resolved", "notes": "Unauthorized self resolve"},
            headers={"X-User-Role": "civilian"}
        )
        assert resp.status_code == 403
        assert "insufficient permissions" in resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_user_location_preference():
    """Test: Location sharing preferences can be saved and retrieved."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        user_id = f"test-user-{uuid.uuid4().hex[:6]}"

        # Save preference
        resp = await client.post("/api/emergency/location-preference", json={
            "userId": user_id,
            "locationSharingEnabled": True
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["userId"] == user_id
        assert data["locationSharingEnabled"] is True

        # Fetch preference
        get_resp = await client.get(f"/api/emergency/location-preference?user_id={user_id}")
        assert get_resp.status_code == 200
        assert get_resp.json()["locationSharingEnabled"] is True
