export type AllowedCommand = "start_patrol" | "pause_patrol" | "return_to_base";

export interface RobotInfo {
  robot: string;
  api_status: string;
  upstream_connected: boolean;
  source: "live" | "demo";
  upstream_url: string;
}

export interface RobotStatus {
  state: string;
  message: string;
  upstream_available: boolean;
  is_stale: boolean;
  last_updated_at: string;
  source: "live" | "demo";
}

export interface CommandResponse {
  command: AllowedCommand;
  status: "published_to_ros" | "simulated" | "failed";
  detail: string;
  disclaimer: string;
  timestamp: string;
}

export interface PersonRecord {
  id: string;
  full_name: string;
  category: string;
  badge_or_id?: string;
  photo_filename?: string;
  reported_last_seen?: string;
  medical_alerts?: string;
  created_at: string;
}

export interface ObservationRecord {
  id: string;
  obs_code: string;
  timestamp: string;
  class_label: string;
  confidence: number;
  distance_m: number;
  pos_x: number;
  pos_y: number;
  pos_z: number;
  full_frame_path: string;
  crop_path: string;
  matched_person_id?: string | null;
  match_similarity?: number | null;
  review_status: "unreviewed" | "confirmed" | "rejected" | "uncertain";
  reviewer_notes?: string | null;
  created_at: string;
  person_name?: string | null;
  person_category?: string | null;
  reported_last_seen?: string | null;
  medical_alerts?: string | null;
  person_photo?: string | null;
  incident_id?: string | null;
  incident_code?: string | null;
  incident_priority?: string | null;
  incident_status?: string | null;
  title?: string;
  category_tag?: string;
  sector?: string;
}

export interface IncidentRecord {
  id: string;
  incident_code: string;
  observation_id: string;
  priority: string;
  assigned_team: string;
  status: string;
  summary: string;
  created_at: string;
  obs_code?: string;
  distance_m?: number;
  pos_x?: number;
  pos_y?: number;
  person_name?: string;
  person_category?: string;
}

export interface MapMetadata {
  frame_id: string;
  coordinate_system: string;
  resolution: number;
  width: number;
  height: number;
  origin_x: number;
  origin_y: number;
  status_badge: string;
  is_simulated: boolean;
}

export interface SimulatedRobotPose {
  x: number;
  y: number;
  yaw_deg: number;
  is_simulated: boolean;
  notice: string;
}

export interface MapData {
  status_badge: string;
  source: string;
  metadata: MapMetadata;
  grid: number[][];
  simulated_robot_pose: SimulatedRobotPose;
  contract_docs: {
    target_ros2_message: string;
    recommended_topic: string;
    target_pose_source: string;
    coordinate_frame: string;
    occupancy_semantics: Record<string, string>;
    status_note: string;
  };
}

export interface RecognitionCandidate {
  event_id: string;
  timestamp: string;
  camera_source: string;
  review_status: "pending" | "confirmed" | "rejected";
  candidate_label: string;
  confidence_semantics: string;
  evidence_ref: string;
  notes: string;
  is_simulated: boolean;
}

export interface RecognitionStatus {
  status_badge: string;
  status_message: string;
  contract_requirements: {
    transport_protocol: string;
    authentication: string;
    payload_schema: Record<string, string>;
    data_privacy_guidelines: string[];
  };
  candidates: RecognitionCandidate[];
}

export interface ActivityEvent {
  id: string;
  timestamp: string;
  category: "connection" | "command" | "camera" | "system" | "perception";
  level: "info" | "warning" | "error" | "success";
  message: string;
  is_simulated: boolean;
  obs_code?: string;
}

export type EmergencyIncidentStatus =
  | "pending"
  | "active"
  | "acknowledged"
  | "resolved"
  | "cancelled";

export type LocationReadinessState =
  | "prompt"
  | "locating"
  | "ready"
  | "denied"
  | "unavailable"
  | "timeout";

export interface EmergencyIncident {
  id: string;
  user_id?: string;
  idempotency_key: string;
  status: EmergencyIncidentStatus;
  latitude: number;
  longitude: number;
  location_accuracy_meters: number;
  location_captured_at: string;
  location_source: string;
  address?: string;
  description?: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
  events?: EmergencyIncidentEvent[];
}

export interface EmergencyIncidentEvent {
  id: string;
  incident_id: string;
  actor_user_id?: string;
  event_type: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface SOSRequestPayload {
  idempotencyKey: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  locationCapturedAt: string;
  locationSource?: string;
  description?: string;
  isTestMode?: boolean;
}

export interface SOSResponsePayload {
  success: boolean;
  incident: {
    id: string;
    status: EmergencyIncidentStatus;
    latitude: number;
    longitude: number;
    locationAccuracyMeters: number;
    createdAt: string;
    address?: string;
    description?: string;
  };
  message?: string;
}

export interface LocationPreference {
  userId: string;
  locationSharingEnabled: boolean;
  consentRecordedAt: string;
  updatedAt: string;
}

export interface ReverseGeocodeResult {
  address: string;
  display_name: string;
  city?: string;
  state?: string;
  country?: string;
  postcode?: string;
  source: string;
}

export interface SpeakerStatus {
  auto_broadcast_enabled: boolean;
  cooldown_remaining_sec: number;
  last_broadcast_text?: string | null;
  last_broadcast_time?: string | null;
  rover_speaker_url: string;
}

export interface BroadcastResult {
  success: boolean;
  message_text: string;
  language: string;
  rover_dispatched: boolean;
  rover_status: string;
  played_locally: boolean;
  timestamp: string;
}

export interface AIGeneratedReassurance {
  generated_text: string;
  language: string;
  context_summary: string;
}

