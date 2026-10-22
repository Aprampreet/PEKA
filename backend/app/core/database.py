import sqlite3
import os
from pathlib import Path

# Resolve to backend/data regardless of nesting depth
DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
EVIDENCE_DIR = DATA_DIR / "evidence"
DB_PATH = DATA_DIR / "piper_rescue.db"

os.makedirs(EVIDENCE_DIR, exist_ok=True)


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout=30000;")
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_database():
    """Initializes the database schema matching Section 8 of the specification."""
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. Known Persons / Missing Victims Registry for Matching
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS persons_registry (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        category TEXT NOT NULL, -- 'Missing Civilian', 'Emergency Responder', 'VIP'
        badge_or_id TEXT,
        photo_filename TEXT,
        reported_last_seen TEXT,
        medical_alerts TEXT,
        created_at TEXT NOT NULL
    );
    """)

    # 2. Observations Table (AI Output + Evidence)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS observations (
        id TEXT PRIMARY KEY,
        obs_code TEXT UNIQUE NOT NULL,
        timestamp TEXT NOT NULL,
        class_label TEXT NOT NULL DEFAULT 'person',
        confidence REAL NOT NULL,
        distance_m REAL NOT NULL,
        pos_x REAL NOT NULL,
        pos_y REAL NOT NULL,
        pos_z REAL DEFAULT 0.0,
        full_frame_path TEXT NOT NULL,
        crop_path TEXT NOT NULL,
        matched_person_id TEXT,
        match_similarity REAL,
        review_status TEXT NOT NULL DEFAULT 'unreviewed', -- 'unreviewed', 'confirmed', 'rejected', 'uncertain'
        reviewer_notes TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (matched_person_id) REFERENCES persons_registry(id)
    );
    """)

    # 3. Incident Reports Table (Human Verified from Confirmed Observations)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS incident_reports (
        id TEXT PRIMARY KEY,
        incident_code TEXT UNIQUE NOT NULL,
        created_at TEXT NOT NULL,
        priority TEXT NOT NULL, -- 'P1 - Immediate', 'P2 - High Priority', 'P3 - Moderate'
        observation_id TEXT NOT NULL,
        assigned_team TEXT NOT NULL,
        summary TEXT,
        status TEXT NOT NULL DEFAULT 'open', -- 'open', 'investigating', 'resolved'
        FOREIGN KEY (observation_id) REFERENCES observations(id)
    );
    """)

    # 4. Audit Log (Human Actions & System Events)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        actor TEXT NOT NULL,
        action TEXT NOT NULL,
        target_id TEXT,
        details TEXT
    );
    """)

    # 5. User Location Preferences Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_location_preferences (
        user_id TEXT PRIMARY KEY,
        location_sharing_enabled INTEGER NOT NULL DEFAULT 1,
        consent_recorded_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    """)

    # 6. Emergency Incidents Table (SOS Events with Geolocation)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS emergency_incidents (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        idempotency_key TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'active', 'acknowledged', 'resolved', 'cancelled')) DEFAULT 'pending',
        latitude REAL NOT NULL CHECK(latitude >= -90.0 AND latitude <= 90.0),
        longitude REAL NOT NULL CHECK(longitude >= -180.0 AND longitude <= 180.0),
        location_accuracy_meters REAL NOT NULL CHECK(location_accuracy_meters >= 0.0),
        location_captured_at TEXT NOT NULL,
        location_source TEXT NOT NULL,
        address TEXT,
        description TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        resolved_at TEXT
    );
    """)

    # 7. Emergency Incident Events Table (Auditable Status Transitions & Actions)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS emergency_incident_events (
        id TEXT PRIMARY KEY,
        incident_id TEXT NOT NULL,
        actor_user_id TEXT,
        event_type TEXT NOT NULL,
        metadata TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (incident_id) REFERENCES emergency_incidents(id) ON DELETE CASCADE
    );
    """)

    # Indexes for performant lookups and geospatial queries
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_emergency_incidents_user_id ON emergency_incidents(user_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_emergency_incidents_status ON emergency_incidents(status);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_emergency_incidents_created_at ON emergency_incidents(created_at);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_emergency_incidents_lat_lon ON emergency_incidents(latitude, longitude);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_emergency_incidents_idempotency ON emergency_incidents(idempotency_key);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_emergency_incident_events_incident_id ON emergency_incident_events(incident_id);")

    conn.commit()
    conn.close()
