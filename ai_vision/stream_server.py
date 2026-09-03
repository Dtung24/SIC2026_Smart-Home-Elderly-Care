from pathlib import Path
import threading
import time

import cv2
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles


# ============================================================
# CẤU HÌNH
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
SNAPSHOT_DIR = BASE_DIR / "snapshots"
SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(
    title="ElderHome AI Vision Stream",
    version="1.0.0"
)

# Cho phép mở ảnh snapshot qua /snapshots/<ten_file>
app.mount(
    "/snapshots",
    StaticFiles(directory=str(SNAPSHOT_DIR)),
    name="snapshots"
)


# ============================================================
# FRAME AI MỚI NHẤT
# ============================================================

latest_stream_frame = None
frame_lock = threading.Lock()


def update_stream_frame(frame):
    """Nhận frame đã được YOLO xử lý từ fallandsnapshot.py."""
    global latest_stream_frame

    if frame is None:
        return

    with frame_lock:
        latest_stream_frame = frame


# ============================================================
# FASTAPI
# ============================================================

@app.get("/health")
def health():
    with frame_lock:
        stream_ready = latest_stream_frame is not None

    return {
        "status": "ok",
        "service": "ai_vision_stream",
        "stream_ready": stream_ready
    }


def generate_frames():
    # Stream web 10 FPS để giảm tải encode JPEG trên Raspberry Pi
    stream_fps = 10
    frame_interval = 1.0 / stream_fps

    while True:
        start_time = time.perf_counter()

        with frame_lock:
            frame = latest_stream_frame

        if frame is None:
            time.sleep(0.03)
            continue

        success, buffer = cv2.imencode(
            ".jpg",
            frame,
            [cv2.IMWRITE_JPEG_QUALITY, 80]
        )

        if not success:
            continue

        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n"
            + buffer.tobytes()
            + b"\r\n"
        )

        elapsed = time.perf_counter() - start_time
        sleep_time = frame_interval - elapsed

        if sleep_time > 0:
            time.sleep(sleep_time)


@app.get("/video_feed")
def video_feed():
    return StreamingResponse(
        generate_frames(),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


# ============================================================
# CHẠY FASTAPI Ở BACKGROUND
# ============================================================

def run_stream_server(host="0.0.0.0", port=8000):
    """Chạy Uvicorn để phát MJPEG song song với vòng lặp AI."""
    import uvicorn

    config = uvicorn.Config(
        app=app,
        host=host,
        port=port,
        log_level="info",
        access_log=False
    )

    uvicorn.Server(config).run()


def start_stream_server(host="0.0.0.0", port=8000):
    server_thread = threading.Thread(
        target=run_stream_server,
        kwargs={"host": host, "port": port},
        daemon=True
    )

    server_thread.start()
    print(f"[STREAM] FastAPI dang chay tai port {port}")

    return server_thread