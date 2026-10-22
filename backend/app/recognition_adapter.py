from typing import List, Dict, Any, Optional
from app.schemas import RecognitionStatusResponse, RecognitionCandidate


class RecognitionAdapter:
    """
    Integration boundary for future facial-recognition / victim identification service.
    No external recognition service exists yet. This adapter defines the typed event schema
    and provides placeholder mock candidates for UI operator verification flows.
    """

    def __init__(self):
        # Local mock candidates solely for operator UI interaction testing
        self._demo_candidates: List[RecognitionCandidate] = [
            RecognitionCandidate(
                event_id="rec-sim-001",
                timestamp="2026-10-21T06:15:22Z",
                camera_source="/oak/rgb/image_raw (Piper Front Mount)",
                review_status="pending",
                candidate_label="Unverified Candidate #14A",
                confidence_semantics="Visual Match (Similarity Index 0.84 - Unverified)",
                evidence_ref="frame_sample_01.jpg",
                notes="Candidate detected near north rubble corridor. Requires human operator verification.",
                is_simulated=True
            ),
            RecognitionCandidate(
                event_id="rec-sim-002",
                timestamp="2026-10-21T06:21:48Z",
                camera_source="/oak/rgb/image_raw (Piper Front Mount)",
                review_status="confirmed",
                candidate_label="Unverified Candidate #09C",
                confidence_semantics="Visual Match (Similarity Index 0.91 - Unverified)",
                evidence_ref="frame_sample_02.jpg",
                notes="Operator flagged as verified responder team personnel on scene.",
                is_simulated=True
            )
        ]

    def get_status(self) -> RecognitionStatusResponse:
        return RecognitionStatusResponse(
            status_badge="NOT CONNECTED",
            status_message=(
                "External facial recognition service is not deployed. "
                "Interface is operating in standby mode with strict human-in-the-loop review architecture."
            ),
            contract_requirements={
                "transport_protocol": "Webhook (HTTP POST) or WebSocket (wss://) event stream",
                "authentication": "Bearer token or mTLS mutual authentication",
                "payload_schema": {
                    "event_id": "UUID string",
                    "timestamp": "ISO 8601 UTC string",
                    "camera_id": "ROS topic / sensor ID",
                    "bounding_box": "[ymin, xmin, ymax, xmax] normalized (0.0 to 1.0)",
                    "candidate_id": "Pseudonymous tracking ID (do not send raw biometric templates)",
                    "confidence": "Normalized float 0.0 - 1.0 with calibration curve documentation",
                    "evidence_image_url": "Presigned HTTPS URL or multipart JPEG payload"
                },
                "data_privacy_guidelines": [
                    "Zero raw biometric vectors stored on dashboard backend.",
                    "All detections are unverified candidates until an authorized operator confirms.",
                    "Retention limit: 24h operational window with automated purge."
                ]
            },
            candidates=self._demo_candidates
        )

    def update_candidate_status(self, event_id: str, new_status: str) -> Optional[RecognitionCandidate]:
        """Local-only operator decision simulation"""
        for c in self._demo_candidates:
            if c.event_id == event_id:
                c.review_status = new_status  # type: ignore
                return c
        return None


recognition_adapter = RecognitionAdapter()
