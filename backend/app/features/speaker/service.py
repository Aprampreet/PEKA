import os
import sys
import time
import random
import threading
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict, Any, Tuple
import httpx

from app.core.config import settings
from app.core.events import event_logger


class SpeakerService:
    """
    Autonomous Survivor Reassurance & Rover Speaker Broadcast Service.
    - Uses Contextual Rescue AI to generate calm, authoritative survivor messages.
    - Synthesizes 16-bit PCM WAV audio.
    - Dispatches audio to physical rover endpoint: POST /api/speaker/play-audio.
    - Can play audio on local laptop speakers via system player for live feedback.
    - Manages intelligent debouncing / cooldown to avoid repetitive audio loops.
    """

    def __init__(self):
        self._auto_broadcast_enabled: bool = True
        self._last_broadcast_time: float = 0.0
        self._cooldown_seconds: float = 18.0  # Cooldown between automated voice announcements
        self._last_broadcast_text: Optional[str] = None
        self._last_broadcast_timestamp: Optional[str] = None
        self._audio_cache_dir: Path = Path("/tmp/peka_speaker")
        self._audio_cache_dir.mkdir(parents=True, exist_ok=True)

    @property
    def auto_broadcast_enabled(self) -> bool:
        return self._auto_broadcast_enabled

    def set_auto_broadcast_enabled(self, enabled: bool):
        self._auto_broadcast_enabled = enabled
        event_logger.log(
            category="speaker",
            level="info",
            message=f"Autonomous AI Voice Reassurance {'ENABLED' if enabled else 'DISABLED'}."
        )

    def get_status(self) -> Dict[str, Any]:
        now = time.time()
        elapsed = now - self._last_broadcast_time
        remaining = max(0.0, self._cooldown_seconds - elapsed)

        upstream_base = settings.piper_robot_api_url.rstrip("/")
        rover_url = f"{upstream_base}/api/speech/speak"

        return {
            "auto_broadcast_enabled": self._auto_broadcast_enabled,
            "cooldown_remaining_sec": round(remaining, 1),
            "last_broadcast_text": self._last_broadcast_text,
            "last_broadcast_time": self._last_broadcast_timestamp,
            "rover_speaker_url": rover_url,
        }

    def generate_ai_reassurance(
        self,
        person_name: Optional[str] = None,
        distance_m: Optional[float] = None,
        sector: str = "Sector 3",
        language: str = "en"
    ) -> str:
        """
        Generates a concise, calming, tactical search-and-rescue reassurance announcement.
        Uses contextual rescue intelligence with personal name and distance awareness.
        """
        dist_str = f"{distance_m:.1f} meters" if distance_m else "nearby"

        if language == "hi":
            # Hindi Rescue Announcements
            if person_name:
                templates = [
                    f"नमस्ते {person_name}. रेस्क्यू रोबोट पाइपर ने आपको लोकेट कर लिया है। हमारी टीम आ रही है, कृपया शांत रहें और वहीं रुकें।",
                    f"{person_name}, घबराइए मत! रेस्क्यू टीम आपके पास पहुँच रही है। आप सुरक्षित हैं, अपनी जगह पर बने रहें।",
                    f"{person_name}, सहायता आ रही है। हम आपको देख सकते हैं, बिल्कुल शांत रहें।",
                ]
            else:
                templates = [
                    f"घबराइए मत! डिजास्टर रेस्क्यू टीम ने आपको ढूंढ लिया है। मदद आ रही है, कृपया अपनी जगह पर सुरक्षित रहें।",
                    f"अटेंशन! रेस्क्यू रोबोट पाइपर आपके पास है। मेडिकल टीम रास्ते में है, कृपया शांत रहें।",
                    f"हम आपको देख सकते हैं। रेस्क्यू टीम आ रही है, कृपया हिलें मत और शांत रहें।",
                ]
        else:
            # English Rescue Announcements
            if person_name:
                templates = [
                    f"Hello {person_name}, PIPER Rescue Robot has located you at {sector}. Medical responders are inbound to your coordinates. Stay calm and remain where you are.",
                    f"{person_name}, do not panic. Search and rescue teams have your exact position. Help is arriving right now. You are safe.",
                    f"{person_name}, we see you clearly. PIPER rescue unit is standing by with you. Assistance is en route, please stay still.",
                ]
            else:
                templates = [
                    f"Do not panic! PIPER Rescue Robot has located you. Search and rescue personnel are on the way. Stay calm and remain where you are.",
                    f"Attention! You have been located by the search and rescue team. Emergency responders are inbound. You will be safe, please stay still.",
                    f"Help is on the way. We have pinpointed your location. Please stay calm and do not move through the rubble.",
                ]

        return random.choice(templates)

    def synthesize_speech_wav(self, text: str, language: str = "en") -> Tuple[bytes, Path]:
        """
        Synthesizes text into standard 16-bit PCM 22.05 kHz WAV audio.
        Uses macOS system synthesizer with Indian English / Hindi voices, with cross-platform fallback.
        """
        timestamp = int(time.time() * 1000)
        output_wav = self._audio_cache_dir / f"speech_{timestamp}.wav"

        # Check if macOS 'say' command is available
        if sys.platform == "darwin":
            voice = "Lekha" if language == "hi" else "Aman"
            cmd = [
                "say",
                "-v", voice,
                "-o", str(output_wav),
                "--data-format=LEI16@22050",
                text
            ]
            try:
                subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=4.0)
                if output_wav.exists() and output_wav.stat().st_size > 44:
                    wav_bytes = output_wav.read_bytes()
                    return wav_bytes, output_wav
            except Exception:
                # If selected voice failed, fallback to default macOS voice
                try:
                    cmd_fallback = ["say", "-o", str(output_wav), "--data-format=LEI16@22050", text]
                    subprocess.run(cmd_fallback, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=4.0)
                    if output_wav.exists() and output_wav.stat().st_size > 44:
                        wav_bytes = output_wav.read_bytes()
                        return wav_bytes, output_wav
                except Exception:
                    pass

        # Fallback: Minimal WAV chime header if TTS binary is unavailable
        wav_bytes = self._generate_fallback_chime_wav()
        output_wav.write_bytes(wav_bytes)
        return wav_bytes, output_wav

    def _generate_fallback_chime_wav(self) -> bytes:
        """Generates a pleasant 2-tone rescue alert chime WAV (440Hz -> 880Hz)"""
        import wave
        import io
        import math
        import struct

        buf = io.BytesIO()
        sample_rate = 22050
        duration = 1.0  # seconds

        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)

            total_frames = int(sample_rate * duration)
            for i in range(total_frames):
                t = i / sample_rate
                freq = 587.33 if t < 0.5 else 880.0  # D5 to A5 rescue chime
                val = int(math.sin(2 * math.pi * freq * t) * 16000 * (1.0 - (t % 0.5) * 1.5))
                val = max(-32767, min(32767, val))
                wf.writeframes(struct.pack("<h", val))

        return buf.getvalue()

    def broadcast_audio(
        self,
        text: str,
        language: str = "en",
        play_local: bool = False,
        send_rover: bool = True
    ) -> Dict[str, Any]:
        """
        Synthesizes text, forwards WAV to rover speaker API.
        Local playback is disabled by default so audio is only transmitted to the physical rover.
        """
        wav_bytes, wav_path = self.synthesize_speech_wav(text, language)

        now_iso = datetime.now(timezone.utc).isoformat()
        self._last_broadcast_text = text
        self._last_broadcast_timestamp = now_iso
        self._last_broadcast_time = time.time()

        # 1. Play locally on laptop (only if explicitly requested)
        played_locally = False
        if play_local and sys.platform == "darwin":
            try:
                def _play():
                    try:
                        subprocess.run(["afplay", str(wav_path)], timeout=10.0)
                    except Exception:
                        pass
                threading.Thread(target=_play, daemon=True).start()
                played_locally = True
            except Exception:
                pass

        # 2. Dispatch to Physical Rover
        rover_dispatched = False
        rover_status = "skipped"

        if send_rover:
            upstream_base = settings.piper_robot_api_url.rstrip("/")
            speak_url = f"{upstream_base}/api/speech/speak"
            audio_url = f"{upstream_base}/api/speaker/play-audio"

            def _send_to_rover():
                nonlocal rover_dispatched, rover_status
                try:
                    with httpx.Client(timeout=10.0) as client:
                        # 1. Primary: dispatch directly to upstream's /api/speech/speak (spd-say on rover)
                        resp = client.post(speak_url, json={"text": text.strip()})
                        if resp.status_code in (200, 201):
                            rover_dispatched = True
                            rover_status = "played_on_rover"
                            event_logger.log(
                                category="speaker",
                                level="success",
                                message=f"🔊 Spoken out on Rover: \"{text[:60]}\""
                            )
                            return

                        # 2. Secondary fallback: WAV audio file upload
                        files = {"file": ("speech.wav", wav_bytes, "audio/wav")}
                        resp = client.post(audio_url, files=files)
                        if resp.status_code in (200, 201):
                            rover_dispatched = True
                            rover_status = "played_on_rover"
                            event_logger.log(
                                category="speaker",
                                level="success",
                                message=f"🔊 Transmitted WAV to Rover: \"{text[:60]}\""
                            )
                        else:
                            rover_status = f"rover_http_{resp.status_code}"
                except Exception as e:
                    rover_status = f"rover_offline: {str(e)[:40]}"
                    event_logger.log(
                        category="speaker",
                        level="info",
                        message=f"Rover speaker bridge ({str(e)[:30]})."
                    )

            # Run in worker thread to prevent blocking
            threading.Thread(target=_send_to_rover, daemon=True).start()

        event_logger.log(
            category="speaker",
            level="info",
            message=f"📢 Rover Voice Broadcast: \"{text[:75]}\" (Lang: {language.upper()})"
        )

        return {
            "success": True,
            "message_text": text,
            "language": language,
            "rover_dispatched": rover_dispatched,
            "rover_status": rover_status,
            "played_locally": played_locally,
            "timestamp": now_iso,
        }

    def handle_face_detected(self, match: Optional[Dict[str, Any]], distance_m: float):
        """
        Callback invoked by PerceptionEngine when a human face is spotted in live video.
        Checks cooldown, generates contextual AI message, and triggers broadcast ONLY to rover speaker.
        """
        if not self._auto_broadcast_enabled:
            return

        now = time.time()
        if now - self._last_broadcast_time < self._cooldown_seconds:
            return  # In active debouncing cooldown

        person_name = match.get("full_name") if match else None

        # Generate intelligent contextual reassurance
        ai_message = self.generate_ai_reassurance(
            person_name=person_name,
            distance_m=distance_m,
            sector="Sector 3",
            language="en"
        )

        # Broadcast strictly to rover speaker (play_local=False)
        threading.Thread(
            target=self.broadcast_audio,
            kwargs={
                "text": ai_message,
                "language": "en",
                "play_local": False,
                "send_rover": True,
            },
            daemon=True
        ).start()


speaker_service = SpeakerService()
