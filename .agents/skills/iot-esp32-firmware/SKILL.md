---
name: iot-esp32-firmware
description: >-
  Expert guide and procedures for developing, debugging, and maintaining ESP32 firmware in the SIC2026 Smart Home Elderly Care project. Use when writing C/C++ (Arduino/PlatformIO) code for sensor nodes (DHT22, MQ-2, PIR HC-SR501), buzzer actuators, WiFi/MQTT reconnection loops, and FreeRTOS task management.
---

# ESP32 Firmware Engineering Skill (SIC2026 Elderly Care)

This skill guides the implementation of rock-solid embedded firmware for ESP32 DevKit V1 microcontrollers communicating over MQTT with the Raspberry Pi 5 Edge Gateway.

---

## 📌 Architecture & Node Roles

The project deploys two dedicated ESP32 nodes:
1. **Node 1 - Sensor Hub (`node_sensors`)**:
   - **DHT22** (GPIO 4): Ambient temperature & humidity monitoring.
   - **MQ-2** (GPIO 34 - ADC1): LPG / Smoke / Gas leakage detection.
   - **PIR HC-SR501** (GPIO 14): Indoor movement & presence detection.
2. **Node 2 - Actuator / Alarm (`node_buzzer`)**:
   - **Active Buzzer** (GPIO 26 / 27): Local high-decibel alarm (85-90 dB).
   - **Status LED** (GPIO 2): Network & arming status indication.

---

## 📂 Sub-Documentation & References

- **Pinout & MQTT Payloads**: [references/pinout_and_payloads.md](references/pinout_and_payloads.md)
  - Detailed GPIO allocation, voltage divider safety for 5V sensors, and JSON serialization schemas.
- **Firmware Best Practices**: [references/firmware_best_practices.md](references/firmware_best_practices.md)
  - Non-blocking `millis()` timing, FreeRTOS tasks, Wi-Fi Auto-reconnect, MQTT Keep-Alive & LWT (Last Will and Testament).
- **Code Templates**:
  - Sensor Hub: [examples/esp32_sensor_node.ino](examples/esp32_sensor_node.ino)
  - Buzzer Node: [examples/esp32_buzzer_node.ino](examples/esp32_buzzer_node.ino)

---

## ⚙️ Standard Development Workflow

### 1. Library Dependencies (PlatformIO / Arduino IDE)
- `PubSubClient` (v2.8+) by Nick O'Leary
- `ArduinoJson` (v6.21+ / v7.x) by Benoit Blanchon
- `DHT sensor library` by Adafruit + `Adafruit Unified Sensor`

### 2. Mandatory Firmware Rules
- ❌ **Never use blocking `delay()` in `loop()`**; use `millis()` timers or FreeRTOS `vTaskDelay`.
- ⚠️ **ADC Safety**: MQ-2 analog out produces 0–5V. Use a voltage divider (e.g. 10kΩ / 20kΩ) to protect ESP32 3.3V ADC inputs (use ADC1 channels GPIO 32-39; avoid ADC2 when Wi-Fi is active).
- 🔄 **Auto-reconnect Loop**: Implement non-blocking Wi-Fi & MQTT reconnect logic with exponential backoff.
- 📡 **Telemetry Interval**: Standard telemetry publishing at **2000ms**; immediate interrupt publishing upon MQ-2 threshold breach or PIR motion trigger.
- 🛡️ **Last Will & Testament (LWT)**: Configure MQTT LWT on `sic2026/system/status/<node_id>` to broadcast `"offline"` when connection drops unexpectedly.
