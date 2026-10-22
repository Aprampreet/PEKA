import time
import uuid
from datetime import datetime, timezone
from typing import List, Literal
from pydantic import BaseModel


class ActivityEvent(BaseModel):
    id: str
    timestamp: str
    category: Literal["connection", "command", "camera", "system", "perception", "speaker"]
    level: Literal["info", "warning", "error", "success"]
    message: str
    is_simulated: bool = False


class EventLogger:
    def __init__(self, max_events: int = 100):
        self._events: List[ActivityEvent] = []
        self._max_events = max_events

        # Initialize with baseline server boot event
        self.log(
            category="system",
            level="info",
            message="PIPER Dashboard backend initialized. Operations monitor active.",
            is_simulated=False
        )

    def log(
        self,
        category: str,
        level: str,
        message: str,
        is_simulated: bool = False
    ) -> ActivityEvent:
        event = ActivityEvent(
            id=f"evt-{int(time.time()*1000)}-{uuid.uuid4().hex[:6]}",
            timestamp=datetime.now(timezone.utc).isoformat(),
            category=category,  # type: ignore
            level=level,        # type: ignore
            message=message,
            is_simulated=is_simulated
        )
        self._events.insert(0, event)
        if len(self._events) > self._max_events:
            self._events = self._events[:self._max_events]
        return event

    def get_events(self, limit: int = 50) -> List[ActivityEvent]:
        return self._events[:limit]


event_logger = EventLogger()
