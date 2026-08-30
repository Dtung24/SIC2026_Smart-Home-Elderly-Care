# ESP32 Pinout & MQTT Payload Specifications

## 1. Hardware Pinout Allocation (ESP32 DevKit V1 - 30 pins)

### Node 1: Sensor Hub (`node_sensors`)
| Component | Pin / Signal | ESP32 GPIO | Mode | Voltage & Wiring Notes |
| :--- | :--- | :--- | :--- | :--- |
| **DHT22** | DATA | `GPIO 4` | INPUT_PULLUP | 3.3V VCC, 4.7kΩ pull-up resistor to 3.3V |
| **MQ-2** | AOUT | `GPIO 34` (ADC1_CH6) | ANALOG INPUT | 5.0V VCC. **Must use voltage divider** (10kΩ & 20kΩ) -> Max 3.3V |
| **MQ-2** | DOUT | `GPIO 35` | DIGITAL INPUT | Optional digital threshold trigger |
| **HC-SR501 PIR** | OUT | `GPIO 14` | DIGITAL INPUT | 5.0V VCC (Internal regulator gives 3.3V HIGH output) |
| **Status LED** | Anode | `GPIO 2` | OUTPUT | Built-in Blue LED |

> [!WARNING]
> **ADC2 Warning**: Do NOT use ADC2 pins (GPIO 0, 2, 4, 12, 13, 14, 15, 25, 26, 27) for analog reads while Wi-Fi is active. Always use **ADC1 pins (GPIO 32 - 39)** for analog sensors like MQ-2.

---

### Node 2: Actuator Hub (`node_buzzer`)
| Component | Pin / Signal | ESP32 GPIO | Mode | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Active Buzzer** | Control (VCC/Transistor Base) | `GPIO 26` | OUTPUT | Driven via 2N2222 NPN Transistor or Optocoupler |
| **Emergency LED** | Anode (Red) | `GPIO 27` | OUTPUT | High intensity flashing during alarm |
| **Mute / Reset Button** | Signal | `GPIO 13` | INPUT_PULLUP | Hardware interrupt button to silence local buzzer |

---

## 2. MQTT Topic & JSON Payloads

### Topic: `sic2026/sensors/environment` (Periodic: 2000ms)
```json
{
  "node_id": "esp32_sensor_01",
  "timestamp": 1725000000,
  "temperature": 28.5,
  "humidity": 65.2,
  "gas_raw": 820,
  "gas_ppm_est": 45.0,
  "gas_alert": false
}
```

### Topic: `sic2026/sensors/motion` (Event-driven / 500ms)
```json
{
  "node_id": "esp32_sensor_01",
  "timestamp": 1725000000,
  "motion_detected": true,
  "last_motion_sec_ago": 0
}
```

### Topic: `sic2026/actuators/buzzer/cmd` (Downlink Command)
```json
{
  "action": "ALARM_TRIGGER",
  "reason": "FALL_DETECTED",
  "duration_sec": 30,
  "pattern": "FAST_BEEP"
}
```
*Actions:* `ALARM_TRIGGER`, `ALARM_STOP`, `TEST_BEEP`.

### Topic: `sic2026/system/status/esp32_sensor_01` (Retained + LWT)
```json
{
  "node_id": "esp32_sensor_01",
  "status": "online",
  "ip": "192.168.1.120",
  "rssi": -58,
  "uptime_sec": 3600
}
```
