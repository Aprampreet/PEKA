import math
from typing import Dict, Any, List, Optional
from app.features.map.schemas import MapDataResponse, MapMetadata, SimulatedRobotPose


class MapAdapter:
    """
    Adapter boundary for robot occupancy grid and spatial localization.
    Directly interfaces with upstream RTAB-Map ROS 2 /map topic via GET /api/map/occupancy-grid.
    If upstream has not received a map yet (503) or is offline, provides a graceful fallback.
    """

    def __init__(self):
        self._cached_demo_map: List[List[int]] = self._generate_deterministic_grid()
        self._last_live_grid: Optional[List[List[int]]] = None
        self._last_live_metadata: Optional[MapMetadata] = None
        self._last_live_contract: Optional[Dict[str, Any]] = None
        self._robot_x: float = 0.0
        self._robot_y: float = 0.0
        self._robot_yaw: float = 45.0

    def update_teleop_pose(self, linear_x: float, angular_z: float, dt: float = 0.2):
        # Update yaw angle
        self._robot_yaw = (self._robot_yaw + (angular_z * 180.0 / math.pi) * dt) % 360.0
        # Update translation along heading
        rad = math.radians(self._robot_yaw)
        self._robot_x += linear_x * math.cos(rad) * dt
        self._robot_y += linear_x * math.sin(rad) * dt

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
        for dy in range(-1, 2):
            for dx in range(-1, 2):
                grid[16 + dy][14 + dx] = 100
        for dy in range(-1, 2):
            for dx in range(-2, 2):
                grid[34 + dy][32 + dx] = 100

        return grid

    async def get_map_data(self) -> MapDataResponse:
        from app.features.robot.client import robot_client

        # 1. Fetch live RTAB-Map grid and robot position from upstream
        upstream_grid = await robot_client.get_occupancy_grid()
        upstream_pos = await robot_client.get_robot_position()

        # Update robot pose from real odometry if available
        is_live_pose = False
        if upstream_pos and isinstance(upstream_pos, dict):
            curr = upstream_pos.get("current_position") or {}
            pos = curr.get("position") or {}
            orient = curr.get("orientation") or {}
            if "x" in pos and "y" in pos:
                self._robot_x = float(pos["x"])
                self._robot_y = float(pos["y"])
                is_live_pose = True

                # Compute yaw from orientation quaternion
                z = float(orient.get("z", 0.0))
                w = float(orient.get("w", 1.0))
                x = float(orient.get("x", 0.0))
                y = float(orient.get("y", 0.0))
                siny_cosp = 2.0 * (w * z + x * y)
                cosy_cosp = 1.0 - 2.0 * (y * y + z * z)
                yaw_rad = math.atan2(siny_cosp, cosy_cosp)
                self._robot_yaw = math.degrees(yaw_rad)

        # 2. If live RTAB-Map 2D grid received, adapt and cache it
        if upstream_grid and isinstance(upstream_grid, dict) and "data" in upstream_grid:
            grid_data = upstream_grid["data"]
            res = float(upstream_grid.get("resolution", 0.05))
            width = int(upstream_grid.get("width", len(grid_data[0]) if grid_data else 50))
            height = int(upstream_grid.get("height", len(grid_data)))
            origin_pos = upstream_grid.get("origin", {}).get("position", {})
            origin_x = float(origin_pos.get("x", 0.0))
            origin_y = float(origin_pos.get("y", 0.0))
            frame_id = str(upstream_grid.get("frame_id", "map"))
            seq = upstream_grid.get("sequence", 0)
            age = round(float(upstream_grid.get("received_age_seconds", 0.0)), 2)

            meta = MapMetadata(
                frame_id=frame_id,
                coordinate_system="ros2_rtabmap_occupancy_grid",
                resolution=res,
                width=width,
                height=height,
                origin_x=origin_x,
                origin_y=origin_y,
                status_badge="LIVE RTAB-MAP /map",
                is_simulated=False,
            )
            contract = {
                "target_ros2_message": "nav_msgs/msg/OccupancyGrid",
                "topic": upstream_grid.get("topic", "/map"),
                "frame_id": frame_id,
                "sequence": seq,
                "received_age_seconds": age,
                "resolution_m_per_cell": res,
                "grid_dimensions": f"{width}x{height}",
                "status_note": f"Live RTAB-Map ROS 2 Occupancy Grid synced ({age}s ago, seq #{seq}).",
            }

            self._last_live_grid = grid_data
            self._last_live_metadata = meta
            self._last_live_contract = contract

            return MapDataResponse(
                status_badge="LIVE RTAB-MAP /map",
                source="live_rtabmap_ros2",
                metadata=meta,
                grid=grid_data,
                simulated_robot_pose=SimulatedRobotPose(
                    x=round(self._robot_x, 2),
                    y=round(self._robot_y, 2),
                    yaw_deg=round(self._robot_yaw, 1),
                    is_simulated=not is_live_pose,
                    notice="Live odometry pose from ROS 2." if is_live_pose else "Pose updated via active teleoperation.",
                ),
                contract_docs=contract,
            )

        # 3. If live grid previously received, serve cached live grid
        if self._last_live_grid and self._last_live_metadata and self._last_live_contract:
            return MapDataResponse(
                status_badge="LIVE RTAB-MAP (CACHED)",
                source="live_rtabmap_cached",
                metadata=self._last_live_metadata,
                grid=self._last_live_grid,
                simulated_robot_pose=SimulatedRobotPose(
                    x=round(self._robot_x, 2),
                    y=round(self._robot_y, 2),
                    yaw_deg=round(self._robot_yaw, 1),
                    is_simulated=not is_live_pose,
                    notice="Live odometry pose from ROS 2." if is_live_pose else "Pose updated via active teleoperation.",
                ),
                contract_docs=self._last_live_contract,
            )

        # 4. Fallback to sample rescue room grid while waiting for ROS 2 /map topic
        return MapDataResponse(
            status_badge="AWAITING RTAB-MAP /map",
            source="simulated_local_occupancy_grid",
            metadata=MapMetadata(
                frame_id="map",
                coordinate_system="local_metric_occupancy_grid",
                resolution=0.05,
                width=50,
                height=50,
                origin_x=-1.25,
                origin_y=-1.25,
                status_badge="AWAITING RTAB-MAP /map",
                is_simulated=True,
            ),
            grid=self._cached_demo_map,
            simulated_robot_pose=SimulatedRobotPose(
                x=round(self._robot_x, 2),
                y=round(self._robot_y, 2),
                yaw_deg=round(self._robot_yaw, 1),
                is_simulated=True,
                notice="Simulated coordinates with active teleop tracking.",
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
                    "100": "Definite obstacle / wall / rubble",
                },
                "status_note": "Awaiting occupancy grid message on /map topic from RTAB-Map SLAM node.",
            },
        )


map_adapter = MapAdapter()
