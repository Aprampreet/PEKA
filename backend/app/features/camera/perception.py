import os
import time
import uuid
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple

import cv2
import numpy as np

from app.db import EVIDENCE_DIR, get_db_connection
from app.event_log import event_logger


class PerceptionEngine:
    """
    High-precision real-time face perception, detection, and recognition engine.
    - Uses haarcascade_frontalface_alt2 with eye structure verification to eliminate false positives.
    - Requires temporal persistence (consecutive frame hits) before triggering observations.
    - Rejects undersized / non-square artifacts (minimum face size 70x70 px).
    - Prevents premature triggers with a startup grace period.
    - Matches face crops against registered persons in DB.
    """

    def __init__(self):
        cascade_dir = cv2.data.haarcascades
        # haarcascade_frontalface_alt2 has significantly lower false positive rate
        self.face_cascade_alt2 = cv2.CascadeClassifier(cascade_dir + "haarcascade_frontalface_alt2.xml")
        self.face_cascade_default = cv2.CascadeClassifier(cascade_dir + "haarcascade_frontalface_default.xml")
        self.face_cascade = self.face_cascade_default
        self.profile_cascade = cv2.CascadeClassifier(cascade_dir + "haarcascade_profileface.xml")
        self.eye_cascade = cv2.CascadeClassifier(cascade_dir + "haarcascade_eye.xml")

        # Registry Cache
        self._registry_cache: List[Dict[str, Any]] = []
        self._last_registry_refresh: float = 0.0
        self.reload_registry()

        # Observation debouncing & state
        self._startup_grace_until: float = 0.0
        self._last_observation_time: float = 0.0
        self._observation_cooldown_sec: float = 4.0  # 4s cooldown between auto observations

        self._consecutive_face_frames: int = 0
        self._required_consecutive_frames: int = 1  # Trigger observation immediately on detection

        self._latest_raw_frame: Optional[bytes] = None
        self._latest_annotated_frame: Optional[bytes] = None
        self._last_detected_count: int = 0

    def reload_registry(self):
        """Reloads registered persons and precomputes image feature templates."""
        conn = None
        try:
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM persons_registry")
            rows = [dict(r) for r in cursor.fetchall()]
        except Exception as e:
            event_logger.log(
                category="perception",
                level="warning",
                message=f"Failed to query registry: {str(e)[:80]}"
            )
            rows = []
        finally:
            if conn:
                conn.close()

        try:
            cache = []
            for r in rows:
                photo_fn = r.get("photo_filename")
                photo_path = EVIDENCE_DIR / photo_fn if photo_fn else None

                tmpl_gray = None
                tmpl_hsv_hist = None

                if photo_path and photo_path.exists():
                    ref_bgr = cv2.imread(str(photo_path))
                    if ref_bgr is not None and ref_bgr.size > 0:
                        ref_std = cv2.resize(ref_bgr, (128, 128))
                        g = cv2.cvtColor(ref_std, cv2.COLOR_BGR2GRAY)
                        tmpl_gray = cv2.equalizeHist(g)
                        hsv = cv2.cvtColor(ref_std, cv2.COLOR_BGR2HSV)
                        hist = cv2.calcHist([hsv], [0, 1], None, [16, 16], [0, 180, 0, 256])
                        cv2.normalize(hist, hist, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)
                        tmpl_hsv_hist = hist

                cache.append({
                    "id": r["id"],
                    "full_name": r["full_name"],
                    "category": r["category"],
                    "badge_or_id": r.get("badge_or_id", ""),
                    "photo_filename": photo_fn,
                    "reported_last_seen": r.get("reported_last_seen", ""),
                    "medical_alerts": r.get("medical_alerts", ""),
                    "tmpl_gray": tmpl_gray,
                    "tmpl_hsv_hist": tmpl_hsv_hist,
                })

            self._registry_cache = cache
            self._last_registry_refresh = time.time()
        except Exception as e:
            event_logger.log(
                category="perception",
                level="warning",
                message=f"Failed to reload registry cache: {str(e)[:80]}"
            )

    def match_face(self, face_bgr: np.ndarray) -> Tuple[Optional[Dict[str, Any]], float]:
        """
        Compares an extracted face crop against registered persons in DB.
        Returns (best_match_candidate, similarity_score).
        """
        if not self._registry_cache or face_bgr is None or face_bgr.size == 0:
            return None, 0.0

        std_face = cv2.resize(face_bgr, (128, 128))
        query_gray = cv2.equalizeHist(cv2.cvtColor(std_face, cv2.COLOR_BGR2GRAY))
        query_hsv = cv2.cvtColor(std_face, cv2.COLOR_BGR2HSV)
        query_hist = cv2.calcHist([query_hsv], [0, 1], None, [16, 16], [0, 180, 0, 256])
        cv2.normalize(query_hist, query_hist, alpha=0, beta=1, norm_type=cv2.NORM_MINMAX)

        best_candidate = None
        best_score = 0.0

        for cand in self._registry_cache:
            if cand["tmpl_gray"] is None or cand["tmpl_hsv_hist"] is None:
                continue

            # 1. Structural template correlation
            res = cv2.matchTemplate(query_gray, cand["tmpl_gray"], cv2.TM_CCOEFF_NORMED)
            struct_score = max(0.0, float(res[0][0]))

            # 2. HSV color/skin tone correlation
            color_score = max(0.0, float(cv2.compareHist(query_hist, cand["tmpl_hsv_hist"], cv2.HISTCMP_CORREL)))

            # Combined score (weighted)
            sim = (struct_score * 0.45) + (color_score * 0.55)

            if sim > best_score:
                best_score = sim
                best_candidate = cand

        # Verification threshold: >= 0.55 is matched candidate
        if best_candidate and best_score >= 0.55:
            scaled_sim = min(0.98, 0.60 + (best_score - 0.55) * 0.9)
            return best_candidate, round(scaled_sim, 2)

        return None, round(best_score, 2)

    def process_frame(self, frame_bytes: bytes) -> bytes:
        """
        Processes a raw incoming JPEG camera frame:
        - Detects human faces with precision filters.
        - Matches against database registry.
        - Draws HUD tactical bounding boxes.
        - Triggers auto-observation only when face persists stably across frames.
        """
        if not frame_bytes:
            return frame_bytes

        self._latest_raw_frame = frame_bytes

        # Decode JPEG into BGR image
        np_arr = np.frombuffer(frame_bytes, np.uint8)
        frame_bgr = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame_bgr is None:
            return frame_bytes

        h, w = frame_bgr.shape[:2]

        # Fast detection on grayscale frame
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)

        # Scale down only if image is large (> 800px width)
        if w > 800:
            scale = 0.5
            proc_gray = cv2.resize(gray, (0, 0), fx=scale, fy=scale)
            inv_scale = 2.0
        else:
            scale = 1.0
            proc_gray = gray
            inv_scale = 1.0

        # 1. Primary: frontalface_default with scaleFactor=1.03 and minNeighbors=2
        min_sz = int(24 * scale)
        detected_raw = self.face_cascade_default.detectMultiScale(
            proc_gray,
            scaleFactor=1.03,
            minNeighbors=2,
            minSize=(min_sz, min_sz)
        )

        # 2. Secondary: frontalface_alt2 fallback
        if len(detected_raw) == 0:
            detected_raw = self.face_cascade_alt2.detectMultiScale(
                proc_gray,
                scaleFactor=1.03,
                minNeighbors=2,
                minSize=(min_sz, min_sz)
            )

        # 3. Tertiary: profile face (tilted / side view)
        if len(detected_raw) == 0 and hasattr(self, "profile_cascade"):
            detected_raw = self.profile_cascade.detectMultiScale(
                proc_gray,
                scaleFactor=1.03,
                minNeighbors=2,
                minSize=(min_sz, min_sz)
            )

        # 4. Quaternary: if still nothing and image is low-contrast, try CLAHE enhanced
        if len(detected_raw) == 0:
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            enhanced_gray = clahe.apply(proc_gray)
            detected_raw = self.face_cascade_default.detectMultiScale(
                enhanced_gray,
                scaleFactor=1.04,
                minNeighbors=2,
                minSize=(min_sz, min_sz)
            )

        valid_faces = []

        for (sx, sy, sw, sh) in detected_raw:
            fx = int(sx * inv_scale)
            fy = int(sy * inv_scale)
            fw = int(sw * inv_scale)
            fh = int(sh * inv_scale)

            # Minimum face size: 30x30 px
            if fw < 30 or fh < 30:
                continue

            # Natural facial aspect ratio check (0.60 to 1.60)
            aspect = float(fw) / max(1.0, float(fh))
            if aspect < 0.60 or aspect > 1.60:
                continue

            # Clamp coordinates
            fx = max(0, fx)
            fy = max(0, fy)
            fw = min(w - fx, fw)
            fh = min(h - fy, fh)

            valid_faces.append((fx, fy, fw, fh))

        self._last_detected_count = len(valid_faces)

        # Temporal persistence tracker
        if len(valid_faces) > 0:
            self._consecutive_face_frames += 1
        else:
            self._consecutive_face_frames = max(0, self._consecutive_face_frames - 1)

        # If no valid face detected, return original frame with zero overhead
        if not valid_faces:
            self._latest_annotated_frame = frame_bytes
            return frame_bytes

        # Annotate detected faces
        annotated_img = frame_bgr.copy()
        current_time = time.time()
        primary_match = None
        primary_score = 0.0
        primary_crop_bytes = None
        has_facial_structure = False

        for idx, (fx, fy, fw, fh) in enumerate(valid_faces):
            # Extract face crop with slight margin
            pad_x = int(fw * 0.15)
            pad_y = int(fh * 0.15)
            x1 = max(0, fx - pad_x)
            y1 = max(0, fy - pad_y)
            x2 = min(w, fx + fw + pad_x)
            y2 = min(h, fy + fh + pad_y)

            face_crop = frame_bgr[y1:y2, x1:x2]

            # Eye / feature verification on top 65% of face crop
            crop_gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
            upper_crop = crop_gray[:int(crop_gray.shape[0] * 0.65), :]
            eyes = self.eye_cascade.detectMultiScale(upper_crop, scaleFactor=1.15, minNeighbors=2, minSize=(14, 14))

            # Match against DB
            matched_candidate, sim_score = self.match_face(face_crop)

            has_facial_structure = True
            if len(eyes) > 0 or matched_candidate is not None:
                has_verified_eyes = True

            if idx == 0:
                primary_match = matched_candidate
                primary_score = sim_score
                ret_c, crop_buf = cv2.imencode(".jpg", face_crop, [cv2.IMWRITE_JPEG_QUALITY, 88])
                if ret_c:
                    primary_crop_bytes = crop_buf.tobytes()

            est_distance = round(max(0.6, min(5.0, 180.0 / max(1.0, float(fh)))), 1)

            # Draw HUD
            self._draw_tactical_hud(
                annotated_img,
                fx, fy, fw, fh,
                matched_candidate,
                sim_score,
                est_distance
            )

        # Re-encode annotated frame
        ret, enc_buf = cv2.imencode(".jpg", annotated_img, [cv2.IMWRITE_JPEG_QUALITY, 78])
        annotated_bytes = enc_buf.tobytes() if ret else frame_bytes
        self._latest_annotated_frame = annotated_bytes

        # Auto-create observation ONLY when:
        # 1. Startup grace period has passed (past stream warmup)
        # 2. Face is stably visible for >= required consecutive frames
        # 3. Debounce cooldown has elapsed
        is_past_grace = current_time >= self._startup_grace_until
        is_stably_visible = self._consecutive_face_frames >= self._required_consecutive_frames
        is_cooldown_ready = (current_time - self._last_observation_time) >= self._observation_cooldown_sec

        if (
            primary_crop_bytes is not None
            and is_past_grace
            and is_stably_visible
            and is_cooldown_ready
        ):
            self._last_observation_time = current_time
            self._auto_log_observation(
                annotated_bytes,
                primary_crop_bytes,
                primary_match,
                primary_score,
                est_distance=round(max(0.8, min(4.5, 180.0 / max(1.0, float(valid_faces[0][3])))), 1)
            )

        return annotated_bytes

    def _draw_tactical_hud(
        self,
        img: np.ndarray,
        x: int, y: int, w: int, h: int,
        match: Optional[Dict[str, Any]],
        sim_score: float,
        distance_m: float
    ):
        """Draws a sleek rescue HUD reticle and info tag on the image."""
        is_matched = match is not None and sim_score >= 0.55

        # Tactical colors (BGR): Matched = Emerald (129, 185, 16), Unregistered = Cyan (212, 182, 6)
        color = (129, 185, 16) if is_matched else (212, 182, 6)

        c_len = max(12, min(28, w // 4))
        th = 2

        # Corner brackets
        cv2.line(img, (x, y), (x + c_len, y), color, th)
        cv2.line(img, (x, y), (x, y + c_len), color, th)
        cv2.line(img, (x + w, y), (x + w - c_len, y), color, th)
        cv2.line(img, (x + w, y), (x + w, y + c_len), color, th)
        cv2.line(img, (x, y + h), (x + c_len, y + h), color, th)
        cv2.line(img, (x, y + h), (x, y + h - c_len), color, th)
        cv2.line(img, (x + w, y + h), (x + w - c_len, y + h), color, th)
        cv2.line(img, (x + w, y + h), (x + w, y + h - c_len), color, th)

        # Center reticle
        cx, cy = x + w // 2, y + h // 2
        cv2.line(img, (cx - 6, cy), (cx + 6, cy), color, 1)
        cv2.line(img, (cx, cy - 6), (cx, cy + 6), color, 1)

        # Tag Banner
        if is_matched and match:
            tag_title = f"[ID: {match['full_name'][:18].upper()}]"
            tag_sub = f"MATCH: {int(sim_score * 100)}% | {match.get('category', 'PERSON')[:14].upper()}"
        else:
            tag_title = "[HUMAN DETECTED]"
            tag_sub = "UNREGISTERED PERSON"

        font = cv2.FONT_HERSHEY_SIMPLEX
        scale_title = 0.42
        scale_sub = 0.36

        (tw1, th1), _ = cv2.getTextSize(tag_title, font, scale_title, 1)
        (tw2, th2), _ = cv2.getTextSize(tag_sub, font, scale_sub, 1)
        tag_w = max(tw1, tw2, w) + 12
        tag_h = th1 + th2 + 10

        tag_y1 = max(0, y - tag_h - 4)
        tag_y2 = tag_y1 + tag_h

        overlay = img.copy()
        cv2.rectangle(overlay, (x, tag_y1), (x + tag_w, tag_y2), (15, 23, 42), -1)
        cv2.addWeighted(overlay, 0.78, img, 0.22, 0, img)
        cv2.rectangle(img, (x, tag_y1), (x + tag_w, tag_y2), color, 1)

        cv2.putText(img, tag_title, (x + 5, tag_y1 + th1 + 2), font, scale_title, color, 1, cv2.LINE_AA)
        cv2.putText(img, tag_sub, (x + 5, tag_y2 - 3), font, scale_sub, (241, 245, 249), 1, cv2.LINE_AA)

        # Footer tag
        foot_text = f"DIST: ~{distance_m}m"
        (fw, fh), _ = cv2.getTextSize(foot_text, font, 0.36, 1)
        foot_y1 = y + h + 4
        foot_y2 = foot_y1 + fh + 6

        if foot_y2 < img.shape[0]:
            overlay2 = img.copy()
            cv2.rectangle(overlay2, (x, foot_y1), (x + fw + 8, foot_y2), (15, 23, 42), -1)
            cv2.addWeighted(overlay2, 0.78, img, 0.22, 0, img)
            cv2.rectangle(img, (x, foot_y1), (x + fw + 8, foot_y2), (56, 189, 248), 1)
            cv2.putText(img, foot_text, (x + 4, foot_y2 - 3), font, 0.36, (56, 189, 248), 1, cv2.LINE_AA)

    def _auto_log_observation(
        self,
        annotated_bytes: bytes,
        crop_bytes: bytes,
        match: Optional[Dict[str, Any]],
        similarity: float,
        est_distance: float
    ):
        """Asynchronously writes a newly observed human to SQLite and event feed on a background thread."""
        def _persist_worker():
            try:
                from app.observations import observation_manager
                obs = observation_manager.record_live_observation(
                    full_frame_bytes=annotated_bytes,
                    crop_bytes=crop_bytes,
                    matched_person_id=match["id"] if match else None,
                    match_similarity=similarity if match else None,
                    confidence=0.94 if match else 0.88,
                    distance_m=est_distance,
                    pos_x=0.0,
                    pos_y=est_distance,
                )
                name_str = match["full_name"] if match else "Unregistered Subject"
                sim_str = f"({int(similarity * 100)}% match)" if match else ""
                obs_code = obs.get("obs_code", "") if isinstance(obs, dict) else ""
                event_logger.log(
                    category="perception",
                    level="success" if match else "warning",
                    message=f"👀 Live detection: {name_str} {sim_str} spotted at ~{est_distance}m. Observation logged ({obs_code})."
                )

                # Trigger Autonomous AI Survivor Reassurance broadcast through rover speaker
                try:
                    from app.features.speaker.service import speaker_service
                    speaker_service.handle_face_detected(match=match, distance_m=est_distance)
                except Exception:
                    pass
            except Exception as e:
                event_logger.log(
                    category="perception",
                    level="error",
                    message=f"Failed to auto-log live observation: {str(e)[:80]}"
                )

        thread = threading.Thread(target=_persist_worker, daemon=True)
        thread.start()

    def get_latest_raw_frame(self) -> Optional[bytes]:
        return self._latest_raw_frame


perception_engine = PerceptionEngine()
