import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_root_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["service"] == "PIPER Rescue Intelligence Dashboard Backend"
        assert data["status"] == "operational"


@pytest.mark.asyncio
async def test_health_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["dashboard_backend"] == "healthy"
        assert "robot_upstream_connected" in data
        assert "operational_mode" in data


@pytest.mark.asyncio
async def test_robot_status_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/robot/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "state" in data
        assert "message" in data
        assert "upstream_available" in data
        assert "source" in data


@pytest.mark.asyncio
async def test_valid_robot_commands():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        for cmd in ["start_patrol", "pause_patrol", "return_to_base"]:
            resp = await client.post("/api/robot/command", json={"command": cmd})
            assert resp.status_code == 200
            data = resp.json()
            assert data["command"] == cmd
            assert data["status"] in ("published_to_ros", "simulated")
            assert "disclaimer" in data


@pytest.mark.asyncio
async def test_disallowed_robot_command():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/robot/command", json={"command": "self_destruct"})
        assert resp.status_code == 422  # Pydantic validation failure


@pytest.mark.asyncio
async def test_map_data_contract():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/map/data")
        assert resp.status_code == 200
        data = resp.json()
        assert "DEMO DATA" in data["status_badge"]
        assert len(data["grid"]) == 50
        assert len(data["grid"][0]) == 50
        assert data["simulated_robot_pose"]["is_simulated"] is True
        assert "contract_docs" in data


@pytest.mark.asyncio
async def test_recognition_events_contract():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/recognition/events")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status_badge"] == "NOT CONNECTED"
        assert len(data["candidates"]) >= 1
        assert "contract_requirements" in data


@pytest.mark.asyncio
async def test_activity_feed():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/events/feed")
        assert resp.status_code == 200
        events = resp.json()
        assert isinstance(events, list)
        assert len(events) > 0
        assert "message" in events[0]


@pytest.mark.asyncio
async def test_observation_pipeline_and_incident():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Trigger observation
        resp = await client.post("/api/observations/trigger")
        assert resp.status_code == 200
        obs = resp.json()
        assert "obs_code" in obs
        obs_id = obs["id"]
        assert obs["review_status"] == "unreviewed"

        # 2. List observations
        list_resp = await client.get("/api/observations")
        assert list_resp.status_code == 200
        all_obs = list_resp.json()
        assert any(o["id"] == obs_id for o in all_obs)

        # 3. Review observation (confirm)
        rev_resp = await client.post(f"/api/observations/{obs_id}/review?decision=confirmed&notes=TestConfirm")
        assert rev_resp.status_code == 200
        assert rev_resp.json()["review_status"] == "confirmed"

        # 4. Create incident
        inc_resp = await client.post("/api/incidents", json={
            "observation_id": obs_id,
            "priority": "P1 - Immediate",
            "assigned_team": "Team Alpha",
            "summary": "Automated test survivor incident"
        })
        assert inc_resp.status_code == 200
        inc_data = inc_resp.json()
        assert "incident_code" in inc_data
        inc_id = inc_data["id"]

        # 5. Get 1-page printable report
        rep_resp = await client.get(f"/api/incidents/{inc_id}/report")
        assert rep_resp.status_code == 200
        assert "INCIDENT DOSSIER" in rep_resp.text
