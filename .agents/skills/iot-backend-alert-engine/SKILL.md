---
name: iot-backend-alert-engine
description: >-
  Expert guide and procedures for developing the Node.js / Express backend, Mosquitto MQTT message handling, WebSocket real-time distribution, and Telegram Bot emergency dispatch service in the SIC2026 Elderly Care project. Use when handling telemetry ingestion, database storage, Rule Engine triggers, or Telegram photo alerts.
---

# IoT Backend & Multi-Channel Alert Engine Skill

This skill governs the central event broker, backend orchestration, data persistence, and sub-2-second emergency dispatch pipeline for the SIC2026 Smart Home Elderly Care project.

---

## 🎯 Key Specifications & Requirements
- **Latency Requirement**: Emergency pipeline (Event $\rightarrow$ Backend $\rightarrow$ Telegram Bot / Web Push) must execute in **$< 2.0\text{ seconds}$**.
- **Protocols**: Mosquitto MQTT (local edge broker), WebSockets (RFC 6455) for Web UI live streaming, HTTP REST for historical logs.
- **Telegram Alert Payload**: Multi-part message including bold Markdown alert status, timestamp, telemetry metrics, and snapshot photo.

---

## 📂 Sub-Documentation & References

- **MQTT Topic Architecture**: [references/mqtt_topic_hierarchy.md](references/mqtt_topic_hierarchy.md)
  - Complete list of publish/subscribe topics, QoS ratings, retention flags, and payload schemas.
- **Telegram Bot Alert Integration**: [references/telegram_alert_service.md](references/telegram_alert_service.md)
  - Telegram Bot API `sendPhoto` & `sendMessage` methods with automatic retry and rate-limit guard.
- **Node-RED Rule Engine**: [references/node_red_rules.md](references/node_red_rules.md)
  - Event correlation flows: triggering buzzer when fall or gas is detected.
- **Backend Server Template**: [examples/server_mqtt_websocket.js](examples/server_mqtt_websocket.js)
  - Production Node.js + Express + MQTT + WebSocket + Telegram Server script.

---

## 🚀 Quick Setup & Dependencies

```bash
cd backend
npm init -y
npm install express mqtt ws dotenv axios form-data cors
```

### Environment Variables (`.env`)
```env
PORT=5000
MQTT_BROKER_URL=mqtt://localhost:1883
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
TELEGRAM_CHAT_ID=-1001234567890
GAS_THRESHOLD_PPM=100
FALL_AUTO_BUZZER_DURATION=30
```
