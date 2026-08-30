# ESP32 FreeRTOS Dual-Core Architecture & Best Practices

ESP32 contains two Xtensa 32-bit LX6 cores (Core 0 and Core 1). By allocating tasks to separate cores and communicating via **FreeRTOS Queues**, we achieve deterministic real-time responsiveness without network latency interference.

---

## 1. Dual-Core Task Partitioning Strategy

| Core | Task Name | Priority | Stack Size | Purpose |
| :---: | :--- | :---: | :---: | :--- |
| **Core 0** | `Task_Network_MQTT` | 2 (Medium) | 4096 bytes | Manages Wi-Fi reconnect, MQTT client loop, and publishes sensor payloads from the Queue. |
| **Core 0** | `Task_Downlink_Handler` | 3 (High) | 3072 bytes | Processes incoming MQTT downlink commands (e.g. buzzer triggers). |
| **Core 1** | `Task_Sensor_Read` | 1 (Low-Med) | 3072 bytes | Periodic reading of DHT22 and analog averaging of MQ-2 gas sensor. |
| **Core 1** | `Task_Motion_ISR` | 4 (Urgent) | 2048 bytes | Handles immediate PIR motion state changes via hardware interrupt and binary semaphore. |

---

## 2. Inter-Task Communication (FreeRTOS Queue)

### Data Structure Definition (`SensorPayload_t`)
```cpp
typedef enum {
  MSG_ENVIRONMENTAL,
  MSG_MOTION_EVENT,
  MSG_GAS_EMERGENCY
} MessageType_t;

typedef struct {
  MessageType_t type;
  float temperature;
  float humidity;
  int gas_raw;
  bool gas_alert;
  bool motion_detected;
  uint32_t timestamp;
} SensorPayload_t;

QueueHandle_t xSensorQueue = NULL;
```

### Queue Initialization & Creation
```cpp
void setup() {
  // Create queue with capacity of 10 items
  xSensorQueue = xQueueCreate(10, sizeof(SensorPayload_t));
  if (xSensorQueue == NULL) {
    Serial.println("[ERROR] Failed to create FreeRTOS Queue!");
  }
}
```

---

## 3. Creating Pinned Tasks (`xTaskCreatePinnedToCore`)

```cpp
void setupTasks() {
  // Network Task on Core 0
  xTaskCreatePinnedToCore(
    vTaskNetworkMQTT,      // Task function
    "Task_Network",        // Name of task
    4096,                  // Stack size in words
    NULL,                  // Task input parameter
    2,                     // Priority of the task (0 = lowest)
    NULL,                  // Task handle
    0                      // Core ID: Core 0 (Protocol Core)
  );

  // Sensor Task on Core 1
  xTaskCreatePinnedToCore(
    vTaskSensorAcquisition,// Task function
    "Task_Sensors",        // Name of task
    3072,                  // Stack size in words
    NULL,                  // Task input parameter
    1,                     // Priority
    NULL,                  // Task handle
    1                      // Core ID: Core 1 (Application Core)
  );
}
```

---

## 4. Deterministic Periodic Execution (`vTaskDelayUntil`)
Avoid cumulative drift in periodic sensor measurements by using `vTaskDelayUntil`:

```cpp
void vTaskSensorAcquisition(void *pvParameters) {
  TickType_t xLastWakeTime = xTaskGetTickCount();
  const TickType_t xFrequency = pdMS_TO_TICKS(2000); // 2000ms period

  for (;;) {
    vTaskDelayUntil(&xLastWakeTime, xFrequency);

    SensorPayload_t data;
    data.type = MSG_ENVIRONMENTAL;
    data.temperature = dht.readTemperature();
    data.humidity = dht.readHumidity();
    data.gas_raw = readSmoothedMQ2(MQ2_PIN);
    data.gas_alert = (data.gas_raw > 1200);
    data.timestamp = millis() / 1000;

    // Send to Queue with 100ms timeout
    if (xQueueSend(xSensorQueue, &data, pdMS_TO_TICKS(100)) != pdPASS) {
      Serial.println("[WARN] Sensor Queue Full! Dropped item.");
    }
  }
}
```

---

## 5. Hardware Interrupt with FreeRTOS (`xQueueSendFromISR`)
For instantaneous PIR motion detection:

```cpp
SemaphoreHandle_t xMotionSemaphore = NULL;

void IRAM_ATTR pirMotionISR() {
  BaseType_t xHigherPriorityTaskWoken = pdFALSE;
  xSemaphoreGiveFromISR(xMotionSemaphore, &xHigherPriorityTaskWoken);
  portYIELD_FROM_ISR(xHigherPriorityTaskWoken);
}
```

---

## 6. Thread-Safe Mutex for Shared Actuators
If multiple tasks control the Buzzer or Status LED, protect the GPIO state with a FreeRTOS Mutex (`xSemaphoreCreateMutex`, `xSemaphoreTake`, `xSemaphoreGive`).
