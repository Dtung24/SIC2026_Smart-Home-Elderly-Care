import json
import os

from pathlib import Path
from datetime import datetime

import paho.mqtt.client as mqtt


# ============================================================
# 1. CẤU HÌNH MQTT
# ============================================================

# Broker mặc định chạy cùng Raspberry Pi.
#
# Laptop tối nay đang dùng DRY RUN nên chưa cần broker thật.
MQTT_BROKER = os.getenv(
    "MQTT_BROKER",
    "127.0.0.1"
)

MQTT_PORT = int(
    os.getenv(
        "MQTT_PORT",
        "1883"
    )
)


# ============================================================
# 2. DRY RUN
# ============================================================

# Mặc định TRUE để:
#
# - laptop không cần Raspberry Pi
# - không bị ConnectionRefused
# - vẫn nhìn được topic + payload thực tế
#
# Ngày mai khi có Raspberry Pi:
#
# MQTT_DRY_RUN=false
#
MQTT_DRY_RUN = (
    os.getenv(
        "MQTT_DRY_RUN",
        "true"
    ).lower()
    in (
        "1",
        "true",
        "yes",
        "on"
    )
)


# ============================================================
# 3. MQTT TOPIC
# ============================================================

# Bắc / Node-RED
MQTT_TOPIC_NODE_RED_FALL = os.getenv(
    "MQTT_TOPIC_NODE_RED_FALL",
    "home/camera/fall"
)

MQTT_TOPIC_NODE_RED_SAFE = os.getenv(
    "MQTT_TOPIC_NODE_RED_SAFE",
    "home/camera/safe"
)


# Đông / Backend
MQTT_TOPIC_BACKEND_FALL = os.getenv(
    "MQTT_TOPIC_BACKEND_FALL",
    "home/livingroom/alert/fall"
)


# ============================================================
# 4. CAMERA / HTTP
# ============================================================

DEVICE_ID = os.getenv(
    "CAMERA_DEVICE_ID",
    "camera_livingroom_01"
)


# Địa chỉ FastAPI dùng để mở snapshot qua HTTP.
#
# Tối nay test trên laptop:
# http://127.0.0.1:8000
#
# Sau này có thể đổi thành:
#
# http://IP_RASPBERRY_PI:8000
#
# hoặc URL Cloudflare Tunnel.
PUBLIC_BASE_URL = os.getenv(
    "PUBLIC_BASE_URL",
    "http://127.0.0.1:8000"
).rstrip("/")


# ============================================================
# 5. TẠO MQTT CLIENT
# ============================================================

client = mqtt.Client(
    mqtt.CallbackAPIVersion.VERSION2
)

mqtt_connected = False


# ============================================================
# 6. THỜI GIAN ISO
# ============================================================

def current_timestamp():
    """
    Trả về thời gian có timezone.

    Ví dụ:
    2026-09-03T04:55:30+07:00
    """

    return (
        datetime.now()
        .astimezone()
        .isoformat(
            timespec="seconds"
        )
    )


# ============================================================
# 7. CALLBACK KẾT NỐI
# ============================================================

def on_connect(
    client,
    userdata,
    flags,
    reason_code,
    properties
):

    global mqtt_connected

    if reason_code == 0:

        mqtt_connected = True

        print(
            "[MQTT] Ket noi broker thanh cong"
        )

    else:

        mqtt_connected = False

        print(
            f"[MQTT] Loi ket noi: {reason_code}"
        )


client.on_connect = on_connect


# ============================================================
# 8. KẾT NỐI MQTT
# ============================================================

def connect_mqtt():

    if MQTT_DRY_RUN:

        print(
            "[MQTT] DRY RUN dang bat"
        )

        print(
            "[MQTT] Khong ket noi broker that"
        )

        return

    print(
        f"[MQTT] Dang ket noi "
        f"{MQTT_BROKER}:{MQTT_PORT}"
    )

    client.connect(
        MQTT_BROKER,
        MQTT_PORT,
        60
    )

    # MQTT chạy ở background
    client.loop_start()


# ============================================================
# 9. HÀM GỬI MQTT CHUNG
# ============================================================

def publish_message(
    topic,
    data
):

    payload = json.dumps(
        data,
        ensure_ascii=False
    )


    # --------------------------------------------------------
    # DRY RUN
    # --------------------------------------------------------

    if MQTT_DRY_RUN:

        print()
        print(
            "======================================"
        )

        print(
            "[MQTT DRY RUN]"
        )

        print(
            f"Topic: {topic}"
        )

        print(
            "Payload:"
        )

        print(
            json.dumps(
                data,
                ensure_ascii=False,
                indent=2
            )
        )

        print(
            "======================================"
        )

        return True


    # --------------------------------------------------------
    # MQTT THẬT
    # --------------------------------------------------------

    result = client.publish(
        topic,
        payload,
        qos=1
    )

    result.wait_for_publish()

    print(
        f"[MQTT] Da gui: {topic}"
    )

    return True


# ============================================================
# 10. TẠO URL SNAPSHOT
# ============================================================

def build_snapshot_url(
    snapshot_path
):

    filename = (
        Path(snapshot_path)
        .name
    )

    return (
        f"{PUBLIC_BASE_URL}"
        f"/snapshots/"
        f"{filename}"
    )


# ============================================================
# 11. GỬI FALL
# ============================================================

def publish_fall(
    snapshot_path,
    confidence=None
):

    # --------------------------------------------------------
    # Chuyển thành đường dẫn tuyệt đối
    #
    # Bắc / Node-RED sẽ dùng image_path
    # để đọc file JPG thật trên Raspberry Pi.
    # --------------------------------------------------------

    absolute_path = str(
        Path(snapshot_path)
        .resolve()
    )


    # --------------------------------------------------------
    # URL snapshot dành cho Backend/Web
    # --------------------------------------------------------

    snapshot_url = (
        build_snapshot_url(
            absolute_path
        )
    )


    # --------------------------------------------------------
    # Payload chung
    #
    # image_path:
    #     Bắc / Node-RED
    #
    # snapshotPath:
    #     Đông / Backend / Minh
    # --------------------------------------------------------

    data = {

        "deviceId":
            DEVICE_ID,

        "detected":
            True,

        "severity":
            "critical",

        "image_path":
            absolute_path,

        "snapshotPath":
            snapshot_url,

        "status":
            "new",

        "timestamp":
            current_timestamp()
    }


    # Confidence có thể chưa có ở Fall Detection V1.
    #
    # Khi nào tính được confidence cho sự kiện FALL
    # thì mới thêm vào payload.
    if confidence is not None:

        data["confidence"] = round(
            float(confidence),
            3
        )


    # --------------------------------------------------------
    # 1. Gửi cho Bắc / Node-RED
    # --------------------------------------------------------

    publish_message(
        MQTT_TOPIC_NODE_RED_FALL,
        data
    )


    # --------------------------------------------------------
    # 2. Gửi cho Đông / Backend
    # --------------------------------------------------------

    publish_message(
        MQTT_TOPIC_BACKEND_FALL,
        data
    )


    return data


# ============================================================
# 12. GỬI SAFE
# ============================================================

def publish_safe():

    data = {

        "deviceId":
            DEVICE_ID,

        "detected":
            False,

        "status":
            "safe",

        "timestamp":
            current_timestamp()
    }


    publish_message(
        MQTT_TOPIC_NODE_RED_SAFE,
        data
    )


    return data


# ============================================================
# 13. NGẮT MQTT
# ============================================================

def disconnect_mqtt():

    if MQTT_DRY_RUN:
        return

    client.loop_stop()
    client.disconnect()

    print(
        "[MQTT] Da ngat ket noi"
    )