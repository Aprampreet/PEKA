from typing import Literal, Dict, Any
from pydantic import BaseModel


class RecognitionCandidate(BaseModel):
    event_id: str
    timestamp: str
    camera_source: str
    review_status: Literal["pending", "confirmed", "rejected"]
    candidate_label: str
    confidence_semantics: str
    evidence_ref: str
    notes: str
    is_simulated: bool = True


class RecognitionStatusResponse(BaseModel):
    status_badge: str = "NOT CONNECTED"
    status_message: str = (
        "External facial-recognition service has not been deployed. "
        "Displaying placeholder integration boundary and mock candidates for UI verification."
    )
    contract_requirements: Dict[str, Any]
    candidates: list[RecognitionCandidate]
