from typing import Dict, Any, List
from app.features.map.schemas import MapDataResponse, MapMetadata, SimulatedRobotPose


class MapAdapter:
    """
    Adapter boundary for robot occupancy grid and spatial localization.
    Currently, the existing Robot API provides NO map or pose endpoints.
    This adapter serves a deterministic sample grid clearly marked as DEMO DATA
    and documents the exact ROS 2 contract needed for future integration.
    """

    def __init__(self):
        self._cached_demo_map: List[List[int]] = self._generate_deterministic_grid()

    def _generate_deterministic_grid(self) -> List[List[int]]:
        """
        Creates a 50x50 deterministic grid representing a local search & rescue room:
        -1: Unmapped area outside perimeter
        0: Free navigable floor
        100: Obstacle, debris, or perimeter wall
        """
        width, height = 50, 50
        grid: List[List[int]] = [[-1 for _ in range(width)] for _ in range(height)]

        # Carve out a 36x36 room in the center (from 7 to 43)
        for y in range(7, 43):
            for x in range(7, 43):
                # Outer perimeter wall with 2 doorway openings
                is_top_or_bottom_wall = (y == 7 or y == 42) and not (22 <= x <= 26)
                is_left_or_right_wall = (x == 7 or x == 42) and not (22 <= y <= 26)

                if is_top_or_bottom_wall or is_left_or_right_wall:
                    grid[y][x] = 100  # Wall
                else:
                    grid[y][x] = 0    # Free space

        # Internal partition wall (x=25, y=14..32) with a breach/doorway at y=23..25
        for y in range(14, 33):
            if not (22 <= y <= 25):
                grid[y][25] = 100

        # Deterministic debris / rubble piles
        # Rubble cluster 1
        for dy in range(-1, 2):
            for dx in range(-1, 2):
                grid[16 + dy][14 + dx] = 100
        # Rubble cluster 2
        for dy in range(-1, 2):
            for dx in range(-2, 2):
                grid[34 + dy][32 + dx] = 100

        return grid

    def get_map_data(self) -> MapDataResponse:
        return MapDataResponse(
            status_badge="DEMO DATA - NOT CONNECTED",
            source="simulated_local_occupancy_grid",
            metadata=MapMetadata(
                frame_id="map",
                coordinate_system="local_metric_occupancy_grid",
                resolution=0.05,  # 5cm per cell
                width=50,
                height=50,
                origin_x=-1.25,
                origin_y=-1.25,
                status_badge="DEMO DATA - NOT CONNECTED",
                is_simulated=True
            ),
            grid=self._cached_demo_map,
            simulated_robot_pose=SimulatedRobotPose(
                x=0.0,
                y=0.0,
                yaw_deg=45.0,
                is_simulated=True,
                notice="Simulated coordinates for UI development only. Real robot API provides no pose endpoint."
            ),
            contract_docs={
                "target_ros2_message": "nav_msgs/msg/OccupancyGrid",
                "recommended_topic": "/map",
                "target_pose_source": "geometry_msgs/msg/PoseWithCovarianceStamped or tf2 (map -> base_link)",
                "coordinate_frame": "REP-103/REP-105 standard: X forward (red), Y left (green), Z up (blue)",
                "occupancy_semantics": {
                    "-1": "Unknown / unmapped space",
                    "0": "Completely free space (probability 0%)",
                    "1-99": "Probability of obstacle",
                    "100": "Definite obstacle / wall / rubble"
                },
                "status_note": (
                    "No map endpoint exists on upstream robot FastAPI service. "
                    "When upstream implements GET /api/map or WebSocket /ws/map, "
                    "MapAdapter.get_map_data() will stream genuine ROS 2 occupancy grid slices."
                )
            }
        )


map_adapter = MapAdapter()
