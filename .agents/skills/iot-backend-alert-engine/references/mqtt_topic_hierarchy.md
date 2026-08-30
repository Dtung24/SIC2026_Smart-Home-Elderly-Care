# MQTT Topic Hierarchy & Message Routing

All topics in the system follow the strict namespace convention: `sic2026/<subsystem>/<target_or_sensor>/<action_or_type>`.

## 1. Topic Map & QoS Summary

| Topic | Publisher | Subscriber(s) | QoS | Retain | Purpose |
| :--- | :--- | :--- | :---: | :---: | :--- |
| `sic2026/sensors/environment` | ESP32 Sensor Node | Backend, Node-RED | 0 | False | Periodic DHT22 temp/hum & MQ-2 gas telemetry |
| `sic2026/sensors/motion` | ESP32 Sensor Node | Backend, Node-RED | 1 | False | PIR motion trigger events |
| `sic2026/ai/fall_event` | Camera AI Module | Backend, Telegram Service, Node-RED | 1 | False | Real-time emergency fall detection alert + image |
| `sic2026/actuators/buzzer/cmd` | Backend, Node-RED, Web UI | ESP32 Buzzer Node | 1 | False | Downlink commands (`ALARM_TRIGGER`, `ALARM_STOP`) |
| `sic2026/actuators/buzzer/status`| ESP32 Buzzer Node | Backend, Web UI | 1 | False | Local buzzer state / manual mute notification |
| `sic2026/system/status/+` | All Nodes (ESP32, AI, Gateway) | Backend, Web UI | 1 | True | Node health, RSSI, IP address, and LWT offline status |

---

## 2. Topic Payload Reference

### Fall Event Payload (`sic2026/ai/fall_event`)
```json
{
  "event_id": "fall_1725001234_abc",
  "event_type": "FALL_DETECTED",
  "timestamp": 1725001234,
  "confidence": 0.96,
  "trunk_angle": 74.5,
  "aspect_ratio": 1.48,
  "image_base64": "/9j/4AAQSkZJRgABAQAAAQABAAD/..."
}
```

### Gas Leak Alarm Payload (`sic2026/sensors/environment`)
When `gas_alert == true`, Backend immediately fires the buzzer trigger and dispatches a critical Telegram alert.
