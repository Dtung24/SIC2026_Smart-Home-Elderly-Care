# Raspberry Pi 5 Edge Gateway Provisioning & Auto-Start

The Raspberry Pi 5 runs **Raspberry Pi OS (64-bit Bookworm)** powered by the Broadcom BCM2712 Quad-Core Cortex-A76 processor @ 2.4GHz.

---

## 1. System Packages & Python Environment Setup
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y mosquitto mosquitto-clients python3-pip python3-venv python3-opencv nodejs npm

# Create isolated virtual environment for AI Vision on Bookworm
python3 -m venv /home/pi/elderly_env
/home/pi/elderly_env/bin/pip install --upgrade pip
/home/pi/elderly_env/bin/pip install ultralytics onnxruntime opencv-python-headless paho-mqtt
```

---

## 2. Mosquitto Broker Configuration (`/etc/mosquitto/conf.d/default.conf`)
```text
listener 1883
allow_anonymous true
persistence true
persistence_location /var/lib/mosquitto/
```
Enable & start Mosquitto:
```bash
sudo systemctl restart mosquitto
sudo systemctl enable mosquitto
```

---

## 3. Auto-Start Systemd Daemons for Pi 5

### AI Vision Service (`/etc/systemd/system/elderly-ai.service`)
```ini
[Unit]
Description=Elderly Care YOLOv8 AI Vision Fall Detector (Pi 5)
After=network.target mosquitto.service

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/SIC2026_Smart-Home-Elderly-Care/ai_vision
ExecStart=/home/pi/elderly_env/bin/python3 fall_detector.py
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

### Backend Service (`/etc/systemd/system/elderly-backend.service`)
```ini
[Unit]
Description=Elderly Care Backend Server (Pi 5)
After=network.target mosquitto.service

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/SIC2026_Smart-Home-Elderly-Care/backend
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Enable & activate services:
```bash
sudo systemctl daemon-reload
sudo systemctl enable elderly-ai.service elderly-backend.service
sudo systemctl start elderly-ai.service elderly-backend.service
```
