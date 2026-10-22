import os
import uuid
import hashlib
import time
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from PIL import Image, ImageDraw

from app.core.database import get_db_connection, EVIDENCE_DIR
from app.event_log import event_logger
from app.client import robot_client


class ObservationManager:
    def __init__(self):
        self._ensure_seed_registry()

    def _get_next_obs_code(self, cursor) -> str:
        cursor.execute("SELECT obs_code FROM observations WHERE obs_code LIKE 'OBS-01-%'")
        rows = cursor.fetchall()
        max_seq = 0
        for r in rows:
            code = r["obs_code"]
            try:
                num = int(code.split("-")[-1])
                if num > max_seq:
                    max_seq = num
            except Exception:
                pass
        seq = max_seq + 1
        obs_code = f"OBS-01-{seq:04d}"
        while True:
            cursor.execute("SELECT 1 FROM observations WHERE obs_code = ?", (obs_code,))
            if cursor.fetchone() is None:
                break
            seq += 1
            obs_code = f"OBS-01-{seq:04d}"
        return obs_code

    def _get_next_incident_code(self, cursor, today_code: str) -> str:
        cursor.execute("SELECT incident_code FROM incident_reports WHERE incident_code LIKE ?", (f"INC-{today_code}-%",))
        rows = cursor.fetchall()
        max_seq = 0
        for r in rows:
            code = r["incident_code"]
            try:
                num = int(code.split("-")[-1])
                if num > max_seq:
                    max_seq = num
            except Exception:
                pass
        inc_seq = max_seq + 1
        inc_code = f"INC-{today_code}-{inc_seq:03d}"
        while True:
            cursor.execute("SELECT 1 FROM incident_reports WHERE incident_code = ?", (inc_code,))
            if cursor.fetchone() is None:
                break
            inc_seq += 1
            inc_code = f"INC-{today_code}-{inc_seq:03d}"
        return inc_code

    def _ensure_seed_registry(self):
        """Seeds known reported missing persons and responders to match against."""
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) as count FROM persons_registry")
            count = cursor.fetchone()["count"]

            if count == 0:
                now_iso = datetime.now(timezone.utc).isoformat()
                seeds = [
                    (
                        "reg-p1-sarah",
                        "Sarah Chen",
                        "Reported Missing Civilian",
                        "ID: CIV-8831",
                        "sarah_chen.jpg",
                        "Sector 3 Research Wing (Collapse Area)",
                        "Asthma / Inhaler required. Wore blue jacket.",
                        now_iso
                    ),
                    (
                        "reg-p2-marcus",
                        "Marcus Brody",
                        "Emergency Responder",
                        "Badge: SAR-04",
                        "marcus_brody.jpg",
                        "North Rubble Clearing Corridor",
                        "Team Alpha lead responder. Certified Paramedic.",
                        now_iso
                    ),
                    (
                        "reg-p3-elena",
                        "Elena Rostova",
                        "Reported Missing Civilian",
                        "ID: CIV-9024",
                        "elena_rostova.jpg",
                        "East Machinery Room",
                        "No known critical conditions.",
                        now_iso
                    ),
                ]

                for s in seeds:
                    cursor.execute("""
                    INSERT INTO persons_registry (
                        id, full_name, category, badge_or_id, photo_filename, reported_last_seen, medical_alerts, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, s)
                    # Generate sample badge avatar
                    self._generate_avatar(s[4], s[1], s[2])

                conn.commit()

            # Seed baseline disaster observation categories if table is empty or sparse
            cursor.execute("SELECT COUNT(*) as count FROM observations")
            obs_count = cursor.fetchone()["count"]
            if obs_count < 4:
                from datetime import timedelta
                now = datetime.now(timezone.utc)
                demo_seeds = [
                    (
                        "obs-seed-01",
                        "OBS-01-0001",
                        (now - timedelta(minutes=2)).isoformat(),
                        "person",
                        0.87,
                        1.8,
                        0.4,
                        1.5,
                        0.0,
                        "obs_person.jpg",
                        "obs_person.jpg",
                        "reg-p1-sarah",
                        0.87,
                        "unreviewed",
                        (now - timedelta(minutes=2)).isoformat()
                    ),
                    (
                        "obs-seed-02",
                        "OBS-01-0002",
                        (now - timedelta(minutes=8)).isoformat(),
                        "structural_risk",
                        0.76,
                        3.2,
                        -0.8,
                        2.4,
                        0.0,
                        "obs_structure.jpg",
                        "obs_structure.jpg",
                        None,
                        None,
                        "unreviewed",
                        (now - timedelta(minutes=8)).isoformat()
                    ),
                    (
                        "obs-seed-03",
                        "OBS-01-0003",
                        (now - timedelta(minutes=12)).isoformat(),
                        "point_of_interest",
                        0.62,
                        2.1,
                        0.6,
                        0.9,
                        0.0,
                        "obs_poi.jpg",
                        "obs_poi.jpg",
                        None,
                        None,
                        "unreviewed",
                        (now - timedelta(minutes=12)).isoformat()
                    ),
                    (
                        "obs-seed-04",
                        "OBS-01-0004",
                        (now - timedelta(minutes=15)).isoformat(),
                        "equipment",
                        0.68,
                        1.4,
                        -0.2,
                        1.2,
                        0.0,
                        "obs_equipment.jpg",
                        "obs_equipment.jpg",
                        None,
                        None,
                        "unreviewed",
                        (now - timedelta(minutes=15)).isoformat()
                    ),
                ]
                for ob in demo_seeds:
                    cursor.execute("""
                    INSERT OR IGNORE INTO observations (
                        id, obs_code, timestamp, class_label, confidence, distance_m,
                        pos_x, pos_y, pos_z, full_frame_path, crop_path,
                        matched_person_id, match_similarity, review_status, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, ob)
                conn.commit()
        finally:
            conn.close()

    def _generate_avatar(self, filename: str, name: str, category: str):
        filepath = EVIDENCE_DIR / filename
        if filepath.exists():
            return

        w, h = 240, 240
        color = (30, 41, 59) if "Civilian" in category else (15, 76, 92)
        img = Image.new("RGB", (w, h), color=color)
        draw = ImageDraw.Draw(img)

        # Draw simple stylized silhouette
        cx, cy = w // 2, h // 2
        # Head
        draw.ellipse([cx - 35, cy - 50, cx + 35, cy + 20], fill=(148, 163, 184))
        # Torso
        draw.polygon([(cx - 60, cy + 90), (cx + 60, cy + 90), (cx + 40, cy + 25), (cx - 40, cy + 25)], fill=(100, 116, 139))

        # Text banner
        draw.rectangle([(0, h - 35), (w, h)], fill=(15, 23, 42))
        draw.text((10, h - 25), name[:22], fill=(241, 245, 249))

        img.save(str(filepath), "JPEG", quality=85)

    def record_live_observation(
        self,
        full_frame_bytes: bytes,
        crop_bytes: bytes,
        matched_person_id: Optional[str],
        match_similarity: Optional[float],
        confidence: float,
        distance_m: float,
        pos_x: float = 0.0,
        pos_y: float = 1.5,
    ) -> Dict[str, Any]:
        """
        Records a real-time observation triggered by camera perception.
        Saves the exact camera frame and extracted face crop to disk and logs to SQLite.
        """
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            obs_code = self._get_next_obs_code(cursor)
            obs_id = str(uuid.uuid4())
            now_iso = datetime.now(timezone.utc).isoformat()

            full_frame_fn = f"ev_{obs_id}_full.jpg"
            crop_fn = f"ev_{obs_id}_crop.jpg"

            full_frame_path = EVIDENCE_DIR / full_frame_fn
            crop_path = EVIDENCE_DIR / crop_fn

            # Write actual image bytes to disk
            with open(full_frame_path, "wb") as f:
                f.write(full_frame_bytes)

            with open(crop_path, "wb") as f:
                f.write(crop_bytes)

            cursor.execute("""
            INSERT INTO observations (
                id, obs_code, timestamp, class_label, confidence, distance_m,
                pos_x, pos_y, pos_z, full_frame_path, crop_path,
                matched_person_id, match_similarity, review_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                obs_id,
                obs_code,
                now_iso,
                "person",
                confidence,
                distance_m,
                pos_x,
                pos_y,
                0.0,
                full_frame_fn,
                crop_fn,
                matched_person_id,
                match_similarity,
                "unreviewed",
                now_iso
            ))

            cursor.execute("""
            INSERT INTO audit_logs (timestamp, actor, action, target_id, details)
            VALUES (?, ?, ?, ?, ?)
            """, (
                now_iso,
                "ai_perception",
                "observation.live_detected",
                obs_id,
                f"Optical sensor detected subject {obs_code}. Matched person ID: {matched_person_id} ({match_similarity})"
            ))

            conn.commit()
        finally:
            conn.close()

        return self.get_observation(obs_id)  # type: ignore

    def list_persons(self) -> List[Dict[str, Any]]:
        """Lists all registered persons in the database."""
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM persons_registry ORDER BY created_at DESC")
            return [dict(r) for r in cursor.fetchall()]
        finally:
            conn.close()

    def add_person(
        self,
        full_name: str,
        category: str,
        badge_or_id: Optional[str] = None,
        photo_filename: Optional[str] = None,
        reported_last_seen: Optional[str] = None,
        medical_alerts: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Enrolls a person into the database registry for optical matching."""
        person_id = f"reg-{uuid.uuid4().hex[:8]}"
        now_iso = datetime.now(timezone.utc).isoformat()

        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
            INSERT INTO persons_registry (
                id, full_name, category, badge_or_id, photo_filename,
                reported_last_seen, medical_alerts, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                person_id,
                full_name,
                category,
                badge_or_id or f"ID-{person_id[-4:].upper()}",
                photo_filename,
                reported_last_seen or "Command Station Alpha",
                medical_alerts or "None documented",
                now_iso
            ))

            cursor.execute("""
            INSERT INTO audit_logs (timestamp, actor, action, target_id, details)
            VALUES (?, ?, ?, ?, ?)
            """, (
                now_iso,
                "operator",
                "registry.person_enrolled",
                person_id,
                f"Enrolled {full_name} ({category}) into rescue database"
            ))

            conn.commit()
        finally:
            conn.close()

        event_logger.log(
            category="system",
            level="success",
            message=f"Registered person enrolled: {full_name} [{category}]."
        )

        return {
            "id": person_id,
            "full_name": full_name,
            "category": category,
            "badge_or_id": badge_or_id,
            "photo_filename": photo_filename,
            "reported_last_seen": reported_last_seen,
            "medical_alerts": medical_alerts,
            "created_at": now_iso
        }

    def delete_person(self, person_id: str) -> bool:
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM persons_registry WHERE id = ?", (person_id,))
            deleted = cursor.rowcount > 0
            conn.commit()
            return deleted
        finally:
            conn.close()

    def clear_unreviewed_observations(self) -> int:
        """Removes unreviewed observations (e.g. false positives or test captures)."""
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM observations WHERE review_status = 'unreviewed'")
            count = cursor.rowcount
            conn.commit()
            event_logger.log(
                category="system",
                level="info",
                message=f"Purged {count} unreviewed observations from queue."
            )
            return count
        finally:
            conn.close()


    def trigger_observation(self, person_hint: Optional[str] = None) -> Dict[str, Any]:
        """
        Extracts or generates an observation from the camera stream,
        computes coordinates, matches against registry, and saves evidence.
        """
        from app.perception import perception_engine
        raw_frame = perception_engine.get_latest_raw_frame()

        if raw_frame:
            # If we have a live camera frame, process it with perception
            import cv2
            import numpy as np

            np_arr = np.frombuffer(raw_frame, np.uint8)
            frame_bgr = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
            if frame_bgr is not None:
                # Detect face
                gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
                faces = perception_engine.face_cascade.detectMultiScale(gray, 1.15, 3, minSize=(30, 30))
                if len(faces) == 0:
                    faces = perception_engine.profile_cascade.detectMultiScale(gray, 1.15, 3, minSize=(30, 30))

                if len(faces) > 0:
                    fx, fy, fw, fh = faces[0]
                    # Crop face
                    pad_x = int(fw * 0.15)
                    pad_y = int(fh * 0.15)
                    x1 = max(0, fx - pad_x)
                    y1 = max(0, fy - pad_y)
                    x2 = min(frame_bgr.shape[1], fx + fw + pad_x)
                    y2 = min(frame_bgr.shape[0], fy + fh + pad_y)
                    face_crop = frame_bgr[y1:y2, x1:x2]

                    matched_cand, score = perception_engine.match_face(face_crop)
                    est_dist = round(max(0.8, min(4.5, 180.0 / max(1.0, float(fh)))), 1)

                    # Annotate frame
                    annotated = frame_bgr.copy()
                    perception_engine._draw_tactical_hud(annotated, fx, fy, fw, fh, matched_cand, score, est_dist)

                    _, full_buf = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 80])
                    _, crop_buf = cv2.imencode(".jpg", face_crop, [cv2.IMWRITE_JPEG_QUALITY, 88])

                    return self.record_live_observation(
                        full_frame_bytes=full_buf.tobytes(),
                        crop_bytes=crop_buf.tobytes(),
                        matched_person_id=matched_cand["id"] if matched_cand else None,
                        match_similarity=score if matched_cand else None,
                        confidence=0.94 if matched_cand else 0.86,
                        distance_m=est_dist,
                        pos_x=0.0,
                        pos_y=est_dist,
                    )

        # Fallback to simulated observation generation if no face currently in view
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            obs_code = self._get_next_obs_code(cursor)
            obs_id = str(uuid.uuid4())
            now_iso = datetime.now(timezone.utc).isoformat()

            cursor.execute("SELECT * FROM persons_registry")
            candidates = [dict(row) for row in cursor.fetchall()]

            try:
                seq = int(obs_code.split("-")[-1])
            except Exception:
                seq = 1

            matched_candidate = candidates[(seq - 1) % len(candidates)] if candidates else None
            match_similarity = 0.86 if matched_candidate else None

            pos_x = round(0.4 * (seq % 3) - 0.2, 2)
            pos_y = round(0.5 * (seq % 2) + 0.3, 2)
            distance_m = round(1.8 + (seq % 3) * 0.6, 2)
            confidence = 0.89

            full_frame_fn = f"ev_{obs_id}_full.jpg"
            crop_fn = f"ev_{obs_id}_crop.jpg"

            full_frame_path = EVIDENCE_DIR / full_frame_fn
            crop_path = EVIDENCE_DIR / crop_fn

            self._create_evidence_pair(
                str(full_frame_path),
                str(crop_path),
                obs_code,
                matched_candidate["full_name"] if matched_candidate else "Unknown Person",
                distance_m
            )

            cursor.execute("""
            INSERT INTO observations (
                id, obs_code, timestamp, class_label, confidence, distance_m,
                pos_x, pos_y, pos_z, full_frame_path, crop_path,
                matched_person_id, match_similarity, review_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                obs_id,
                obs_code,
                now_iso,
                "person",
                confidence,
                distance_m,
                pos_x,
                pos_y,
                0.0,
                full_frame_fn,
                crop_fn,
                matched_candidate["id"] if matched_candidate else None,
                match_similarity,
                "unreviewed",
                now_iso
            ))

            cursor.execute("""
            INSERT INTO audit_logs (timestamp, actor, action, target_id, details)
            VALUES (?, ?, ?, ?, ?)
            """, (
                now_iso,
                "ai_perception",
                "observation.created",
                obs_id,
                f"Candidate detected: {obs_code} with similarity {match_similarity} to {matched_candidate['full_name'] if matched_candidate else 'None'}"
            ))

            conn.commit()
        finally:
            conn.close()

        event_logger.log(
            category="system",
            level="warning",
            message=f"NEW OBSERVATION {obs_code}: Potential person located at ({pos_x}m, {pos_y}m). Ready for review."
        )

        return self.get_observation(obs_id)  # type: ignore

    def _create_evidence_pair(
        self,
        full_path: str,
        crop_path: str,
        obs_code: str,
        match_name: str,
        distance_m: float
    ):
        """Generates realistic evidence images with tactical annotations."""
        w, h = 640, 480
        img = Image.new("RGB", (w, h), color=(15, 23, 42))
        draw = ImageDraw.Draw(img)

        # Subtle search area geometry
        for y in range(0, h, 60):
            draw.line([(0, y), (w, y)], fill=(30, 41, 59), width=1)
        for x in range(0, w, 60):
            draw.line([(x, 0), (x, h)], fill=(30, 41, 59), width=1)

        # Bounding box of detected person (center-right)
        bx1, by1, bx2, by2 = 260, 100, 420, 380
        draw.rectangle([bx1, by1, bx2, by2], outline=(234, 179, 8), width=2)

        # Silhouette inside box
        cx = (bx1 + bx2) // 2
        draw.ellipse([cx - 25, by1 + 20, cx + 25, by1 + 80], fill=(148, 163, 184))
        draw.polygon([(cx - 50, by2 - 20), (cx + 50, by2 - 20), (cx + 30, by1 + 90), (cx - 30, by1 + 90)], fill=(100, 116, 139))

        # HUD Overlay Box
        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        draw.rectangle([bx1, by1 - 24, bx2, by1], fill=(234, 179, 8))
        draw.text((bx1 + 6, by1 - 20), f"PERSON (MATCH CANDIDATE: {match_name[:12]})", fill=(15, 23, 42))

        # Footer data tag
        draw.rectangle([10, h - 35, w - 10, h - 10], fill=(0, 0, 0))
        draw.text((20, h - 28), f"PIPER OPTICAL EVIDENCE | {obs_code} | DIST: {distance_m}m | TIME: {now_str}", fill=(56, 189, 248))

        img.save(full_path, "JPEG", quality=80)

        # Save close-up crop
        crop_box = img.crop((bx1 - 10, by1 - 10, bx2 + 10, by2 + 10))
        crop_box.save(crop_path, "JPEG", quality=85)

    def list_observations(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        conn = get_db_connection()
        try:
            cursor = conn.cursor()

            query = """
            SELECT o.*, p.full_name as person_name, p.category as person_category,
                   p.reported_last_seen, p.medical_alerts, p.photo_filename as person_photo,
                   i.id as incident_id, i.incident_code, i.priority as incident_priority, i.status as incident_status
            FROM observations o
            LEFT JOIN persons_registry p ON o.matched_person_id = p.id
            LEFT JOIN incident_reports i ON o.id = i.observation_id
            """
            params = []
            if status:
                query += " WHERE o.review_status = ?"
                params.append(status)

            query += " ORDER BY o.created_at DESC"

            cursor.execute(query, params)
            rows = [dict(r) for r in cursor.fetchall()]
        finally:
            conn.close()

        enriched = []
        for r in rows:
            label = r.get("class_label", "person")
            if label == "person":
                tag = "Person (Possible)"
                title = "Possible human detected"
            elif label == "structural_risk":
                tag = "Structural Risk"
                title = "Unstable structure"
            elif label == "point_of_interest":
                tag = "Point of Interest"
                title = "Area requires inspection"
            elif label == "equipment":
                tag = "Equipment"
                title = "Backpack detected"
            else:
                tag = "Person (Possible)"
                title = f"Detected {label}"

            pos_x = r.get("pos_x", 0.0)
            pos_y = r.get("pos_y", 0.0)
            sector_num = abs(int(pos_x * 2 + pos_y * 3)) % 4 + 1
            sector = f"Sector {sector_num}"

            r["category_tag"] = tag
            r["title"] = title
            r["sector"] = sector
            enriched.append(r)

        return enriched

    def get_observation(self, obs_id: str) -> Optional[Dict[str, Any]]:
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
            SELECT o.*, p.full_name as person_name, p.category as person_category,
                   p.reported_last_seen, p.medical_alerts, p.photo_filename as person_photo,
                   i.id as incident_id, i.incident_code, i.priority as incident_priority, i.status as incident_status
            FROM observations o
            LEFT JOIN persons_registry p ON o.matched_person_id = p.id
            LEFT JOIN incident_reports i ON o.id = i.observation_id
            WHERE o.id = ?
            """, (obs_id,))
            row = cursor.fetchone()
            return dict(row) if row else None
        finally:
            conn.close()

    def review_observation(
        self,
        obs_id: str,
        decision: str,
        notes: str = ""
    ) -> Optional[Dict[str, Any]]:
        """Human operator review decision: confirmed, rejected, or uncertain."""
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            now_iso = datetime.now(timezone.utc).isoformat()

            cursor.execute("""
            UPDATE observations
            SET review_status = ?, reviewer_notes = ?
            WHERE id = ?
            """, (decision, notes, obs_id))

            cursor.execute("""
            INSERT INTO audit_logs (timestamp, actor, action, target_id, details)
            VALUES (?, ?, ?, ?, ?)
            """, (
                now_iso,
                "operator",
                f"review.{decision}",
                obs_id,
                f"Operator marked observation as {decision}. Notes: {notes}"
            ))

            conn.commit()
        finally:
            conn.close()

        event_logger.log(
            category="system",
            level="success" if decision == "confirmed" else "info",
            message=f"Observation {obs_id[:8]} marked as '{decision.upper()}' by operator."
        )

        return self.get_observation(obs_id)

    def create_incident(
        self,
        obs_id: str,
        priority: str = "P1 - Immediate",
        assigned_team: str = "Team Alpha (Search & Rescue)",
        summary: str = ""
    ) -> Dict[str, Any]:
        """Converts a confirmed observation into an official Incident Report."""
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            today_code = datetime.now(timezone.utc).strftime("%Y%m%d")
            inc_code = self._get_next_incident_code(cursor, today_code)
            inc_id = str(uuid.uuid4())
            now_iso = datetime.now(timezone.utc).isoformat()

            cursor.execute("""
            INSERT INTO incident_reports (
                id, incident_code, observation_id, priority, assigned_team, status, summary, created_at
            ) VALUES (?, ?, ?, ?, ?, 'open', ?, ?)
            """, (inc_id, inc_code, obs_id, priority, assigned_team, summary, now_iso))

            # Also confirm observation if not already confirmed
            cursor.execute("""
            UPDATE observations SET review_status = 'confirmed' WHERE id = ?
            """, (obs_id,))

            cursor.execute("""
            INSERT INTO audit_logs (timestamp, actor, action, target_id, details)
            VALUES (?, ?, ?, ?, ?)
            """, (
                now_iso,
                "operator",
                "incident.created",
                inc_id,
                f"Incident {inc_code} dispatched to {assigned_team} with priority {priority}"
            ))

            conn.commit()
        finally:
            conn.close()

        event_logger.log(
            category="system",
            level="warning",
            message=f"🚨 INCIDENT DISPATCHED: {inc_code} ({priority}) assigned to {assigned_team}"
        )

        return {
            "id": inc_id,
            "incident_code": inc_code,
            "observation_id": obs_id,
            "priority": priority,
            "assigned_team": assigned_team,
            "status": "open",
            "summary": summary,
            "created_at": now_iso
        }

    def list_incidents(self) -> List[Dict[str, Any]]:
        conn = get_db_connection()
        try:
            cursor = conn.cursor()
            cursor.execute("""
            SELECT i.*, o.obs_code, o.distance_m, o.pos_x, o.pos_y, o.full_frame_path, o.crop_path,
                   p.full_name as person_name, p.category as person_category, p.medical_alerts
            FROM incident_reports i
            JOIN observations o ON i.observation_id = o.id
            LEFT JOIN persons_registry p ON o.matched_person_id = p.id
            ORDER BY i.created_at DESC
            """)
            return [dict(r) for r in cursor.fetchall()]
        finally:
            conn.close()


observation_manager = ObservationManager()
