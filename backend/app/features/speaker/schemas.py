from pydantic import BaseModel, Field
from typing import Optional


class BroadcastRequest(BaseModel):
    text: str = Field(..., description="Message text to announce through speaker")
    language: str = Field("en", description="Language code: 'en' for English, 'hi' for Hindi")
    play_local: bool = Field(False, description="Whether to also play on laptop speakers for live testing")
    send_rover: bool = Field(True, description="Whether to forward to physical rover speaker")


class BroadcastResponse(BaseModel):
    success: bool
    message_text: str
    language: str
    rover_dispatched: bool
    rover_status: str
    played_locally: bool
    timestamp: str


class AIGenerateRequest(BaseModel):
    person_name: Optional[str] = Field(None, description="Name of matched registered survivor, or None")
    distance_m: Optional[float] = Field(None, description="Estimated distance from rover in meters")
    sector: Optional[str] = Field("Sector 3", description="Current facility location or sector")
    language: str = Field("en", description="Target language ('en' | 'hi')")


class AIGenerateResponse(BaseModel):
    generated_text: str
    language: str
    context_summary: str


class SpeakerStatusResponse(BaseModel):
    auto_broadcast_enabled: bool
    cooldown_remaining_sec: float
    last_broadcast_text: Optional[str] = None
    last_broadcast_time: Optional[str] = None
    rover_speaker_url: str
