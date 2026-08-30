# ESP32 Firmware Development Best Practices

## 1. Non-Blocking Timing & State Machine
In mission-critical healthcare systems, blocking functions (`delay()`, `while(!ready)`) cause packet drop and delayed alarms.

### Standard `millis()` Pattern
```cpp
unsigned long lastSensorRead = 0;
const unsigned long SENSOR_INTERVAL = 2000; // 2 seconds

void loop() {
  client.loop(); // Handle incoming MQTT packets
  
  unsigned long currentMillis = millis();
  if (currentMillis - lastSensorRead >= SENSOR_INTERVAL) {
    lastSensorRead = currentMillis;
    readAndPublishSensors();
  }
}
```

---

## 2. Robust Wi-Fi & MQTT Reconnection
Use non-blocking exponential backoff or periodic check rather than infinite blocking loops during reconnect.

```cpp
unsigned long lastReconnectAttempt = 0;

boolean reconnectMQTT() {
  if (client.connect("ESP32_SensorNode", MQTT_USER, MQTT_PASS, "sic2026/system/status/esp32_01", 1, true, "{\"status\":\"offline\"}")) {
    // Once connected, publish online status
    client.publish("sic2026/system/status/esp32_01", "{\"status\":\"online\"}", true);
    client.subscribe("sic2026/actuators/buzzer/cmd");
  }
  return client.connected();
}

void checkConnections() {
  if (WiFi.status() != WL_CONNECTED) {
    // Non-blocking WiFi reconnect handling
    WiFi.reconnect();
    return;
  }
  if (!client.connected()) {
    unsigned long now = millis();
    if (now - lastReconnectAttempt > 5000) {
      lastReconnectAttempt = now;
      if (reconnectMQTT()) {
        lastReconnectAttempt = 0;
      }
    }
  }
}
```

---

## 3. MQ-2 Sensor Calibration & Smoothing
The MQ-2 requires a burn-in period (preheating). Raw analog values fluctuate; apply a Moving Average Filter (EMA / Window filter) before checking threshold triggers.

```cpp
#define NUM_SAMPLES 10
int readSmoothedMQ2(int pin) {
  long sum = 0;
  for (int i = 0; i < NUM_SAMPLES; i++) {
    sum += analogRead(pin);
    delayMicroseconds(50);
  }
  return sum / NUM_SAMPLES;
}
```

---

## 4. Watchdog Timer (WDT)
Always enable ESP32 Hardware Task Watchdog to auto-recover if a memory deadlock occurs:
```cpp
#include <esp_task_wdt.h>
#define WDT_TIMEOUT 8 // 8 seconds timeout

void setup() {
  esp_task_wdt_init(WDT_TIMEOUT, true); // enable panic so ESP32 restarts
  esp_task_wdt_add(NULL); // add current thread to WDT watch
}

void loop() {
  esp_task_wdt_reset(); // feed the dog
  // normal operations
}
```
