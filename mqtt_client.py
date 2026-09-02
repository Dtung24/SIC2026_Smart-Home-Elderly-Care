import json
import os
from datetime import datetime
from pathlib import Path

import paho.mqtt.client as mqtt


# ============================================================
# CẤU HÌNH MQTT
# ============================================================

MQTT_BROKER = os.getenv("MQTT_BROKER", "127.0.0.1")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1883"))

# Mặc định bật dry run để có thể test khi chưa có broker
MQTT_DRY_RUN = os.getenv("MQTT_DRY_RUN", "true").lower() in (
    "1", "true", "yes", "on"
)

# Topic cho Node-RED của Bắc
MQTT_TOPIC_NODE_RED_FALL = os.getenv(
    "MQTT_TOPIC_NODE_RED_FALL",
    "home/camera/fall"
)

MQTT_TOPIC_NODE_RED_SAFE = os.getenv(
    "MQTT_TOPIC_NODE_RED_SAFE",
    "home/camera/safe"
)

# Topic cho Backend của Đông
MQTT_TOPIC_BACKEND_FALL = os.getenv(
    "MQTT_TOPIC_BACKEND_FALL",
    "home/livingroom/alert/fall"
)

DEVICE_ID = os.getenv(
    "CAMERA_DEVICE_ID",
    "camera_livingroom_01"
)

# Địa chỉ FastAPI dùng để mở snapshot trên web
PUBLIC_BASE_URL = os.getenv(
    "PUBLIC_BASE_URL",
    "http://127.0.0.1:8000"
).rstrip("/")


# ============================================================
# MQTT CLIENT
# ============================================================

client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
mqtt_connected = False


def current_timestamp():
    return datetime.now().astimezone().isoformat(timespec="seconds")


def on_connect(client, userdata, flags, reason_code, properties):
    global mqtt_connected

    if reason_code == 0:
        mqtt_connected = True
        print("[MQTT] Ket noi broker thanh cong")
    else:
        mqtt_connected = False
        print(f"[MQTT] Loi ket noi: {reason_code}")


client.on_connect = on_connect


def connect_mqtt():
    if MQTT_DRY_RUN:
        print("[MQTT] DRY RUN dang bat")
        print("[MQTT] Khong ket noi broker that")
        return

    print(f"[MQTT] Dang ket noi {MQTT_BROKER}:{MQTT_PORT}")

    client.connect(
        MQTT_BROKER,
        MQTT_PORT,
        60
    )

    client.loop_start()


# ============================================================
# GỬI MESSAGE
# ============================================================

def publish_message(topic, data):
    payload = json.dumps(data, ensure_ascii=False)

    if MQTT_DRY_RUN:
        print("\n======================================")
        print("[MQTT DRY RUN]")
        print(f"Topic: {topic}")
        print("Payload:")
        print(json.dumps(data, ensure_ascii=False, indent=2))
        print("======================================")
        return True

    result = client.publish(
        topic,
        payload,
        qos=1
    )

    result.wait_for_publish()
    print(f"[MQTT] Da gui: {topic}")

    return True


def build_snapshot_url(snapshot_path):
    filename = Path(snapshot_path).name
    return f"{PUBLIC_BASE_URL}/snapshots/{filename}"


# ============================================================
# FALL / SAFE
# ============================================================

def publish_fall(snapshot_path, confidence=None):
    # Node-RED cần đường dẫn file thật trên máy chạy AI
    absolute_path = str(Path(snapshot_path).resolve())

    # Backend/Web dùng URL HTTP để mở snapshot
    snapshot_url = build_snapshot_url(absolute_path)

    data = {
        "deviceId": DEVICE_ID,
        "detected": True,
        "severity": "critical",
        "image_path": absolute_path,
        "snapshotPath": snapshot_url,
        "status": "new",
        "timestamp": current_timestamp()
    }

    if confidence is not None:
        data["confidence"] = round(float(confidence), 3)

    # Một sự kiện FALL được gửi cho cả Node-RED và Backend
    publish_message(MQTT_TOPIC_NODE_RED_FALL, data)
    publish_message(MQTT_TOPIC_BACKEND_FALL, data)

    return data


def publish_safe():
    data = {
        "deviceId": DEVICE_ID,
        "detected": False,
        "status": "safe",
        "timestamp": current_timestamp()
    }

    publish_message(MQTT_TOPIC_NODE_RED_SAFE, data)
    return data


def disconnect_mqtt():
    if MQTT_DRY_RUN:
        return

    client.loop_stop()
    client.disconnect()

    print("[MQTT] Da ngat ket noi")