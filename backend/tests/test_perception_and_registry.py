import pytest
from httpx import AsyncClient, ASGITransport
import numpy as np
import cv2

from app.main import app
from app.perception import perception_engine
from app.observations import observation_manager


@pytest.mark.asyncio
async def test_perception_processing():
    # Create synthetic frame
    img = np.zeros((480, 640, 3), dtype=np.uint8)
    _, buf = cv2.imencode(".jpg", img)
    raw_bytes = buf.tobytes()

    # Process frame
    processed = perception_engine.process_frame(raw_bytes)
    assert processed is not None
    assert len(processed) > 0


@pytest.mark.asyncio
async def test_person_registry_crud():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. List persons
        res = await client.get("/api/registry/persons")
        assert res.status_code == 200
        initial_persons = res.json()
        assert len(initial_persons) >= 3  # Pre-seeded SAR members

        # 2. Enroll new person
        enroll_payload = {
            "full_name": "Test Operator Singh",
            "category": "Operator / Team Lead",
            "badge_or_id": "OP-99",
            "reported_last_seen": "Base Camp",
            "medical_alerts": "None"
        }
        res_post = await client.post("/api/registry/persons", json=enroll_payload)
        assert res_post.status_code == 200
        new_p = res_post.json()
        assert new_p["full_name"] == "Test Operator Singh"
        person_id = new_p["id"]

        # 3. Clean up test person
        res_del = await client.delete(f"/api/registry/persons/{person_id}")
        assert res_del.status_code == 200


@pytest.mark.asyncio
async def test_live_observation_recording():
    # Create test dummy frames
    img = np.zeros((240, 320, 3), dtype=np.uint8)
    _, b1 = cv2.imencode(".jpg", img)
    _, b2 = cv2.imencode(".jpg", img[50:150, 50:150])

    obs = observation_manager.record_live_observation(
        full_frame_bytes=b1.tobytes(),
        crop_bytes=b2.tobytes(),
        matched_person_id="reg-p1-sarah",
        match_similarity=0.91,
        confidence=0.93,
        distance_m=1.8,
        pos_x=0.0,
        pos_y=1.8,
    )

    assert obs["id"] is not None
    assert obs["obs_code"].startswith("OBS-")
    assert obs["review_status"] == "unreviewed"
    assert obs["distance_m"] == 1.8
