import {
  RobotInfo,
  RobotStatus,
  AllowedCommand,
  CommandResponse,
  MapData,
  RecognitionStatus,
  ActivityEvent,
  ObservationRecord,
  IncidentRecord,
  PersonRecord,
  EmergencyIncident,
  SOSRequestPayload,
  SOSResponsePayload,
  LocationPreference,
  ReverseGeocodeResult,
} from "./types";

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export const API_BASE = BACKEND_URL;

class PiperApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  getStreamUrl(): string {
    return `${this.baseUrl}/api/camera/stream`;
  }

  getWsStreamUrl(): string {
    const wsBase = this.baseUrl.replace(/^http/, "ws");
    return `${wsBase}/api/camera/ws`;
  }

  getLidarWsUrl(): string {
    const wsBase = this.baseUrl.replace(/^http/, "ws");
    return `${wsBase}/api/lidar/ws`;
  }

  async getLidarStatus(): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/api/lidar/status`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch {
      return null;
    }
  }

  async getRobotInfo(): Promise<RobotInfo> {
    try {
      const res = await fetch(`${this.baseUrl}/api/robot/info`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch {
      return {
        robot: "Piper (Offline)",
        api_status: "offline",
        upstream_connected: false,
        source: "demo",
        upstream_url: "unreachable",
      };
    }
  }

  async getRobotStatus(): Promise<RobotStatus> {
    try {
      const res = await fetch(`${this.baseUrl}/api/robot/status`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch {
      return {
        state: "backend_unreachable",
        message: "Cannot communicate with dashboard backend.",
        upstream_available: false,
        is_stale: true,
        last_updated_at: new Date().toISOString(),
        source: "demo",
      };
    }
  }

  async sendCommand(command: AllowedCommand): Promise<CommandResponse> {
    try {
      const res = await fetch(`${this.baseUrl}/api/robot/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }
      return await res.json();
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      return {
        command,
        status: "failed",
        detail: `Failed to dispatch command: ${errMsg}`,
        disclaimer:
          "Command could not be transmitted to the ROS 2 bridge. Software controls do NOT replace physical E-Stop.",
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getMapData(): Promise<MapData | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/map/data`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch {
      return null;
    }
  }

  async getRecognitionEvents(): Promise<RecognitionStatus | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/recognition/events`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch {
      return null;
    }
  }

  async reviewCandidate(
    eventId: string,
    decision: "confirmed" | "rejected" | "pending"
  ): Promise<boolean> {
    try {
      const res = await fetch(
        `${this.baseUrl}/api/recognition/candidate/${eventId}/review?decision=${decision}`,
        { method: "POST" }
      );
      return res.ok;
    } catch {
      return false;
    }
  }

  async getObservations(status?: string): Promise<ObservationRecord[]> {
    try {
      const url = status
        ? `${this.baseUrl}/api/observations?status=${status}`
        : `${this.baseUrl}/api/observations`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch {
      return [];
    }
  }

  async triggerObservation(): Promise<ObservationRecord | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/observations/trigger`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch {
      return null;
    }
  }

  async reviewObservation(
    obsId: string,
    decision: "confirmed" | "rejected" | "uncertain",
    notes: string = ""
  ): Promise<ObservationRecord | null> {
    try {
      const res = await fetch(
        `${this.baseUrl}/api/observations/${obsId}/review?decision=${decision}&notes=${encodeURIComponent(
          notes
        )}`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch {
      return null;
    }
  }

  async clearUnreviewedObservations(): Promise<{ status: string; count: number }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/observations/unreviewed`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch {
      return { status: "error", count: 0 };
    }
  }

  async createIncident(
    observationId: string,
    priority: string,
    assignedTeam: string,
    summary: string
  ): Promise<IncidentRecord | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/incidents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          observation_id: observationId,
          priority,
          assigned_team: assignedTeam,
          summary,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch {
      return null;
    }
  }

  async getIncidents(): Promise<IncidentRecord[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/incidents`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch {
      return [];
    }
  }

  getIncidentReportUrl(incidentId: string): string {
    return `${this.baseUrl}/api/incidents/${incidentId}/report`;
  }

  getEvidenceUrl(path: string): string {
    if (!path) return "";
    if (path.startsWith("http")) return path;
    const cleanPath = path.replace(/^\/evidence\//, "").replace(/^evidence\//, "");
    return `${this.baseUrl}/evidence/${cleanPath}`;
  }

  async getActivityEvents(limit: number = 40): Promise<ActivityEvent[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/events/feed?limit=${limit}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch {
      return [];
    }
  }

  async getRegistryPersons(): Promise<PersonRecord[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/registry/persons`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch {
      return [];
    }
  }

  async enrollPerson(data: {
    full_name: string;
    category?: string;
    badge_or_id?: string;
    reported_last_seen?: string;
    medical_alerts?: string;
    photo_base64?: string;
    capture_from_camera?: boolean;
  }): Promise<PersonRecord | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/registry/persons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText);
      }
      return await res.json();
    } catch (e) {
      console.error("Person enrollment error:", e);
      return null;
    }
  }

  async deleteRegistryPerson(personId: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/registry/persons/${personId}`, {
        method: "DELETE",
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async createSOSIncident(payload: SOSRequestPayload): Promise<SOSResponsePayload> {
    const res = await fetch(`${this.baseUrl}/api/emergency/sos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      let errDetail = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson.detail) errDetail = errJson.detail;
      } catch {}
      throw new Error(errDetail);
    }
    return await res.json();
  }

  async getEmergencyIncidents(status?: string, userId?: string): Promise<EmergencyIncident[]> {
    try {
      const params = new URLSearchParams();
      if (status) params.append("status", status);
      if (userId) params.append("user_id", userId);
      const url = `${this.baseUrl}/api/emergency/incidents?${params.toString()}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch {
      return [];
    }
  }

  async getEmergencyIncident(incidentId: string): Promise<EmergencyIncident | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/emergency/incidents/${incidentId}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch {
      return null;
    }
  }

  async updateEmergencyStatus(
    incidentId: string,
    status: string,
    notes?: string,
    role: string = "operator"
  ): Promise<EmergencyIncident | null> {
    const res = await fetch(`${this.baseUrl}/api/emergency/incidents/${incidentId}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-User-Role": role,
      },
      body: JSON.stringify({ status, notes }),
    });
    if (!res.ok) {
      let errDetail = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson.detail) errDetail = errJson.detail;
      } catch {}
      throw new Error(errDetail);
    }
    return await res.json();
  }

  async getLocationPreference(userId: string = "operator-default"): Promise<LocationPreference | null> {
    try {
      const res = await fetch(
        `${this.baseUrl}/api/emergency/location-preference?user_id=${encodeURIComponent(userId)}`,
        { cache: "no-store" }
      );
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async saveLocationPreference(
    enabled: boolean,
    userId: string = "operator-default"
  ): Promise<LocationPreference | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/emergency/location-preference`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, locationSharingEnabled: enabled }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async reverseGeocode(lat: number, lon: number): Promise<ReverseGeocodeResult | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/emergency/reverse-geocode?lat=${lat}&lon=${lon}`, {
        cache: "no-store",
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }
}

export const api = new PiperApiClient(BACKEND_URL);
