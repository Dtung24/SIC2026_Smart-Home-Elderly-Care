# AI Vision - Smart Home Elderly Care

Module AI Computer Vision cho hệ thống Smart Home Elderly Care.

## Chức năng

- Nhận hình ảnh từ USB Camera
- Chạy YOLOv8n-Pose bằng ONNX
- Phát hiện tư thế người
- Fall Detection V1 dựa trên:
  - góc thân người
  - tỷ lệ bounding box W/H
  - thời gian duy trì tư thế nghi ngã
- Lưu snapshot khi xác nhận té ngã
- Phát video AI realtime qua FastAPI MJPEG
- Gửi cảnh báo FALL qua MQTT
- Gửi SAFE khi người quay lại tư thế an toàn

## Cấu trúc

```text
ai_vision/
├── fallandsnapshot.py
├── stream_server.py
├── mqtt_client.py
├── yolov8n-pose-320.onnx
├── requirements.txt
├── snapshots/
└── .gitignore