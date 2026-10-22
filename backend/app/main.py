import sys
from pathlib import Path
from contextlib import asynccontextmanager

# Ensure 'backend' directory is on sys.path regardless of working directory
backend_dir = str(Path(__file__).resolve().parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.core.database import EVIDENCE_DIR, init_database
from app.core.events import event_logger
from app.features.robot.client import robot_client

# Feature Routers
from app.features.robot.router import router as robot_router
from app.features.camera.router import router as camera_router
from app.features.lidar.router import router as lidar_router
from app.features.map.router import router as map_router
from app.features.recognition.router import router as recognition_router
from app.features.observations.router import router as observations_router
from app.features.registry.router import router as registry_router
from app.features.events.router import router as events_router
from app.features.emergency.router import router as emergency_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_database()
    event_logger.log(
        category="system",
        level="info",
        message=f"PIPER Rescue Dashboard Backend starting on port {settings.backend_port}."
    )
    yield
    await robot_client.close()
    event_logger.log(
        category="system",
        level="info",
        message="PIPER Rescue Dashboard Backend shutdown completed."
    )


app = FastAPI(
    title="PIPER Rescue Intelligence API",
    description="Emergency Response Operator Dashboard Backend for PIPER ROS 2 Rescue Robot",
    version="1.0.0",
    lifespan=lifespan,
)

# Configure CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve evidence images (photos, crops, avatars)
app.mount("/evidence", StaticFiles(directory=str(EVIDENCE_DIR)), name="evidence")


@app.get("/")
async def root():
    return {
        "service": "PIPER Rescue Intelligence Dashboard Backend",
        "status": "operational",
        "version": "1.0.0",
        "docs_url": "/docs",
        "robot_upstream": settings.piper_robot_api_url,
    }


# Include all modular feature routers
app.include_router(robot_router)
app.include_router(camera_router)
app.include_router(lidar_router)
app.include_router(map_router)
app.include_router(recognition_router)
app.include_router(observations_router)
app.include_router(registry_router)
app.include_router(events_router)
app.include_router(emergency_router)
