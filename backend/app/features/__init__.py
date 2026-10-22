from app.features.robot.router import router as robot_router
from app.features.camera.router import router as camera_router
from app.features.lidar.router import router as lidar_router
from app.features.map.router import router as map_router
from app.features.recognition.router import router as recognition_router
from app.features.observations.router import router as observations_router
from app.features.registry.router import router as registry_router
from app.features.events.router import router as events_router
from app.features.speaker.router import router as speaker_router

__all__ = [
    "robot_router",
    "camera_router",
    "lidar_router",
    "map_router",
    "recognition_router",
    "observations_router",
    "registry_router",
    "events_router",
    "speaker_router",
]
