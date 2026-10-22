from fastapi import APIRouter, Body
from app.features.speaker.schemas import (
    BroadcastRequest,
    BroadcastResponse,
    AIGenerateRequest,
    AIGenerateResponse,
    SpeakerStatusResponse,
)
from app.features.speaker.service import speaker_service

router = APIRouter(prefix="/api/speaker", tags=["Rover Speaker & AI Voice Broadcast"])


@router.get("/status", response_model=SpeakerStatusResponse)
async def get_speaker_status():
    """Returns speaker connectivity, cooldown remaining, and last broadcast details."""
    return speaker_service.get_status()


@router.post("/broadcast", response_model=BroadcastResponse)
async def broadcast_message(request: BroadcastRequest):
    """
    Broadcasts voice message to physical rover speaker (POST /api/speaker/play-audio)
    and plays on operator laptop speaker.
    """
    result = speaker_service.broadcast_audio(
        text=request.text,
        language=request.language,
        play_local=request.play_local,
        send_rover=request.send_rover,
    )
    return result


@router.post("/ai-generate", response_model=AIGenerateResponse)
async def generate_ai_reassurance(request: AIGenerateRequest):
    """
    Generates a personalized, tactical rescue reassurance announcement
    using AI based on survivor identity, distance, and sector.
    """
    message = speaker_service.generate_ai_reassurance(
        person_name=request.person_name,
        distance_m=request.distance_m,
        sector=request.sector or "Sector 3",
        language=request.language or "en",
    )
    context_desc = (
        f"Subject: {request.person_name or 'Unregistered'}, "
        f"Distance: ~{request.distance_m}m, Sector: {request.sector}"
        if request.distance_m else f"General survivor alert in {request.sector}"
    )
    return AIGenerateResponse(
        generated_text=message,
        language=request.language,
        context_summary=context_desc,
    )


@router.post("/toggle-auto")
async def toggle_auto_broadcast(enabled: bool = Body(..., embed=True)):
    """Toggles automated survivor reassurance when a face is detected in live camera feed."""
    speaker_service.set_auto_broadcast_enabled(enabled)
    return {"auto_broadcast_enabled": speaker_service.auto_broadcast_enabled}


@router.get("/sample-rover-script")
async def get_sample_rover_script():
    """Returns a ready-to-deploy 20-line Python HTTP speaker service for the robot."""
    script_content = '''# rover_speaker_service.py (Run this on Raspberry Pi / Jetson on the Rover)
from fastapi import FastAPI, UploadFile, File
import subprocess, uvicorn

app = FastAPI(title="Rover Speaker Subsystem")

@app.post("/api/speaker/play-audio")
async def play_audio(file: UploadFile = File(...)):
    """Receives 16-bit PCM WAV from PEKA and plays through physical rover speaker."""
    audio_path = "/tmp/rover_speech.wav"
    with open(audio_path, "wb") as f:
        f.write(await file.read())
    
    # Play through default sound card via ALSA aplay
    subprocess.run(["aplay", "-D", "default", audio_path])
    return {"status": "played", "filename": file.filename}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
'''
    return {"script": script_content, "filename": "rover_speaker_service.py"}
