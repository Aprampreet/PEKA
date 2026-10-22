import base64
import uuid
import cv2
import numpy as np
from fastapi import APIRouter, HTTPException, Path as PathParam
from app.core.database import EVIDENCE_DIR
from app.features.observations.service import observation_manager
from app.features.camera.perception import perception_engine
from app.features.registry.schemas import PersonEnrollRequest

router = APIRouter(prefix="/api/registry/persons", tags=["Persons Registry"])


@router.get("")
async def list_registry_persons():
    """Lists all enrolled persons in the facial recognition database."""
    return observation_manager.list_persons()


@router.post("")
async def enroll_person(req: PersonEnrollRequest):
    """
    Enrolls a person into the facial recognition database.
    Can either use an uploaded photo or grab the current live camera frame snapshot.
    """
    photo_fn = None
    filename_id = f"person_{uuid.uuid4().hex[:8]}.jpg"
    photo_path = EVIDENCE_DIR / filename_id

    if req.capture_from_camera:
        raw_frame = perception_engine.get_latest_raw_frame()
        if raw_frame:
            np_arr = np.frombuffer(raw_frame, np.uint8)
            frame_bgr = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            if frame_bgr is not None:
                # Try to crop detected face if one exists
                gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
                faces = perception_engine.face_cascade.detectMultiScale(gray, 1.15, 3, minSize=(30, 30))
                if len(faces) == 0 and hasattr(perception_engine, "face_cascade_alt2"):
                    faces = perception_engine.face_cascade_alt2.detectMultiScale(gray, 1.15, 3, minSize=(30, 30))
                if len(faces) == 0 and hasattr(perception_engine, "profile_cascade"):
                    faces = perception_engine.profile_cascade.detectMultiScale(gray, 1.15, 3, minSize=(30, 30))
                if len(faces) > 0:
                    fx, fy, fw, fh = faces[0]
                    pad_x = int(fw * 0.15)
                    pad_y = int(fh * 0.15)
                    x1 = max(0, fx - pad_x)
                    y1 = max(0, fy - pad_y)
                    x2 = min(frame_bgr.shape[1], fx + fw + pad_x)
                    y2 = min(frame_bgr.shape[0], fy + fh + pad_y)
                    crop = frame_bgr[y1:y2, x1:x2]
                    cv2.imwrite(str(photo_path), crop)
                else:
                    # Save entire frame if no face isolated
                    cv2.imwrite(str(photo_path), frame_bgr)
                photo_fn = filename_id

    if not photo_fn and req.photo_base64:
        try:
            b64_data = req.photo_base64
            if "," in b64_data:
                b64_data = b64_data.split(",", 1)[1]
            img_bytes = base64.b64decode(b64_data)
            with open(photo_path, "wb") as f:
                f.write(img_bytes)
            photo_fn = filename_id
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid photo image data: {str(e)[:80]}")

    new_person = observation_manager.add_person(
        full_name=req.full_name,
        category=req.category,
        badge_or_id=req.badge_or_id,
        photo_filename=photo_fn,
        reported_last_seen=req.reported_last_seen,
        medical_alerts=req.medical_alerts,
    )

    # Immediately reload perception cache so live camera recognizes the face
    perception_engine.reload_registry()

    return new_person


@router.delete("/{person_id}")
async def delete_registry_person(person_id: str = PathParam(..., description="Person ID")):
    """Removes a person from the recognition registry."""
    success = observation_manager.delete_person(person_id)
    if not success:
        raise HTTPException(status_code=404, detail="Person not found")
    perception_engine.reload_registry()
    return {"status": "deleted", "id": person_id}
