---
name: iot-esp32-firmware
description: >-
  Expert guide and procedures for developing, debugging, and maintaining ESP32 firmware in the SIC2026 Smart Home Elderly Care project. Use when writing C/C++ (Arduino/PlatformIO) code for sensor nodes (DHT22, MQ-2, PIR HC-SR501), buzzer actuators, WiFi/MQTT reconnection loops, and FreeRTOS task management.
---

# ESP32 FreeRTOS Firmware Engineering Skill (SIC2026 Elderly Care)

This skill guides the implementation of deterministic, real-time embedded firmware for ESP32 DevKit V1 microcontrollers using **FreeRTOS Dual-Core Multitasking** to communicate over MQTT with the Raspberry Pi 5 Edge Gateway.

---

## 📌 FreeRTOS Dual-Core Task Allocation

To ensure zero latency and prevent networking blocking from affecting mission-critical environmental and fall/motion alerts:

```text
┌────────────────────────────────────────┐   ┌────────────────────────────────────────┐
│        Core 0 (Networking Core)        │   │        Core 1 (Perception Core)        │
├────────────────────────────────────────┤   ├────────────────────────────────────────┤
│ • Task 1: Wi-Fi Reconnect & MQTT Loop  │   │ • Task 3: Sensor Acquisition (DHT/MQ2) │
│ • Task 2: MQTT Ingestion & Downlink Cmd│   │ • Task 4: PIR Motion ISR & Fast Event  │
└───────────────────┬────────────────────┘   └───────────────────▲────────────────────┘
                    │        📬 FreeRTOS Queue (SensorData_t)    │
                    └────────────────────────────────────────────┘
```

---

## 📂 Sub-Documentation & References

- **Pinout & MQTT Payloads**: [references/pinout_and_payloads.md](references/pinout_and_payloads.md)
  - Detailed GPIO allocation, voltage divider safety for 5V sensors, and JSON serialization schemas.
- **FreeRTOS & Firmware Best Practices**: [references/firmware_best_practices.md](references/firmware_best_practices.md)
  - `xTaskCreatePinnedToCore`, thread-safe `xQueueSend`/`xQueueReceive`, FreeRTOS Mutex, FreeRTOS Timer & ISR handlers (`xQueueSendFromISR`).
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
