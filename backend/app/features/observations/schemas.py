from pydantic import BaseModel


class IncidentCreateRequest(BaseModel):
    observation_id: str
    priority: str = "P1 - Immediate"
    assigned_team: str = "Team Alpha (Search & Rescue)"
    summary: str = ""
