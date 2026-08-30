/*
 * SIC 2026 - Smart Home Elderly Care System
 * Node 1: Sensor Hub (DHT22, MQ-2, PIR HC-SR501)
 * Target: ESP32 DevKit V1 (FreeRTOS Dual-Core Architecture)
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <esp_task_wdt.h>

// Wi-Fi & MQTT Configuration
#define WIFI_SSID "SIC_SMART_HOME"
#define WIFI_PASS "SIC2026Password"
#define MQTT_BROKER "192.168.1.100" // Raspberry Pi 5 IP
#define MQTT_PORT 1883
#define MQTT_USER "esp32_sensor"
#define MQTT_PASS "esp_secret"

// Hardware Pin Definitions
#define DHTPIN 4
#define DHTTYPE DHT22
#define MQ2_PIN 34 // ADC1 pin (3.3V via voltage divider)
#define PIR_PIN 14
#define LED_PIN 2

#define WDT_TIMEOUT 8 // 8 seconds

// Data Structures for Inter-Task Communication
typedef enum {
  MSG_ENVIRONMENTAL,
  MSG_MOTION_EVENT
} MsgType_t;

typedef struct {
  MsgType_t type;
  float temperature;
  float humidity;
  int gas_raw;
  bool gas_alert;
  bool motion_detected;
  uint32_t timestamp;
} SensorData_t;

// FreeRTOS Handles
QueueHandle_t xSensorQueue = NULL;
SemaphoreHandle_t xMotionSemaphore = NULL;
DHT dht(DHTPIN, DHTTYPE);
WiFiClient espClient;
PubSubClient mqttClient(espClient);

// PIR Hardware Interrupt Service Routine (ISR)
void IRAM_ATTR pirISR() {
  BaseType_t xHigherPriorityTaskWoken = pdFALSE;
  xSemaphoreGiveFromISR(xMotionSemaphore, &xHigherPriorityTaskWoken);
  portYIELD_FROM_ISR(xHigherPriorityTaskWoken);
}

// MQ-2 ADC Sample Averaging
int readSmoothedMQ2(int pin) {
  long sum = 0;
  for (int i = 0; i < 10; i++) {
    sum += analogRead(pin);
    delayMicroseconds(50);
  }
  return (int)(sum / 10);
}

/* =========================================================================
 * CORE 1: Perception & Sensor Acquisition Task
 * ========================================================================= */
void vTaskSensorAcquisition(void *pvParameters) {
  TickType_t xLastWakeTime = xTaskGetTickCount();
  const TickType_t xPeriod = pdMS_TO_TICKS(2000); // 2000ms

  for (;;) {
    vTaskDelayUntil(&xLastWakeTime, xPeriod);

    float t = dht.readTemperature();
    float h = dht.readHumidity();
    int gas = readSmoothedMQ2(MQ2_PIN);

    if (!isnan(t) && !isnan(h)) {
      SensorData_t data;
      data.type = MSG_ENVIRONMENTAL;
      data.temperature = t;
      data.humidity = h;
      data.gas_raw = gas;
      data.gas_alert = (gas > 1200);
      data.motion_detected = false;
      data.timestamp = millis() / 1000;

      // Push into Queue for Network Core
      if (xQueueSend(xSensorQueue, &data, pdMS_TO_TICKS(100)) != pdPASS) {
        Serial.println("[WARN] Sensor Queue Full!");
      }
    }
  }
}

/* =========================================================================
 * CORE 1: PIR Motion Event Task (Interrupt-Driven)
 * ========================================================================= */
void vTaskMotionHandler(void *pvParameters) {
  int lastState = LOW;
  for (;;) {
    if (xSemaphoreTake(xMotionSemaphore, portMAX_DELAY) == pdTRUE) {
      int currentState = digitalRead(PIR_PIN);
      if (currentState != lastState) {
        lastState = currentState;
        SensorData_t data;
        data.type = MSG_MOTION_EVENT;
        data.motion_detected = (currentState == HIGH);
        data.timestamp = millis() / 1000;

        xQueueSend(xSensorQueue, &data, pdMS_TO_TICKS(50));
      }
      vTaskDelay(pdMS_TO_TICKS(100)); // Debounce
    }
  }
}

/* =========================================================================
 * CORE 0: Network & MQTT Communication Task
 * ========================================================================= */
void vTaskNetworkMQTT(void *pvParameters) {
  esp_task_wdt_init(WDT_TIMEOUT, true);
  esp_task_wdt_add(NULL);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);

  SensorData_t receivedData;
  unsigned long lastReconnect = 0;

  for (;;) {
    esp_task_wdt_reset();

    // Check Wi-Fi and MQTT Connectivity
    if (WiFi.status() == WL_CONNECTED) {
      if (!mqttClient.connected()) {
        unsigned long now = millis();
        if (now - lastReconnect > 4000) {
          lastReconnect = now;
          if (mqttClient.connect("ESP32_Sensor_RTOS", MQTT_USER, MQTT_PASS,
                                "sic2026/system/status/esp32_sensor", 1, true,
                                "{\"node_id\":\"esp32_sensor\",\"status\":\"offline\"}")) {
            digitalWrite(LED_PIN, HIGH);
            mqttClient.publish("sic2026/system/status/esp32_sensor", "{\"node_id\":\"esp32_sensor\",\"status\":\"online\"}", true);
          }
        }
      } else {
        mqttClient.loop();

        // Process Queue Messages from Core 1
        if (xQueueReceive(xSensorQueue, &receivedData, pdMS_TO_TICKS(50)) == pdTRUE) {
          StaticJsonDocument<256> doc;
          char payloadBuffer[256];

          if (receivedData.type == MSG_ENVIRONMENTAL) {
            doc["node_id"] = "esp32_sensor_01";
            doc["timestamp"] = receivedData.timestamp;
            doc["temperature"] = serialized(String(receivedData.temperature, 1));
            doc["humidity"] = serialized(String(receivedData.humidity, 1));
            doc["gas_raw"] = receivedData.gas_raw;
            doc["gas_alert"] = receivedData.gas_alert;

            serializeJson(doc, payloadBuffer);
            mqttClient.publish("sic2026/sensors/environment", payloadBuffer);
          } 
          else if (receivedData.type == MSG_MOTION_EVENT) {
            doc["node_id"] = "esp32_sensor_01";
            doc["timestamp"] = receivedData.timestamp;
            doc["motion_detected"] = receivedData.motion_detected;

            serializeJson(doc, payloadBuffer);
            mqttClient.publish("sic2026/sensors/motion", payloadBuffer);
          }
        }
      }
    }
    vTaskDelay(pdMS_TO_TICKS(10)); // Yield
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  pinMode(PIR_PIN, INPUT);
  dht.begin();

  // Create FreeRTOS Primitives
  xSensorQueue = xQueueCreate(10, sizeof(SensorData_t));
  xMotionSemaphore = xSemaphoreCreateBinary();

  // Attach Interrupt for PIR
  attachInterrupt(digitalPinToInterrupt(PIR_PIN), pirISR, CHANGE);

  // Pin Tasks to Cores
  xTaskCreatePinnedToCore(vTaskNetworkMQTT, "Task_Network", 4096, NULL, 2, NULL, 0); // Core 0
  xTaskCreatePinnedToCore(vTaskSensorAcquisition, "Task_Sensors", 3072, NULL, 1, NULL, 1); // Core 1
  xTaskCreatePinnedToCore(vTaskMotionHandler, "Task_Motion", 2048, NULL, 3, NULL, 1); // Core 1
}

void loop() {
  // FreeRTOS handles scheduling; loop remains empty or performs idle checks
  vTaskDelete(NULL);
}
