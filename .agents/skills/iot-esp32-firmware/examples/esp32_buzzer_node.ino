/*
 * SIC 2026 - Smart Home Elderly Care System
 * Node 2: Actuator Hub (Active Buzzer & Red Alert Strobe)
 * Target: ESP32 DevKit V1 (FreeRTOS Dual-Core Architecture)
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

#define WIFI_SSID "SIC_SMART_HOME"
#define WIFI_PASS "SIC2026Password"
#define MQTT_BROKER "192.168.1.100" // Raspberry Pi 5 IP
#define MQTT_PORT 1883
#define MQTT_USER "esp32_buzzer"
#define MQTT_PASS "esp_secret"

#define BUZZER_PIN 26
#define RED_LED_PIN 27
#define MUTE_BUTTON_PIN 13

typedef struct {
  bool active;
  unsigned long duration_ms;
} AlarmCommand_t;

QueueHandle_t xAlarmQueue = NULL;
SemaphoreHandle_t xMuteSemaphore = NULL;
WiFiClient espClient;
PubSubClient mqttClient(espClient);

void IRAM_ATTR buttonMuteISR() {
  BaseType_t xHigherPriorityTaskWoken = pdFALSE;
  xSemaphoreGiveFromISR(xMuteSemaphore, &xHigherPriorityTaskWoken);
  portYIELD_FROM_ISR(xHigherPriorityTaskWoken);
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  StaticJsonDocument<256> doc;
  deserializeJson(doc, payload, length);

  const char* action = doc["action"];
  AlarmCommand_t cmd;

  if (strcmp(action, "ALARM_TRIGGER") == 0) {
    cmd.active = true;
    cmd.duration_ms = doc.containsKey("duration_sec") ? doc["duration_sec"].as<unsigned long>() * 1000 : 30000;
    xQueueSend(xAlarmQueue, &cmd, pdMS_TO_TICKS(50));
  } else if (strcmp(action, "ALARM_STOP") == 0) {
    cmd.active = false;
    cmd.duration_ms = 0;
    xQueueSend(xAlarmQueue, &cmd, pdMS_TO_TICKS(50));
  }
}

/* =========================================================================
 * CORE 1: Siren & Emergency Alarm Task (Sound & Strobe Timing)
 * ========================================================================= */
void vTaskAlarmController(void *pvParameters) {
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(RED_LED_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(RED_LED_PIN, LOW);

  bool isAlarming = false;
  unsigned long alarmStartTime = 0;
  unsigned long alarmDuration = 30000;
  bool toggleState = false;

  AlarmCommand_t receivedCmd;

  for (;;) {
    // Check for incoming alarm commands
    if (xQueueReceive(xAlarmQueue, &receivedCmd, 0) == pdTRUE) {
      if (receivedCmd.active) {
        isAlarming = true;
        alarmStartTime = millis();
        alarmDuration = receivedCmd.duration_ms;
        Serial.println("[ALARM] Emergency Siren Started!");
      } else {
        isAlarming = false;
        digitalWrite(BUZZER_PIN, LOW);
        digitalWrite(RED_LED_PIN, LOW);
        Serial.println("[ALARM] Emergency Siren Stopped!");
      }
    }

    // Check for manual mute button press
    if (xSemaphoreTake(xMuteSemaphore, 0) == pdTRUE) {
      vTaskDelay(pdMS_TO_TICKS(50)); // Debounce
      if (digitalRead(MUTE_BUTTON_PIN) == LOW && isAlarming) {
        isAlarming = false;
        digitalWrite(BUZZER_PIN, LOW);
        digitalWrite(RED_LED_PIN, LOW);
        Serial.println("[ALARM] Muted via physical button.");
      }
    }

    // Handle Beeping & Strobe pattern
    if (isAlarming) {
      if (millis() - alarmStartTime > alarmDuration) {
        isAlarming = false;
        digitalWrite(BUZZER_PIN, LOW);
        digitalWrite(RED_LED_PIN, LOW);
      } else {
        toggleState = !toggleState;
        digitalWrite(BUZZER_PIN, toggleState ? HIGH : LOW);
        digitalWrite(RED_LED_PIN, toggleState ? HIGH : LOW);
        vTaskDelay(pdMS_TO_TICKS(150)); // Fast beep 150ms
        continue;
      }
    }

    vTaskDelay(pdMS_TO_TICKS(50));
  }
}

/* =========================================================================
 * CORE 0: Network & MQTT Communication Task
 * ========================================================================= */
void vTaskNetwork(void *pvParameters) {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);

  unsigned long lastReconnect = 0;

  for (;;) {
    if (WiFi.status() == WL_CONNECTED) {
      if (!mqttClient.connected()) {
        unsigned long now = millis();
        if (now - lastReconnect > 4000) {
          lastReconnect = now;
          if (mqttClient.connect("ESP32_Buzzer_RTOS", MQTT_USER, MQTT_PASS)) {
            mqttClient.subscribe("sic2026/actuators/buzzer/cmd");
            mqttClient.publish("sic2026/system/status/esp32_buzzer", "{\"status\":\"online\"}", true);
          }
        }
      } else {
        mqttClient.loop();
      }
    }
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(MUTE_BUTTON_PIN, INPUT_PULLUP);

  xAlarmQueue = xQueueCreate(5, sizeof(AlarmCommand_t));
  xMuteSemaphore = xSemaphoreCreateBinary();

  attachInterrupt(digitalPinToInterrupt(MUTE_BUTTON_PIN), buttonMuteISR, FALLING);

  // Pin Tasks to Cores
  xTaskCreatePinnedToCore(vTaskNetwork, "Task_Network", 4096, NULL, 2, NULL, 0); // Core 0
  xTaskCreatePinnedToCore(vTaskAlarmController, "Task_Alarm", 2048, NULL, 3, NULL, 1); // Core 1
}

void loop() {
  vTaskDelete(NULL);
}
