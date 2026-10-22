# rover_speaker_service.py
# Runs on the Rover's edge computer (Raspberry Pi / Jetson / Mini-PC) with connected physical speaker
# Requirements: pip install fastapi uvicorn python-multipart
# System requirement: alsa-utils (for 'aplay' command on Linux)

from fastapi import FastAPI, UploadFile, File
import subprocess
import uvicorn
import os

app = FastAPI(
    title="PIPER Rover Speaker Subsystem",
    description="Physical audio playback service for live survivor reassurance in disaster zones"
)

@app.get("/")
def health_check():
    return {
        "subsystem": "PIPER Rover Speaker",
        "status": "online",
        "audio_device": "default",
    }

@app.post("/api/speaker/play-audio")
async def play_audio(file: UploadFile = File(...)):
    """
    Receives synthesized 16-bit PCM WAV from PEKA laptop dashboard
    and immediately plays it through the rover's physical speaker.
    """
    audio_path = "/tmp/rover_speech.wav"
    content = await file.read()
    
    with open(audio_path, "wb") as f:
        f.write(content)
    
    # Trigger playback through default sound device via ALSA aplay
    try:
        # Non-blocking subprocess run
        proc = subprocess.Popen(["aplay", "-D", "default", audio_path])
        return {
            "status": "playing",
            "filename": file.filename,
            "bytes_received": len(content),
            "pid": proc.pid
        }
    except Exception as e:
        return {
            "status": "playback_failed",
            "error": str(e)
        }

if __name__ == "__main__":
    print("🔊 Starting PIPER Rover Speaker Service on port 8080...")
    uvicorn.run(app, host="0.0.0.0", port=8080)
