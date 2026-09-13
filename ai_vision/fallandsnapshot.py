import cv2
import time
import math
import threading
import os

from pathlib import Path
from datetime import datetime
from ultralytics import YOLO
from dotenv import load_dotenv
from stream_server import update_stream_frame, start_stream_server
from mqtt_client import connect_mqtt, publish_fall, publish_safe, disconnect_mqtt
from fall_detector_v2 import FallDetectorV2

load_dotenv()
# ============================================================
# 1. CẤU HÌNH
# ============================================================

BASE_DIR = Path(__file__).resolve().parent

MODEL_PATH = BASE_DIR / "yolov8n-pose-320.onnx"
SNAPSHOT_FOLDER = BASE_DIR / "snapshots"
SNAPSHOT_FOLDER.mkdir(parents=True, exist_ok=True)

CAMERA_INDEX = int(os.getenv("CAMERA_INDEX", "0"))
TEST_VIDEO = os.getenv("TEST_VIDEO", "")

IMG_SIZE = 320

# Adaptive second-pass pose refinement.
# Full frame vẫn chạy 320 để giữ tốc độ.
# Chỉ crop người và chạy 320 lần hai khi frame khó.
REFINE_ENABLED = True
REFINE_IMG_SIZE = 320
REFINE_PADDING = 0.20

# Pose dưới mức này sẽ thử refine.
REFINE_POSE_QUALITY_THRESHOLD = 0.70

# Core body có hình học bất thường thì refine.
REFINE_CORE_RATIO_THRESHOLD = 0.70

CAMERA_WIDTH = 1280
CAMERA_HEIGHT = 720
CAMERA_FPS = 30

# Fall Detection V2
# Kết hợp hình học + biến đổi theo thời gian.
KEYPOINT_CONF_THRESHOLD = 0.3

FALL_HISTORY_SECONDS = 0.8
FALL_CONFIRM_TIME = 0.8
SAFE_CONFIRM_TIME = 2.0

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
using_test_video = False
cap = cv2.VideoCapture(CAMERA_INDEX)

if cap.isOpened():
    print(f"[CAMERA] Dang dung camera index {CAMERA_INDEX}")

    # Dùng MJPG để camera USB chạy ổn định hơn
    cap.set(
        cv2.CAP_PROP_FOURCC,
        cv2.VideoWriter_fourcc(*"MJPG")
    )

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_HEIGHT)
    cap.set(cv2.CAP_PROP_FPS, CAMERA_FPS)

    actual_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    actual_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    actual_fps = cap.get(cv2.CAP_PROP_FPS)

    fourcc_value = int(cap.get(cv2.CAP_PROP_FOURCC))
    actual_fourcc = "".join(
        chr((fourcc_value >> (8 * i)) & 0xFF)
        for i in range(4)
    )

    print(
        f"[CAMERA] Requested: "
        f"{CAMERA_WIDTH}x{CAMERA_HEIGHT} @ {CAMERA_FPS} FPS, MJPG"
    )
    print(
        f"[CAMERA] Actual   : "
        f"{actual_width}x{actual_height} @ {actual_fps:.2f} FPS, "
        f"{actual_fourcc}"
    )

elif TEST_VIDEO:
    print(
        f"[CAMERA] Khong mo duoc camera index {CAMERA_INDEX}. "
        f"Chuyen sang video test: {TEST_VIDEO}"
    )

    cap.release()
    cap = cv2.VideoCapture(TEST_VIDEO)

    if not cap.isOpened():
        raise RuntimeError(
            f"Khong mo duoc camera va cung khong mo duoc video test: {TEST_VIDEO}"
        )
    using_test_video = True

else:
    raise RuntimeError(
        f"Khong mo duoc camera index {CAMERA_INDEX}. "
        "Hay ket noi camera hoac dat TEST_VIDEO trong file .env"
    )


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
            # Nếu đang dùng video test thì chạy lại từ đầu video
            if using_test_video:
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                time.sleep(0.01)
                continue

            # Nếu là camera thật thì thử đọc lại frame tiếp theo
            time.sleep(0.01)
            continue

        with latest_frame_lock:
            latest_frame = frame

        # Giữ video test chạy gần đúng tốc độ gốc
        if using_test_video:
            video_fps = cap.get(cv2.CAP_PROP_FPS)

            if video_fps > 0:
                time.sleep(1 / video_fps)


camera_thread = threading.Thread(
    target=camera_reader,
    daemon=True
)

camera_thread.start()


# ============================================================
# 5. HÀM TÍNH GÓC CƠ THỂ
# ============================================================

def refine_person_pose(frame, person_box):
    """
    Chạy YOLO Pose lần hai trên ROI của riêng người.

    Full frame:
        1280x720 -> YOLO imgsz=320

    Refine:
        crop người -> YOLO imgsz=320

    Nhờ vậy phần lớn độ phân giải đầu vào được dành cho cơ thể,
    thay vì dành cho cả căn phòng.

    Trả về:
        points_full
        conf
        box_full
        refine_ms

    Nếu refine thất bại -> None.
    """

    frame_h, frame_w = frame.shape[:2]

    x1, y1, x2, y2 = [
        float(v)
        for v in person_box
    ]

    box_w = max(1.0, x2 - x1)
    box_h = max(1.0, y2 - y1)

    pad_x = box_w * REFINE_PADDING
    pad_y = box_h * REFINE_PADDING

    rx1 = max(
        0,
        int(x1 - pad_x)
    )

    ry1 = max(
        0,
        int(y1 - pad_y)
    )

    rx2 = min(
        frame_w,
        int(x2 + pad_x)
    )

    ry2 = min(
        frame_h,
        int(y2 + pad_y)
    )

    if (
        rx2 - rx1 < 40
        or ry2 - ry1 < 40
    ):
        return None

    crop = frame[
        ry1:ry2,
        rx1:rx2
    ]

    if crop.size == 0:
        return None

    refine_start = time.perf_counter()

    refined_results = model(
        crop,
        imgsz=REFINE_IMG_SIZE,
        verbose=False,
    )

    refine_ms = (
        time.perf_counter()
        - refine_start
    ) * 1000

    r = refined_results[0]

    if (
        r.keypoints is None
        or r.keypoints.xy is None
        or r.keypoints.conf is None
        or r.boxes is None
        or len(r.boxes) == 0
    ):
        return None

    all_points = r.keypoints.xy.cpu().numpy()
    all_conf = r.keypoints.conf.cpu().numpy()
    all_boxes = r.boxes.xyxy.cpu().numpy()

    # Trong crop vẫn chọn người lớn nhất.
    best_id = 0
    best_area = 0.0

    for person_id, box in enumerate(all_boxes):
        bx1, by1, bx2, by2 = box

        area = max(
            0.0,
            float(bx2 - bx1)
        ) * max(
            0.0,
            float(by2 - by1)
        )

        if area > best_area:
            best_area = area
            best_id = person_id

    points = all_points[
        best_id
    ].copy()

    conf = all_conf[
        best_id
    ].copy()

    box = all_boxes[
        best_id
    ].copy()

    # Đổi tọa độ crop về tọa độ full frame.
    points[:, 0] += rx1
    points[:, 1] += ry1

    box[0] += rx1
    box[2] += rx1

    box[1] += ry1
    box[3] += ry1

    return (
        points,
        conf,
        box,
        refine_ms,
    )


def calculate_pose_quality(person_conf):
    """
    Chất lượng pose dựa trên 8 keypoint thân dưới/thân giữa
    quan trọng cho bài toán té ngã:

    5, 6   : vai trái/phải
    11, 12 : hông trái/phải
    13, 14 : gối trái/phải
    15, 16 : mắt cá trái/phải

    Không dùng confidence bbox thay cho confidence skeleton.
    """
    important_points = [5, 6, 11, 12, 13, 14, 15, 16]

    values = [
        float(person_conf[i])
        for i in important_points
        if i < len(person_conf)
    ]

    if not values:
        return 0.0

    return sum(values) / len(values)


def calculate_core_geometry(person_points, person_conf):
    """
    Tính hình học phần thân chính, bỏ hoàn toàn cổ tay/khuỷu tay.

    Keypoint COCO dùng:
    5, 6   : vai trái/phải
    11, 12 : hông trái/phải
    13, 14 : gối trái/phải
    15, 16 : mắt cá trái/phải

    Trả về:
    - core_ratio = width / height của phần thân chính
    - center_y_px = vị trí dọc đại diện cho cơ thể

    Ưu tiên trung tâm hông làm center_y vì hông ít bị ảnh hưởng
    bởi dang tay và là đại diện tốt hơn cho chuyển động rơi.
    """

    core_ids = [5, 6, 11, 12, 13, 14, 15, 16]

    valid_ids = [
        idx
        for idx in core_ids
        if (
            idx < len(person_conf)
            and person_conf[idx] >= KEYPOINT_CONF_THRESHOLD
        )
    ]

    # Cần đủ số điểm và phải có cả thân trên + thân dưới.
    has_upper = any(
        idx in valid_ids
        for idx in [5, 6, 11, 12]
    )

    has_lower = any(
        idx in valid_ids
        for idx in [13, 14, 15, 16]
    )

    if (
        len(valid_ids) < 5
        or not has_upper
        or not has_lower
    ):
        return None, None

    xs = [
        float(person_points[idx][0])
        for idx in valid_ids
    ]

    ys = [
        float(person_points[idx][1])
        for idx in valid_ids
    ]

    width = max(xs) - min(xs)
    height = max(ys) - min(ys)

    if height <= 1.0:
        core_ratio = None
    else:
        core_ratio = width / height

    # Hông là proxy tốt cho trọng tâm cơ thể.
    hip_y_values = [
        float(person_points[idx][1])
        for idx in [11, 12]
        if (
            idx < len(person_conf)
            and person_conf[idx] >= KEYPOINT_CONF_THRESHOLD
        )
    ]

    if hip_y_values:
        center_y_px = (
            sum(hip_y_values) / len(hip_y_values)
        )
    else:
        center_y_px = (
            (min(ys) + max(ys)) / 2.0
        )

    return core_ratio, center_y_px


def calculate_leg_geometry(person_points, person_conf):
    """
    Đo hướng của chân so với phương thẳng đứng.

    Mỗi bên cần đủ:
    - hip
    - knee
    - ankle

    0 độ  : chân gần thẳng đứng
    90 độ : chân gần nằm ngang

    Trả về:
    leg_angle, số chân hợp lệ, chất lượng trung bình.
    """

    leg_definitions = [
        (11, 13, 15),  # trái: hip, knee, ankle
        (12, 14, 16),  # phải
    ]

    angles = []
    qualities = []

    for hip_id, knee_id, ankle_id in leg_definitions:
        ids = [hip_id, knee_id, ankle_id]

        if any(
            idx >= len(person_conf)
            for idx in ids
        ):
            continue

        confs = [
            float(person_conf[idx])
            for idx in ids
        ]

        if min(confs) < KEYPOINT_CONF_THRESHOLD:
            continue

        hip = person_points[hip_id]
        ankle = person_points[ankle_id]

        dx = float(ankle[0] - hip[0])
        dy = float(ankle[1] - hip[1])

        if abs(dx) + abs(dy) < 1.0:
            continue

        angle = math.degrees(
            math.atan2(abs(dx), abs(dy))
        )

        angles.append(angle)
        qualities.append(
            sum(confs) / len(confs)
        )

    if not angles:
        return None, 0, 0.0

    return (
        sum(angles) / len(angles),
        len(angles),
        sum(qualities) / len(qualities),
    )


def calculate_arm_support(
    person_points,
    person_conf,
    person_box,
):
    """
    Phát hiện tay đang ở tư thế chống đỡ cơ thể.

    Không dùng tín hiệu này để kết luận SAFE/FALL trực tiếp.
    Nó chỉ giúp nhận ra tư thế plank/chống đẩy đã tồn tại
    trước khi cơ thể hạ xuống.

    COCO:
    5, 7, 9   : vai, khuỷu, cổ tay trái
    6, 8, 10  : vai, khuỷu, cổ tay phải

    Trả về:
    - số tay có hình học giống đang chống sàn
    - chất lượng confidence trung bình
    """

    if person_box is None:
        return 0, 0.0

    x1, y1, x2, y2 = person_box

    box_height = float(y2 - y1)

    if box_height <= 1.0:
        return 0, 0.0

    arm_definitions = [
        (5, 7, 9),    # trái
        (6, 8, 10),   # phải
    ]

    supporting_arms = 0
    qualities = []

    for shoulder_id, elbow_id, wrist_id in arm_definitions:
        ids = [
            shoulder_id,
            elbow_id,
            wrist_id,
        ]

        if any(
            idx >= len(person_conf)
            for idx in ids
        ):
            continue

        confs = [
            float(person_conf[idx])
            for idx in ids
        ]

        if min(confs) < KEYPOINT_CONF_THRESHOLD:
            continue

        shoulder = person_points[shoulder_id]
        elbow = person_points[elbow_id]
        wrist = person_points[wrist_id]

        shoulder_y = float(shoulder[1])
        elbow_y = float(elbow[1])
        wrist_y = float(wrist[1])

        # Chuẩn hóa theo chiều cao bbox để không phụ thuộc
        # người đứng gần hay xa camera.
        wrist_drop = (
            wrist_y - shoulder_y
        ) / box_height

        elbow_drop = (
            elbow_y - shoulder_y
        ) / box_height

        wrist_from_elbow = (
            wrist_y - elbow_y
        ) / box_height

        wrist_position = (
            wrist_y - float(y1)
        ) / box_height

        # Tay chống sàn thường:
        # - cổ tay thấp hơn vai rõ rệt
        # - khuỷu nằm dưới vai
        # - cổ tay nằm dưới khuỷu
        # - cổ tay nằm ở phần thấp của bbox người
        arm_support = (
            wrist_drop >= 0.18
            and elbow_drop >= 0.05
            and wrist_from_elbow >= 0.04
            and wrist_position >= 0.60
        )

        if arm_support:
            supporting_arms += 1
            qualities.append(
                sum(confs) / len(confs)
            )

    quality = (
        sum(qualities) / len(qualities)
        if qualities
        else 0.0
    )

    return supporting_arms, quality


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

fall_detector = FallDetectorV2(
    history_seconds=FALL_HISTORY_SECONDS,
    fall_confirm_time=FALL_CONFIRM_TIME,
    safe_confirm_time=SAFE_CONFIRM_TIME,
)

detector_result = {
    "state": "NO_PERSON",
    "event": None,
    "fall_candidate": False,
    "fall_active": False,
    "safe_posture": False,
    "vertical_drop": 0.0,
    "ratio_growth": 0.0,
    "dynamic_fall": False,
    "static_fall": False,
    "suspicious_posture": False,
}

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

        # body_ratio = bbox YOLO toàn người, chỉ dùng tín hiệu phụ.
        body_ratio = None

        # core_ratio bỏ hai cánh tay khỏi hình học tư thế.
        core_ratio = None
        core_center_y_px = None

        center_y_norm = None
        pose_quality = 0.0

        leg_angle = None
        leg_count = 0
        leg_quality = 0.0

        arm_support_count = 0
        arm_support_quality = 0.0
        support_posture = False

        person_detected = False

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

            pose_quality = calculate_pose_quality(
                person_conf
            )

            (
                leg_angle,
                leg_count,
                leg_quality,
            ) = calculate_leg_geometry(
                person_points,
                person_conf,
            )

            core_ratio, core_center_y_px = (
                calculate_core_geometry(
                    person_points,
                    person_conf
                )
            )

            body_angle = calculate_body_angle(
                person_points,
                person_conf
            )

            (
                arm_support_count,
                arm_support_quality,
            ) = calculate_arm_support(
                person_points,
                person_conf,
                person_box,
            )

            # Chỉ coi là support posture khi cơ thể đã nằm ngang
            # tương đối rõ. Vì vậy người đứng với tay buông xuống
            # sẽ không bị nhầm là đang chống sàn.
            support_posture = (
                body_angle is not None
                and core_ratio is not None
                and body_angle >= 45.0
                and core_ratio >= 0.80
                and arm_support_count >= 1
                and arm_support_quality >= 0.45
            )

            box_width = x2 - x1
            box_height = y2 - y1

            if box_height > 0:
                body_ratio = box_width / box_height

            frame_height = frame.shape[0]

            if frame_height > 0:
                if core_center_y_px is not None:
                    center_y_norm = (
                        core_center_y_px / frame_height
                    )
                else:
                    # Fallback khi keypoint core bị che quá nhiều.
                    center_y_norm = (
                        ((y1 + y2) / 2.0) / frame_height
                    )


        # ----------------------------------------------------
        # FALL DETECTION V2
        # ----------------------------------------------------

        current_time = time.perf_counter()

        detector_result = fall_detector.update(
            now=current_time,
            person_detected=person_detected,
            body_angle=body_angle,
            body_ratio=body_ratio,
            core_ratio=core_ratio,
            center_y_norm=center_y_norm,
            pose_quality=pose_quality,
            support_posture=support_posture,
        )

        fall_state = detector_result["state"]


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
        # Hiển thị thông số Final Demo
        # ----------------------------------------------------

        # Chỉ hiển thị các metric dễ giải thích khi demo.
        # Các feature debug như BBox, LegA, Drop, dR
        # vẫn được tính cho thuật toán nhưng không vẽ lên frame.

        cv2.putText(
            annotated_frame,
            "AI FALL DETECTION V2",
            (20, 35),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.75,
            (255, 255, 255),
            2
        )

        cv2.putText(
            annotated_frame,
            (
                f"FPS: {fps:.1f} | "
                f"Inference: {inference_ms:.0f} ms"
            ),
            (20, 65),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.6,
            (0, 255, 0),
            2
        )

        angle_text = (
            f"{body_angle:.1f} deg"
            if body_angle is not None
            else "N/A"
        )

        cv2.putText(
            annotated_frame,
            f"Body Angle: {angle_text}",
            (20, 100),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (255, 255, 0),
            2
        )

        core_text = (
            f"{core_ratio:.2f}"
            if core_ratio is not None
            else "N/A"
        )

        cv2.putText(
            annotated_frame,
            f"Core Ratio: {core_text}",
            (20, 130),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (255, 255, 0),
            2
        )

        fall_speed = float(
            detector_result.get(
                "vertical_drop_rate",
                0.0
            ) or 0.0
        )

        cv2.putText(
            annotated_frame,
            f"Fall Speed: {fall_speed:.2f} /s",
            (20, 160),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (255, 255, 0),
            2
        )

        cv2.putText(
            annotated_frame,
            f"Pose Quality: {pose_quality * 100:.0f}%",
            (20, 190),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (255, 255, 0),
            2
        )


        # ----------------------------------------------------
        # Trạng thái Final Demo
        # ----------------------------------------------------

        state_colors = {
            "NORMAL": (0, 255, 0),
            "NO_PERSON": (180, 180, 180),
            "PERSON_LOST": (0, 0, 255),
            "SUSPICIOUS": (0, 165, 255),
            "FALL_CANDIDATE": (0, 165, 255),
            "FALL_DETECTED": (0, 0, 255),
            "FALL_ACTIVE": (0, 0, 255),
            "RECOVERING": (0, 255, 255),
        }

        state_labels = {
            "NORMAL": "SAFE",
            "NO_PERSON": "NO PERSON",
            "PERSON_LOST": "FALL ALERT ACTIVE",
            "SUSPICIOUS": "SUSPICIOUS",
            "FALL_CANDIDATE": "CHECKING FALL...",
            "FALL_DETECTED": "FALL DETECTED",
            "FALL_ACTIVE": "FALL DETECTED",
            "RECOVERING": "RECOVERING",
        }

        cv2.putText(
            annotated_frame,
            state_labels.get(
                fall_state,
                fall_state
            ),
            (20, 230),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.9,
            state_colors.get(
                fall_state,
                (255, 255, 255)
            ),
            2
        )


        # ----------------------------------------------------
        # Gửi frame YOLO sang FastAPI
        # ----------------------------------------------------

        # Đây là frame đã có skeleton, FPS và trạng thái AI.
        # stream_server.py chỉ phát frame này lên /video_feed.
        update_stream_frame(annotated_frame)


        # ----------------------------------------------------
        # FALL / SAFE EVENT V2
        # ----------------------------------------------------

        if detector_result["event"] == "fall":
            snapshot_path = save_snapshot(
                annotated_frame
            )

            if snapshot_path is not None:
                publish_fall(snapshot_path)
                print("[EVENT] FALL V2 da duoc gui")
            else:
                print(
                    "[EVENT] FALL V2 phat hien "
                    "nhung snapshot bi loi"
                )

        elif detector_result["event"] == "safe":
            publish_safe()
            print("[EVENT] SAFE V2 da duoc gui")


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