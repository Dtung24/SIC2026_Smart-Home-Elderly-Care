# Backend - ElderHome AI

Backend Node.js/Express chạy trên Raspberry Pi. Module này nhận dữ liệu MQTT từ ESP32 và Camera AI, lưu MongoDB và phát REST API + Socket.IO cho Dashboard.

## Chức năng

- Nhận sensor từ 3 phòng: `livingroom`, `kitchen`, `bedroom`.
- Nhận cảnh báo té ngã từ camera ở phòng khách.
- Lưu telemetry và incident vào MongoDB Atlas.
- Phát dữ liệu realtime bằng Socket.IO.

## Cài đặt

```bash
npm install
cp .env.example .env
npm run dev
``` 

# Biến môi trường
    PORT=3000
    MQTT_URL=mqtt://localhost:1883
    MONGODB_URI=YOUR_MONGODB_CONNECTION_STRING

# MQTT Topics
    home/{room}/sensor/temperature
    home/{room}/sensor/humidity
    home/{room}/sensor/motion
    home/{room}/sensor/gas

    home/livingroom/alert/fall
    home/{room}/alert/gas

# REST API
    GET   /api/health
    GET   /api/telemetry/latest
    GET   /api/telemetry/history
    GET   /api/incidents
    PATCH /api/incidents/:id/status

# Socket.IO Events
    telemetry:latest
    telemetry:update
    alert:new
    device:status