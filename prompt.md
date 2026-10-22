# Antigravity Project Instructions --- PIPER Rescue Intelligence

## Your role

Act as a senior full-stack engineer, product designer, and robotics
integration engineer. Build a polished, hackathon-ready
disaster-response robot dashboard called **PIPER Rescue Intelligence**.

The workspace already contains two projects:

-   `frontend/` --- a Next.js application
-   `backend/` --- a FastAPI application

**Inspect both projects before changing anything.** Preserve their
existing setup and conventions where possible. Do not replace working
code or scaffold a second application over the existing projects.

The goal is to create a reliable operator dashboard for a ROS 2 rescue
robot, integrate the camera/status/command APIs that already exist, and
prepare clean integration points for a map and a future external
facial-recognition service.

------------------------------------------------------------------------

## Product goal

Create an operations dashboard that helps a human operator understand
the robot's current state, view its live camera feed, see its location
on a map, review future recognition results, and access mission
controls.

The product should feel like a real emergency-response operations tool:
clear hierarchy, excellent readability, calm but purposeful visual
design, responsive layouts, meaningful status indicators, and restrained
animation. Avoid generic "AI-generated dashboard" styling, excessive
gradients, unnecessary glassmorphism, and decorative cards that do not
communicate useful information.

Do not sacrifice operational clarity for visual effects.

## Known existing robot API

A separate developer has created a FastAPI service that connects to ROS
2. Its source documentation describes these routes:

  ---------------------------------------------------------------------------------------------------------
  Method                  Path                    Known behavior
  ----------------------- ----------------------- ---------------------------------------------------------
  `GET`                   `/`                     Returns `{"robot": "Piper", "api_status": "running"}`.
                                                  This does not prove the robot or camera is healthy.

  `GET`                   `/api/robot/status`     Returns a cached status object with `state` and
                                                  `message`. Initially it may return
                                                  `{"state": "unknown", "message": "Waiting for ROS 2"}`.
                                                  The state may remain stale if ROS stops publishing.

  `POST`                  `/api/robot/command`    Accepts `{"command": "start_patrol"}`,
                                                  `{"command": "pause_patrol"}`, or
                                                  `{"command": "return_to_base"}`. It confirms publication
                                                  to ROS, not command execution.

  `GET`                   `/api/camera/stream`    Returns a continuous MJPEG-over-HTTP stream using
                                                  `multipart/x-mixed-replace`, sourced from ROS topic
                                                  `/oak/rgb/image_raw`. Frames are resized to a maximum
                                                  width of 640 pixels and encoded as JPEG quality 75. The
                                                  stream may repeat a cached frame if the camera stops.
  ---------------------------------------------------------------------------------------------------------

The API documentation reports that these are the only four
project-defined HTTP routes currently found. It does **not** provide
map/occupancy-grid, robot pose, LiDAR, battery, structured sensor
telemetry, facial-recognition, or WebRTC endpoints. Runtime behavior of
the existing routes was not verified when the documentation was written.

Treat this API as an external dependency. Do not rewrite or duplicate
its ROS bridge. Do not invent undocumented routes or response fields.

### Configure the external robot API

Use environment variables. Add a documented variable in the appropriate
local environment example, such as:

-   `PIPER_ROBOT_API_URL` for the backend's connection to the existing
    robot API.
-   A separate `NEXT_PUBLIC_...` variable only if the browser genuinely
    needs to connect directly to an external API.

Prefer having the Next.js frontend call our own FastAPI backend, and
have our backend communicate with the robot API. This provides a cleaner
boundary for secrets, future authentication, and integration logic. The
MJPEG stream may need a carefully implemented streaming proxy through
our backend or a same-origin reverse proxy; do not buffer the entire
stream into memory or try to parse it as JSON.

Do not expose the existing unauthenticated robot API publicly. For local
development, use a trusted LAN and clearly document host/port
configuration. Add appropriate timeouts and error handling to ordinary
HTTP requests. For the streaming route, use streaming responses and
clean up upstream connections when clients disconnect.

------------------------------------------------------------------------

## Main dashboard requirements

Build a cohesive, responsive operator dashboard with the following
areas.

### 1. Overview / command center

Show a primary operations screen containing:

-   Robot connectivity and status, using only the actual status API
    data.
-   A prominent live camera panel.
-   A map panel for the robot's operating area.
-   Mission/command controls for the three documented commands.
-   A future recognition-events panel, initially empty or explicitly in
    demo mode.
-   A compact activity/event feed for real events the app actually
    receives.
-   Clear loading, unavailable, disconnected, and stale-data states.
-   A visible distinction between real data, mock/demo data, and
    features not yet connected.

Never display fake values as real robot telemetry. Do not invent battery
percentages, coordinates, speed, pose, LiDAR values, victim counts, or
confidence scores.

### 2. Live camera

Integrate the existing MJPEG endpoint.

Requirements:

-   Display the feed using an `<img>` element where appropriate, or
    through a streaming proxy that preserves the multipart response.
-   Show a loading state and a useful unavailable/error state.
-   Provide a reconnect/retry action where appropriate.
-   Avoid claiming the feed is live solely because an HTTP connection
    remains open; the source API may repeat cached frames.
-   Keep the camera panel usable at different viewport sizes.
-   Do not implement WebRTC unless explicitly requested later. The
    existing API uses MJPEG, not WebRTC.

### 3. Map

Create a useful map area suitable for a local robot occupancy grid.
Prefer a map renderer that supports local coordinates rather than
assuming the robot is moving on a geographic latitude/longitude map.

However, the existing robot API has **no map or pose endpoint**.
Therefore:

-   First inspect the workspace and identify whether a map source or
    map-related ROS integration already exists in the current projects.
-   Do not pretend that the existing FastAPI API supplies `/map`,
    `/pose`, `/odom`, or other undocumented data.
-   If real map/pose data is not available, create a well-designed map
    panel with a clearly visible `DEMO DATA` or `NOT CONNECTED` label
    and a deterministic sample map only for UI development.
-   Keep the map data source behind a small adapter/interface so a
    future occupancy-grid endpoint or WebSocket can be integrated
    without rewriting the map UI.
-   Define the expected future map contract in documentation, including
    occupancy-grid dimensions, resolution, origin, coordinate frame,
    occupancy values, robot pose, and timestamp/freshness metadata.
-   Do not show a fabricated robot location on a live map. If demo
    coordinates are used, keep them visibly marked as simulated.
-   Do not implement navigation or path planning in this dashboard.

### 4. Robot commands

Provide controls for the three commands supported by the existing robot
API:

-   `start_patrol`
-   `pause_patrol`
-   `return_to_base`

Requirements:

-   Require a clear user action and provide confirmation for
    consequential commands.
-   Show pending, accepted/published, failed, and unknown outcomes
    accurately.
-   Explain in the UI or documentation that API success means the
    command was published to ROS, not that execution was confirmed.
-   Do not automatically retry side-effecting commands.
-   Never represent a software pause or command button as a replacement
    for a physical emergency stop. Do not add a fake emergency-stop
    control.
-   Do not send any command in demo mode unless the user explicitly
    switches to a configured live environment.

### 5. Future facial-recognition / external recognition service

An independent service will be developed later. Do not implement facial
recognition or biometric matching in this task.

Instead, create a clean integration boundary and a dashboard panel that
can later display events from the external service. Until it exists:

-   Mark the integration as `NOT CONNECTED` or `DEMO DATA`.
-   Do not invent an endpoint or assume the external service's protocol.
-   Do not display real identities, names, or matches based on mock
    data.
-   Design the future event model to support, subject to confirmation
    from the service owner: event ID, timestamp, camera/source, image or
    evidence reference, status, confidence if provided, and operator
    review state.
-   Treat any recognition result as an unverified candidate requiring
    human review, not as proof of a person's identity or victim status.
-   Include confirm/reject/review actions only if they are clearly
    marked as local demo interactions until a real service contract
    exists.
-   Prefer data minimization and access controls for any future
    biometric/evidence data. Do not store face templates or biometric
    identifiers in this task.

Document the information needed from the external-service developer
before integration: API contract, transport, authentication, event
schema, image/evidence delivery, confidence semantics, retention, and
error behavior.

### 6. Activity and event history

Create an activity feed for actual events that the application can
observe, such as API connectivity changes, command requests/responses,
and camera connection errors. Do not fabricate mission events or
recognition detections. Clearly mark seeded development examples as
simulated.

------------------------------------------------------------------------

## Technical architecture

### Frontend --- Next.js

-   Use the existing Next.js project and its current router/conventions.
-   Use TypeScript if the project is already configured for it; do not
    downgrade it.
-   Build reusable components for the camera, map, robot status, command
    controls, and recognition events.
-   Keep API access in a small typed client/service layer rather than
    scattering `fetch()` calls through components.
-   Use a consistent design system with accessible contrast, visible
    focus states, keyboard navigation, and responsive layouts.
-   Avoid adding large dependencies unless they solve a real need.
-   If using a map library, select one appropriate for local
    occupancy-grid coordinates and document why.

### Backend --- FastAPI

-   Use the existing FastAPI project. Inspect its structure and current
    conventions first.
-   Keep the dashboard backend separate from the friend's existing robot
    API service.
-   Create a typed integration client for the external robot API.
-   Add only the routes needed by the dashboard, and document them.
-   Suggested dashboard-backend responsibilities:
    -   Fetch and normalize robot status without inventing extra fields.
    -   Send allowlisted commands to the robot API.
    -   Proxy the MJPEG stream only if necessary for the chosen
        browser/network architecture.
    -   Expose explicit readiness/connection information for the
        dashboard.
    -   Provide a future integration adapter/interface for map and
        external recognition events without pretending those data
        sources already exist.
-   Keep network calls out of route handlers where practical by using a
    dedicated service/client module.
-   Handle upstream timeouts, connection errors, invalid responses, and
    client disconnects.
-   Do not open a new robot API connection on every UI render. Reuse
    suitable HTTP clients and manage their lifecycle correctly.
-   Do not claim that the dashboard backend can directly access ROS
    topics unless the project explicitly implements that connection.

### Environment and configuration

-   Provide `.env.example` files with placeholders, never real secrets.
-   Keep local environment files out of version control.
-   Document frontend and backend ports, startup commands, and the
    external robot API URL.
-   Keep development and live modes clearly separated.

------------------------------------------------------------------------

## Implementation workflow --- follow in order

### Stage 1: Inspect and plan

1.  Inspect the current root, `frontend/`, and `backend/` directories.
2.  Identify the installed frameworks, versions, routing setup, styles,
    and existing code.
3.  Inspect available environment files without exposing secrets.
4.  Produce a concise implementation plan and list any important
    unknowns.
5.  Do not overwrite or regenerate existing projects.

### Stage 2: Build the dashboard shell

1.  Create the overall layout, navigation, responsive command-center
    screen, camera panel, map panel, status panel, and recognition
    placeholder.
2.  Use deterministic mock data only for visual development.
3.  Label every simulated element.
4.  Ensure the app runs before continuing.

### Stage 3: Integrate the existing robot API

1.  Implement the typed client in the dashboard FastAPI backend.
2.  Integrate `GET /`, `GET /api/robot/status`, and
    `POST /api/robot/command`.
3.  Integrate the MJPEG stream with appropriate streaming behavior.
4.  Configure the upstream URL using environment variables.
5.  Test with a reachable service where available; otherwise use an
    explicit mock adapter and document that live integration is
    unverified.
6.  Do not claim end-to-end functionality without testing it.

### Stage 4: Map integration boundary

1.  Search the current workspace for a real map and pose source.
2.  If none exists, keep the map in demo/not-connected mode.
3.  Define and document a typed future map interface.
4.  Do not add fabricated live robot pose or map API endpoints.

### Stage 5: Recognition integration boundary

1.  Build a placeholder UI and typed adapter interface for future
    external recognition events.
2.  Keep the integration disconnected until the external API contract is
    supplied.
3.  Do not implement face recognition or fabricate identities.

### Stage 6: Reliability, tests, and documentation

1.  Add useful tests for the API client, command allowlist, upstream
    errors, and UI states.
2.  Verify loading, disconnected, unavailable, and demo states.
3.  Run frontend lint/type checks and backend tests available in the
    repository.
4.  Fix regressions introduced by the changes.
5.  Document environment variables, run commands, actual API routes,
    test results, and known limitations.

After each stage, report: - Files created or changed. - Commands/tests
run and their actual outcomes. - How to start and verify the feature. -
Remaining blockers and unverified behavior.

Do not silently skip failing checks.

------------------------------------------------------------------------

## Quality and safety rules

-   Inspect before editing.
-   Do not rewrite the friend's robot API or ROS integration.
-   Do not invent endpoints, telemetry, map data, recognition results,
    or successful tests.
-   Clearly distinguish `LIVE`, `DEMO DATA`, `NOT CONNECTED`, and
    `STALE` where applicable.
-   Do not expose an unauthenticated robot-control API to the public
    internet.
-   Do not put secrets in frontend code or `NEXT_PUBLIC_` variables.
-   Do not automatically retry robot commands.
-   Keep human operators in the decision loop for recognition events.
-   Prefer a reliable, coherent vertical slice over many unfinished
    features.
-   Keep the design polished and realistic for a disaster-response
    operations centre.

## Start now

Begin with **Stage 1: inspect the existing `frontend/` and `backend/`
projects**, summarize what is already there, and propose the first
implementation steps. Do not build the entire application in one pass.
