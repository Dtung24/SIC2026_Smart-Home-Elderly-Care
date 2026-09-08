import cv2
import time
import math
import threading
import os

from pathlib import Path
from datetime import datetime
from ultralytics import YOLO

from stream_server import update_stream_frame, start_stream_server
from mqtt_client import connect_mqtt, publish_fall, publish_safe, disconnect_mqtt


# ============================================================
# 1. CẤU HÌNH
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

MODEL_PATH = BASE_DIR / "yolov8n-pose-320.onnx"
SNAPSHOT_FOLDER = BASE_DIR / "snapshots"
SNAPSHOT_FOLDER.mkdir(parents=True, exist_ok=True)

CAMERA_INDEX = int(os.getenv("CAMERA_INDEX", "0"))

IMG_SIZE = 320

CAMERA_WIDTH = 1280
CAMERA_HEIGHT = 720
CAMERA_FPS = 30

# Fall Detection V1
ANGLE_THRESHOLD = 60
RATIO_THRESHOLD = 1.2
FALL_CONFIRM_TIME = 0.8
KEYPOINT_CONF_THRESHOLD = 0.3

# Xác nhận người đã an toàn trở lại
SAFE_CONFIRM_TIME = 2.0
SAFE_ANGLE_THRESHOLD = 45
SAFE_RATIO_THRESHOLD = 1.0

# Laptop để true để hiện cửa sổ OpenCV
# Sau này Raspberry Pi chạy headless có thể đổi thành false
SHOW_WINDOW = os.getenv("SHOW_WINDOW", "true").lower() in (
    "1", "true", "yes", "on"
)


# ============================================================
# 2. NẠP MODEL
# ============================================================

if not MODEL_PATH.exists():
    raise FileNotFoundError(f"Khong tim thay model: {MODEL_PATH}")

print(f"[AI] Dang nap model: {MODEL_PATH.name}")
model = YOLO(str(MODEL_PATH))


# ============================================================
# 3. MỞ CAMERA
# ============================================================

cap = cv2.VideoCapture(CAMERA_INDEX)

# Dùng MJPG để camera USB chạy ổn định hơn
cap.set(
    cv2.CAP_PROP_FOURCC,
    cv2.VideoWriter_fourcc(*"MJPG")
)

cap.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_WIDTH)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_HEIGHT)
cap.set(cv2.CAP_PROP_FPS, CAMERA_FPS)

if not cap.isOpened():
    raise RuntimeError(f"Khong mo duoc camera index {CAMERA_INDEX}")


# ============================================================
# 4. CAMERA THREAD
# ============================================================

# Camera đọc liên tục và chỉ giữ frame mới nhất.
# Không dùng queue để tránh tích tụ frame cũ gây trễ.

latest_frame = None
latest_frame_lock = threading.Lock()
running = True


def camera_reader():
    global latest_frame, running

    while running:
        ret, frame = cap.read()

        if not ret:
            time.sleep(0.01)
            continue

        with latest_frame_lock:
            latest_frame = frame


camera_thread = threading.Thread(
    target=camera_reader,
    daemon=True
)

camera_thread.start()


# ============================================================
# 5. HÀM TÍNH GÓC CƠ THỂ
# ============================================================

def calculate_body_angle(person_points, person_conf):
    # 5, 6: vai trái/phải
    # 11, 12: hông trái/phải
    required_points = [5, 6, 11, 12]

    for point_id in required_points:
        if person_conf[point_id] < KEYPOINT_CONF_THRESHOLD:
            return None

    left_shoulder = person_points[5]
    right_shoulder = person_points[6]

    left_hip = person_points[11]
    right_hip = person_points[12]

    shoulder_x = (left_shoulder[0] + right_shoulder[0]) / 2
    shoulder_y = (left_shoulder[1] + right_shoulder[1]) / 2

    hip_x = (left_hip[0] + right_hip[0]) / 2
    hip_y = (left_hip[1] + right_hip[1]) / 2

    dx = shoulder_x - hip_x
    dy = shoulder_y - hip_y

    # 0 độ = đứng, 90 độ = nằm ngang
    angle = math.degrees(math.atan2(abs(dx), abs(dy)))

    return angle


# ============================================================
# 6. HÀM LƯU SNAPSHOT
# ============================================================

def save_snapshot(frame):
    now = datetime.now()
    filename = now.strftime("fall_%Y-%m-%d_%H-%M-%S.jpg")
    filepath = SNAPSHOT_FOLDER / filename

    success = cv2.imwrite(str(filepath), frame)

    if success:
        print(f"[SNAPSHOT] Da luu: {filepath}")
        return str(filepath)

    print("[SNAPSHOT] Loi khi luu anh")
    return None


# ============================================================
# 7. KHỞI ĐỘNG FASTAPI + MQTT
# ============================================================

# FastAPI chạy background và không mở camera riêng.
start_stream_server()

# Hiện tại laptop đang dùng MQTT DRY RUN.
connect_mqtt()


# ============================================================
# 8. BIẾN TRẠNG THÁI
# ============================================================

fall_candidate_start = None
fall_detected = False

# Sau khi gửi FALL thì giữ True cho đến khi người an toàn trở lại.
fall_event_active = False
safe_candidate_start = None

prev_time = time.perf_counter()


print("\n============================================")
print("AI VISION DANG CHAY")
print(f"Model        : {MODEL_PATH.name}")
print(f"Camera       : index {CAMERA_INDEX}")
print("Video stream : http://127.0.0.1:8000/video_feed")
print("Health       : http://127.0.0.1:8000/health")
print("Nhan Q de thoat")
print("============================================\n")


# ============================================================
# 9. VÒNG LẶP CHÍNH
# ============================================================

try:
    while True:
        # Lấy frame mới nhất từ camera thread
        with latest_frame_lock:
            if latest_frame is None:
                frame = None
            else:
                frame = latest_frame.copy()

        if frame is None:
            time.sleep(0.005)
            continue

        # ----------------------------------------------------
        # YOLO inference
        # ----------------------------------------------------

        inference_start = time.perf_counter()

        results = model(
            frame,
            imgsz=IMG_SIZE,
            verbose=False
        )

        inference_ms = (
            time.perf_counter() - inference_start
        ) * 1000

        annotated_frame = results[0].plot()

        body_angle = None
        body_ratio = None

        fall_candidate = False
        person_detected = False
        safe_posture = False

        keypoints = results[0].keypoints
        boxes = results[0].boxes

        # ----------------------------------------------------
        # Lấy người có bounding box lớn nhất
        # ----------------------------------------------------

        if (
            keypoints is not None
            and keypoints.xy is not None
            and keypoints.conf is not None
            and boxes is not None
            and len(boxes) > 0
        ):
            all_points = keypoints.xy.cpu().numpy()
            all_conf = keypoints.conf.cpu().numpy()
            all_boxes = boxes.xyxy.cpu().numpy()

            largest_person_id = 0
            largest_area = 0

            for person_id, box in enumerate(all_boxes):
                x1, y1, x2, y2 = box

                width = x2 - x1
                height = y2 - y1
                area = width * height

                if area > largest_area:
                    largest_area = area
                    largest_person_id = person_id

            person_points = all_points[largest_person_id]
            person_conf = all_conf[largest_person_id]
            person_box = all_boxes[largest_person_id]

            x1, y1, x2, y2 = person_box

            person_detected = True

            body_angle = calculate_body_angle(
                person_points,
                person_conf
            )

            box_width = x2 - x1
            box_height = y2 - y1

            if box_height > 0:
                body_ratio = box_width / box_height

            # Fall Detection V1
            if (
                body_angle is not None
                and body_ratio is not None
                and body_angle > ANGLE_THRESHOLD
                and body_ratio > RATIO_THRESHOLD
            ):
                fall_candidate = True

            # Người được coi là đã về tư thế an toàn khi
            # cơ thể tương đối thẳng đứng trở lại.
            if (
                body_angle is not None
                and body_ratio is not None
                and body_angle < SAFE_ANGLE_THRESHOLD
                and body_ratio < SAFE_RATIO_THRESHOLD
            ):
                safe_posture = True


        # ----------------------------------------------------
        # Xác nhận FALL theo thời gian
        # ----------------------------------------------------

        current_time = time.perf_counter()

        if fall_candidate:
            if fall_candidate_start is None:
                fall_candidate_start = current_time

            candidate_duration = (
                current_time - fall_candidate_start
            )

            if candidate_duration >= FALL_CONFIRM_TIME:
                fall_detected = True

        else:
            fall_candidate_start = None
            fall_detected = False


        # ----------------------------------------------------
        # Tính FPS tức thời
        # ----------------------------------------------------

        fps_time = time.perf_counter()
        frame_time = fps_time - prev_time

        if frame_time > 0:
            fps = 1 / frame_time
        else:
            fps = 0

        prev_time = fps_time


        # ----------------------------------------------------
        # Hiển thị thông số lên frame
        # ----------------------------------------------------

        cv2.putText(
            annotated_frame,
            f"FPS: {fps:.1f}",
            (20, 35),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 255, 0),
            2
        )

        cv2.putText(
            annotated_frame,
            f"Inference: {inference_ms:.0f} ms",
            (20, 65),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.7,
            (0, 255, 0),
            2
        )

        if body_angle is not None:
            cv2.putText(
                annotated_frame,
                f"Angle: {body_angle:.1f}",
                (20, 95),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (255, 255, 0),
                2
            )

        if body_ratio is not None:
            cv2.putText(
                annotated_frame,
                f"W/H: {body_ratio:.2f}",
                (20, 125),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (255, 255, 0),
                2
            )


        # ----------------------------------------------------
        # Hiển thị trạng thái
        # ----------------------------------------------------

        if fall_detected:
            cv2.putText(
                annotated_frame,
                "FALL DETECTED!",
                (20, 175),
                cv2.FONT_HERSHEY_SIMPLEX,
                1.1,
                (0, 0, 255),
                3
            )

        elif fall_candidate:
            cv2.putText(
                annotated_frame,
                "FALL CANDIDATE",
                (20, 175),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.9,
                (0, 255, 255),
                2
            )

        else:
            cv2.putText(
                annotated_frame,
                "NORMAL",
                (20, 175),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.9,
                (0, 255, 0),
                2
            )


        # ----------------------------------------------------
        # Gửi frame YOLO sang FastAPI
        # ----------------------------------------------------

        # Đây là frame đã có skeleton, FPS và trạng thái AI.
        # stream_server.py chỉ phát frame này lên /video_feed.
        update_stream_frame(annotated_frame)


        # ----------------------------------------------------
        # FALL EVENT
        # ----------------------------------------------------

        # Một lần ngã chỉ tạo một snapshot và một cảnh báo.
        if fall_detected and not fall_event_active:
            snapshot_path = save_snapshot(annotated_frame)

            if snapshot_path is not None:
                publish_fall(snapshot_path)

                fall_event_active = True
                safe_candidate_start = None

                print("[EVENT] FALL da duoc gui")


        # ----------------------------------------------------
        # SAFE EVENT
        # ----------------------------------------------------

        # Chỉ gửi SAFE nếu trước đó đã có FALL.
        # Không gửi SAFE liên tục khi người đang bình thường.
        if fall_event_active:
            if person_detected and safe_posture:
                if safe_candidate_start is None:
                    safe_candidate_start = current_time

                safe_duration = (
                    current_time - safe_candidate_start
                )

                if safe_duration >= SAFE_CONFIRM_TIME:
                    publish_safe()

                    fall_event_active = False
                    safe_candidate_start = None
                    fall_candidate_start = None
                    fall_detected = False

                    print("[EVENT] SAFE da duoc gui")

            else:
                safe_candidate_start = None


        # ----------------------------------------------------
        # Hiển thị cửa sổ local
        # ----------------------------------------------------

        if SHOW_WINDOW:
            cv2.imshow(
                "Fall Detection + Snapshot + Stream",
                annotated_frame
            )

            if cv2.waitKey(1) & 0xFF == ord("q"):
                break


except KeyboardInterrupt:
    print("\n[SYSTEM] Ctrl+C - dang dung...")


finally:
    running = False

    camera_thread.join(timeout=2)
    cap.release()

    if SHOW_WINDOW:
        cv2.destroyAllWindows()

    disconnect_mqtt()

    print("[SYSTEM] Da dong camera va dung AI")