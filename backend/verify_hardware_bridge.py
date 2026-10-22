"""
PIPER Rescue Intelligence - Hardware Bridge Liveness & Bitrate Verification
Run this on the machine hosting the ROS 2 bridge / Cloudflare tunnel.
"""
import sys
import os
import time
import json
import struct
import asyncio
import httpx
import websockets

# Target URL (Localhost bridge or public Cloudflare tunnel)
TARGET_URL = os.environ.get("TARGET_URL", sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080")
WS_TARGET_URL = TARGET_URL.replace("http://", "ws://").replace("https://", "wss://")

async def test_rest_endpoints():
    print("\n--- 1. REST ENDPOINTS POLLING AUDIT ---")
    async with httpx.AsyncClient(timeout=4.0) as client:
        # Probe GET /
        t0 = time.perf_counter()
        try:
            r = await client.get(f"{TARGET_URL}/")
            latency = (time.perf_counter() - t0) * 1000
            print(f"[OK] GET / -> HTTP {r.status_code} in {latency:.1f}ms | Payload: {len(r.content)} bytes")
            print(f"     Data: {r.text[:100]}")
        except Exception as e:
            print(f"[FAIL] GET / unreachable: {e}")

        # Probe GET /api/robot/status
        t0 = time.perf_counter()
        try:
            r = await client.get(f"{TARGET_URL}/api/robot/status")
            latency = (time.perf_counter() - t0) * 1000
            print(f"[OK] GET /api/robot/status -> HTTP {r.status_code} in {latency:.1f}ms | Payload: {len(r.content)} bytes")
            print(f"     Status: {r.text[:120]}")
        except Exception as e:
            print(f"[FAIL] GET /api/robot/status unreachable: {e}")

        # Probe GET /api/lidar/status
        t0 = time.perf_counter()
        try:
            r = await client.get(f"{TARGET_URL}/api/lidar/status")
            latency = (time.perf_counter() - t0) * 1000
            print(f"[OK] GET /api/lidar/status -> HTTP {r.status_code} in {latency:.1f}ms | Payload: {len(r.content)} bytes")
            print(f"     Status: {r.text[:120]}")
        except Exception as e:
            print(f"[FAIL] GET /api/lidar/status unreachable: {e}")

        # Probe GET /api/map/data
        t0 = time.perf_counter()
        try:
            r = await client.get(f"{TARGET_URL}/api/map/data")
            latency = (time.perf_counter() - t0) * 1000
            print(f"[OK] GET /api/map/data -> HTTP {r.status_code} in {latency:.1f}ms | Payload: {len(r.content)} bytes")
        except Exception as e:
            print(f"[FAIL] GET /api/map/data unreachable: {e}")

async def test_camera_mjpeg_stream():
    print("\n--- 2. CAMERA MJPEG REAL-TIME STREAM AUDIT ---")
    stream_url = f"{TARGET_URL}/api/camera/stream"
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            t0 = time.perf_counter()
            async with client.stream("GET", stream_url) as response:
                print(f"[OK] Connected to Camera Stream (HTTP {response.status_code})")
                total_bytes = 0
                frames = 0
                buffer = bytearray()
                
                async for chunk in response.aiter_raw():
                    total_bytes += len(chunk)
                    buffer.extend(chunk)
                    while True:
                        start = buffer.find(b"\xff\xd8")
                        if start == -1:
                            buffer.clear()
                            break
                        end = buffer.find(b"\xff\xd9", start + 2)
                        if end == -1:
                            break
                        frames += 1
                        buffer = buffer[end + 2:]
                    
                    elapsed = time.perf_counter() - t0
                    if elapsed >= 3.0:
                        break
                fps = frames / max(0.001, elapsed)
                kbps = (total_bytes * 8 / 1000) / max(0.001, elapsed)
                print(f"     Result: REAL-TIME STREAMING")
                print(f"     Measured FPS: {fps:.1f} frames/sec")
                print(f"     Measured Bitrate: {kbps:.1f} Kbps ({total_bytes / 1024 / max(0.001, elapsed):.1f} KB/s)")
    except Exception as e:
        print(f"[FAIL] Camera stream test error: {e}")

async def test_lidar_websocket_stream():
    print("\n--- 3. LIDAR 3D POINT-LIO REAL-TIME WEBSOCKET AUDIT ---")
    ws_url = f"{WS_TARGET_URL}/ws/lidar"
    try:
        async with websockets.connect(ws_url, open_timeout=4.0) as ws:
            print(f"[OK] Connected to LiDAR WebSocket: {ws_url}")
            t0 = time.perf_counter()
            packets = 0
            total_bytes = 0
            total_points = 0
            while True:
                data = await ws.recv()
                if isinstance(data, bytes) and len(data) > 4:
                    packets += 1
                    total_bytes += len(data)
                    meta_len = struct.unpack("!I", data[:4])[0]
                    if len(data) >= 4 + meta_len:
                        meta = json.loads(data[4:4 + meta_len].decode("utf-8"))
                        pts_count = meta.get("point_count", 0)
                        total_points += pts_count
                elapsed = time.perf_counter() - t0
                if elapsed >= 3.0:
                    break
            hz = packets / max(0.001, elapsed)
            kbps = (total_bytes * 8 / 1000) / max(0.001, elapsed)
            avg_pts = total_points / max(1, packets)
            print(f"     Result: REAL-TIME PUSH STREAMING")
            print(f"     Measured Frequency: {hz:.1f} Hz")
            print(f"     Average Points/Frame: {avg_pts:.0f} pts")
            print(f"     Measured Bitrate: {kbps:.1f} Kbps ({total_bytes / 1024 / max(0.001, elapsed):.1f} KB/s)")
    except Exception as e:
        print(f"[FAIL] LiDAR WebSocket stream error: {e}")

async def main():
    print("=" * 60)
    print("PIPER ROBOT HARDWARE BRIDGE HANDOFF VERIFICATION")
    print(f"Targeting Bridge: {TARGET_URL}")
    print("=" * 60)
    await test_rest_endpoints()
    await test_camera_mjpeg_stream()
    await test_lidar_websocket_stream()
    print("\n[COMPLETE] Handoff audit finished.\n")

if __name__ == "__main__":
    asyncio.run(main())
