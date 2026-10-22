from typing import Optional
from pydantic import BaseModel


class PersonEnrollRequest(BaseModel):
    full_name: str
    category: str = "Missing Civilian"  # "Missing Civilian", "Operator / Team Lead", "Emergency Responder", "VIP"
    badge_or_id: Optional[str] = None
    reported_last_seen: Optional[str] = None
    medical_alerts: Optional[str] = None
    photo_base64: Optional[str] = None
    capture_from_camera: bool = False
