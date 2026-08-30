"""
SIC 2026 - Smart Home Elderly Care System
Module: Edge AI Fall Detector Pipeline
Target: Raspberry Pi 5 (ONNX Runtime + YOLOv8-pose)
"""

import time
import math
import json
import base64
import cv2
import numpy as np
import paho.mqtt.client as mqtt
from ultralytics import YOLO

# Configuration
MQTT_BROKER = "localhost"
MQTT_PORT = 1883
MQTT_TOPIC_ALERT = "sic2026/ai/fall_event"
FALL_STILLNESS_THRESHOLD_SEC = 3.0
ASPECT_RATIO_FALL_THRESHOLD = 1.25
TRUNK_ANGLE_FALL_THRESHOLD = 60.0 # degrees

class FallDetectorNode:
    def __init__(self, model_path="yolov8n-pose.pt"):
        print("[AI] Initializing YOLOv8-pose model...")
        self.model = YOLO(model_path)
        
        # State tracking
        self.fall_candidate_start_time = None
        self.is_alarm_triggered = False
        
        # Setup MQTT
        self.mqtt_client = mqtt.Client("AI_Vision_Gateway")
        try:
            self.mqtt_client.connect(MQTT_BROKER, MQTT_PORT, 60)
            self.mqtt_client.loop_start()
            print("[MQTT] Connected to local broker.")
        except Exception as e:
            print(f"[MQTT] Warning: Could not connect to MQTT broker: {e}")

    def calculate_trunk_angle(self, keypoints):
        """Calculates spine angle with respect to the vertical axis."""
        # Left/Right Shoulder: 5, 6 | Left/Right Hip: 11, 12
        l_sh, r_sh = keypoints[5][:2], keypoints[6][:2]
        l_hip, r_hip = keypoints[11][:2], keypoints[12][:2]

        sh_conf = min(keypoints[5][2], keypoints[6][2])
        hip_conf = min(keypoints[11][2], keypoints[12][2])

        if sh_conf < 0.4 or hip_conf < 0.4:
            return None # Insufficient confidence

        mid_sh = ((l_sh[0] + r_sh[0]) / 2, (l_sh[1] + r_sh[1]) / 2)
        mid_hip = ((l_hip[0] + r_hip[0]) / 2, (l_hip[1] + r_hip[1]) / 2)

        dx = mid_sh[0] - mid_hip[0]
        dy = mid_sh[1] - mid_hip[1]

        if dx == 0 and dy == 0:
            return 0

        # Angle relative to vertical axis (0 deg is perfectly upright)
        angle_rad = math.atan2(abs(dx), abs(dy))
        return math.degrees(angle_rad)

    def trigger_fall_alert(self, frame, trunk_angle, aspect_ratio):
        print("[ALERT] EMERGENCY! FALL CONFIRMED! Dispatching alert...")
        
        # Encode snapshot to JPEG & Base64
        _, buffer = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        jpg_as_text = base64.b64encode(buffer).decode('utf-8')

        payload = {
            "event_type": "FALL_DETECTED",
            "timestamp": int(time.time()),
            "confidence": 0.95,
            "trunk_angle": round(trunk_angle, 1) if trunk_angle else 0,
            "aspect_ratio": round(aspect_ratio, 2),
            "image_base64": jpg_as_text
        }

        self.mqtt_client.publish(MQTT_TOPIC_ALERT, json.dumps(payload), qos=1)

    def process_frame(self, frame):
        results = self.model(frame, verbose=False, conf=0.5)
        now = time.time()
        fall_detected_in_frame = False
        detected_angle = 0
        aspect_ratio = 1.0

        for r in results:
            if r.keypoints is None or len(r.keypoints.data) == 0:
                continue

            kpts = r.keypoints.data[0].cpu().numpy()
            boxes = r.boxes.xyxy.cpu().numpy()

            if len(boxes) > 0:
                x1, y1, x2, y2 = boxes[0]
                w = max(1.0, x2 - x1)
                h = max(1.0, y2 - y1)
                aspect_ratio = w / h

                detected_angle = self.calculate_trunk_angle(kpts)

                is_geometric_fall = (aspect_ratio > ASPECT_RATIO_FALL_THRESHOLD)
                if detected_angle is not None:
                    is_geometric_fall = is_geometric_fall or (detected_angle > TRUNK_ANGLE_FALL_THRESHOLD)

                if is_geometric_fall:
                    fall_detected_in_frame = True

        # State Machine Validation
        if fall_detected_in_frame:
            if self.fall_candidate_start_time is None:
                self.fall_candidate_start_time = now
            elif (now - self.fall_candidate_start_time) >= FALL_STILLNESS_THRESHOLD_SEC:
                if not self.is_alarm_triggered:
                    self.trigger_fall_alert(frame, detected_angle, aspect_ratio)
                    self.is_alarm_triggered = True
        else:
            # Person stood up or recovered
            self.fall_candidate_start_time = None
            self.is_alarm_triggered = False

        return results[0].plot() if len(results) > 0 else frame

    def run(self):
        cap = cv2.VideoCapture(0)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

        print("[AI] Starting Fall Detection Loop...")
        try:
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break
                
                annotated_frame = self.process_frame(frame)
                cv2.imshow("SIC 2026 - Elderly Care Vision AI", annotated_frame)

                if cv2.waitKey(1) & 0xFF == ord('q'):
                    break
        finally:
            cap.release()
            cv2.destroyAllWindows()
            self.mqtt_client.loop_stop()

if __name__ == "__main__":
    detector = FallDetectorNode()
    detector.run()
