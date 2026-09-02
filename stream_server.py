from fastapi import FastAPI
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from pathlib import Path
import threading
import time
import cv2


# ============================================================
# 1. ĐƯỜNG DẪN PROJECT
# ============================================================

# Thư mục chứa file stream_server.py
BASE_DIR = Path(__file__).resolve().parent

# Thư mục chứa ảnh té ngã
SNAPSHOT_DIR = BASE_DIR / "snapshots"

# Nếu chưa có thư mục snapshots thì tự tạo
SNAPSHOT_DIR.mkdir(
    parents=True,
    exist_ok=True
)


# ============================================================
# 2. TẠO FASTAPI
# ============================================================

app = FastAPI(
    title="ElderHome AI Vision Stream",
    version="1.0.0"
)


# Cho phép truy cập ảnh:
#
# http://IP:8000/snapshots/fall_xxx.jpg
#
app.mount(
    "/snapshots",
    StaticFiles(directory=str(SNAPSHOT_DIR)),
    name="snapshots"
)


# ============================================================
# 3. FRAME AI MỚI NHẤT
# ============================================================

# FastAPI KHÔNG mở camera riêng.
#
# fallandsnapshot.py sẽ gửi annotated_frame
# sang biến này.
#
latest_stream_frame = None

frame_lock = threading.Lock()


def update_stream_frame(frame):
    """
    Nhận frame đã được YOLO xử lý từ fallandsnapshot.py.

    Frame này có thể chứa:
    - skeleton
    - bounding box
    - FPS
    - inference time
    - NORMAL
    - FALL CANDIDATE
    - FALL DETECTED
    """

    global latest_stream_frame

    if frame is None:
        return

    with frame_lock:

        # Không cần copy ảnh ở đây.
        #
        # annotated_frame của YOLO được tạo mới
        # ở mỗi vòng lặp nên ta chỉ giữ reference
        # của frame mới nhất.
        latest_stream_frame = frame


# ============================================================
# 4. HEALTH CHECK
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


# ============================================================
# 5. TẠO MJPEG STREAM
# ============================================================

def generate_frames():

    # Web dashboard không nhất thiết phải nhận 30 FPS.
    #
    # 10 FPS đủ mượt để giám sát,
    # đồng thời giảm tải JPEG encoding cho Raspberry Pi.
    stream_fps = 10

    frame_interval = 1.0 / stream_fps

    while True:

        start_time = time.perf_counter()

        # ---------------------------------------------
        # Lấy annotated frame mới nhất
        # ---------------------------------------------

        with frame_lock:
            frame = latest_stream_frame

        if frame is None:

            # AI chưa tạo được frame
            time.sleep(0.03)
            continue

        # ---------------------------------------------
        # Chuyển OpenCV frame thành JPEG
        # ---------------------------------------------

        success, buffer = cv2.imencode(
            ".jpg",
            frame,
            [
                cv2.IMWRITE_JPEG_QUALITY,
                80
            ]
        )

        if not success:
            continue

        frame_bytes = buffer.tobytes()

        # ---------------------------------------------
        # Gửi theo chuẩn MJPEG
        # ---------------------------------------------

        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n"
            + frame_bytes
            + b"\r\n"
        )

        # ---------------------------------------------
        # Giới hạn khoảng 10 FPS cho HTTP stream
        # ---------------------------------------------

        elapsed = (
            time.perf_counter()
            - start_time
        )

        sleep_time = (
            frame_interval
            - elapsed
        )

        if sleep_time > 0:
            time.sleep(sleep_time)


# ============================================================
# 6. VIDEO FEED
# ============================================================

@app.get("/video_feed")
def video_feed():

    return StreamingResponse(
        generate_frames(),
        media_type=(
            "multipart/x-mixed-replace; "
            "boundary=frame"
        )
    )
# ============================================================
# 7. CHẠY FASTAPI Ở BACKGROUND
# ============================================================

def run_stream_server(
    host="0.0.0.0",
    port=8000
):
    """
    Chạy Uvicorn/FastAPI.

    Hàm này sẽ được fallandsnapshot.py
    gọi trong một thread riêng.

    Nhờ vậy:
    - Camera chỉ mở 1 lần
    - YOLO chạy trong chương trình chính
    - FastAPI vẫn phát MJPEG song song
    """

    import uvicorn

    config = uvicorn.Config(
        app=app,
        host=host,
        port=port,
        log_level="info",
        access_log=False
    )

    server = uvicorn.Server(
        config
    )

    server.run()


def start_stream_server(
    host="0.0.0.0",
    port=8000
):
    """
    Khởi động FastAPI bằng background thread.
    """

    server_thread = threading.Thread(
        target=run_stream_server,
        kwargs={
            "host": host,
            "port": port
        },
        daemon=True
    )

    server_thread.start()

    print(
        f"[STREAM] FastAPI dang chay "
        f"tai port {port}"
    )

    return server_thread    