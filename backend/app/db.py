import sqlite3
import os
from pathlib import Path

# Ensure database directory exists
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
EVIDENCE_DIR = DATA_DIR / "evidence"
DB_PATH = DATA_DIR / "piper_rescue.db"

os.makedirs(EVIDENCE_DIR, exist_ok=True)


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
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
        observation_id TEXT UNIQUE NOT NULL,
        priority TEXT NOT NULL, -- 'P1 - Immediate', 'P2 - Urgent', 'P3 - Routine'
        assigned_team TEXT NOT NULL, -- 'Team Alpha (Search & Rescue)', 'Team Bravo', 'Medical Evac'
        status TEXT NOT NULL DEFAULT 'open', -- 'open', 'in_progress', 'resolved'
        summary TEXT NOT NULL,
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        FOREIGN KEY (observation_id) REFERENCES observations(id)
    );
    """)

    # 4. Audit Log Table (Append-Only)
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

    conn.commit()
    conn.close()


init_database()
