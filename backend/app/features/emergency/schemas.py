from datetime import datetime
from typing import Optional, List, Any, Dict
from pydantic import BaseModel, Field, ConfigDict, field_validator
import math
import uuid


ALLOWED_STATUSES = {"pending", "active", "acknowledged", "resolved", "cancelled"}


class SOSCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    idempotency_key: str = Field(..., alias="idempotencyKey", description="Unique client-side UUID for idempotency")
    latitude: float = Field(..., description="WGS84 latitude between -90 and 90 degrees")
    longitude: float = Field(..., description="WGS84 longitude between -180 and 180 degrees")
    accuracy_meters: float = Field(..., alias="accuracyMeters", description="Geolocation estimated radius of accuracy in meters")
    location_captured_at: str = Field(..., alias="locationCapturedAt", description="ISO-8601 timestamp of coordinate acquisition")
    location_source: str = Field(default="browser_geolocation", alias="locationSource", description="Source of geospatial coordinates")
    description: Optional[str] = Field(default=None, description="Optional caller distress details")
    is_test_mode: Optional[bool] = Field(default=False, alias="isTestMode", description="Test mode indicator to prevent real responder alert")
    user_id: Optional[str] = Field(default=None, alias="userId", description="Optional client user ID")

    @field_validator("idempotency_key")
    @classmethod
    def validate_idempotency_key(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Idempotency key cannot be empty")
        # Validate format is UUID
        try:
            uuid.UUID(v)
        except ValueError:
            raise ValueError("Idempotency key must be a valid UUID")
        return v

    @field_validator("latitude")
    @classmethod
    def validate_latitude(cls, v: float) -> float:
        if not math.isfinite(v):
            raise ValueError("Latitude must be a finite number")
        if v < -90.0 or v > 90.0:
            raise ValueError(f"Latitude must be between -90.0 and 90.0 degrees (got {v})")
        return round(v, 7)

    @field_validator("longitude")
    @classmethod
    def validate_longitude(cls, v: float) -> float:
        if not math.isfinite(v):
            raise ValueError("Longitude must be a finite number")
        if v < -180.0 or v > 180.0:
            raise ValueError(f"Longitude must be between -180.0 and 180.0 degrees (got {v})")
        return round(v, 7)

    @field_validator("accuracy_meters")
    @classmethod
    def validate_accuracy(cls, v: float) -> float:
        if not math.isfinite(v) or v < 0:
            raise ValueError("Location accuracy meters must be a finite non-negative number")
        return round(v, 2)


class SOSIncidentSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    status: str
    latitude: float
    longitude: float
    location_accuracy_meters: float = Field(..., alias="locationAccuracyMeters")
    created_at: str = Field(..., alias="createdAt")
    updated_at: Optional[str] = Field(default=None, alias="updatedAt")
    location_source: Optional[str] = Field(default="browser_geolocation", alias="locationSource")
    address: Optional[str] = None
    description: Optional[str] = None
    user_id: Optional[str] = Field(default=None, alias="userId")
    idempotency_key: Optional[str] = Field(default=None, alias="idempotencyKey")
    is_test: Optional[bool] = Field(default=False, alias="isTest")


class SOSCreateResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    success: bool
    incident: SOSIncidentSummary
    message: Optional[str] = "Emergency incident recorded successfully"


class IncidentStatusUpdateRequest(BaseModel):
    status: str = Field(..., description="Target status: pending, active, acknowledged, resolved, or cancelled")
    notes: Optional[str] = Field(default=None, description="Operator or user status update reason")
    actor_id: Optional[str] = Field(default="operator-1", description="Actor identifier")

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        s = v.strip().lower()
        if s not in ALLOWED_STATUSES:
            raise ValueError(f"Status must be one of: {', '.join(sorted(ALLOWED_STATUSES))}")
        return s


class LocationPreferenceRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    user_id: Optional[str] = Field(default="operator-default", alias="userId")
    location_sharing_enabled: bool = Field(default=True, alias="locationSharingEnabled")


class LocationPreferenceResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    user_id: str = Field(..., alias="userId")
    location_sharing_enabled: bool = Field(..., alias="locationSharingEnabled")
    consent_recorded_at: str = Field(..., alias="consentRecordedAt")
    updated_at: str = Field(..., alias="updatedAt")


class ReverseGeocodeResponse(BaseModel):
    address: str
    display_name: str
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    postcode: Optional[str] = None
    source: str = "openstreetmap_nominatim"
