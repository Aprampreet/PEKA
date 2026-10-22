#!/usr/bin/env bash
set -e

# PIPER Rescue Intelligence - Unified Service Runner
# Starts both Backend (FastAPI :8000) and Frontend (Next.js :3000)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

# Cleanup on exit
cleanup() {
    echo ""
    echo "[PIPER Runner] Stopping background services..."
    if [ -n "$BACKEND_PID" ]; then
        kill "$BACKEND_PID" 2>/dev/null || true
    fi
    if [ -n "$FRONTEND_PID" ]; then
        kill "$FRONTEND_PID" 2>/dev/null || true
    fi
    wait 2>/dev/null || true
    echo "[PIPER Runner] All services stopped."
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# 1. Ensure backend virtual environment
if [ ! -d "$BACKEND_DIR/.venv" ]; then
    echo "[PIPER Runner] Initializing backend virtualenv..."
    cd "$BACKEND_DIR"
    uv venv .venv
    uv pip install -r requirements.txt websockets
fi

# 2. Start Backend Service
echo "[PIPER Runner] Starting FastAPI backend on http://0.0.0.0:8000..."
cd "$BACKEND_DIR"
"$BACKEND_DIR/.venv/bin/python" main.py &
BACKEND_PID=$!

# Wait briefly for backend port to open
sleep 1.5

# 3. Start Frontend Service
echo "[PIPER Runner] Starting Next.js frontend on http://localhost:3000..."
cd "$FRONTEND_DIR"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "=========================================================="
echo " PIPER Rescue Intelligence Platform Active"
echo "  - Frontend: http://localhost:3000"
echo "  - Backend:  http://localhost:8000"
echo "  - Upstream: https://mail-listings-protecting-urls.trycloudflare.com"
echo "=========================================================="
echo "Press CTRL+C to terminate both services."
echo ""

# Wait for child processes
wait "$BACKEND_PID" "$FRONTEND_PID"
