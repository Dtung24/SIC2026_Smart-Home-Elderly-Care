/*
 * SIC 2026 - Smart Home Elderly Care System
 * Node 2: Actuator Hub (Active Buzzer & Red Alert Strobe)
 * Target: ESP32 DevKit V1
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

#define WIFI_SSID "SIC_SMART_HOME"
#define WIFI_PASS "SIC2026Password"
#define MQTT_BROKER "192.168.1.100"
#define MQTT_PORT 1883
#define MQTT_USER "esp32_buzzer"
#define MQTT_PASS "esp_secret"

#define BUZZER_PIN 26
#define RED_LED_PIN 27
#define MUTE_BUTTON_PIN 13

WiFiClient espClient;
PubSubClient mqttClient(espClient);

bool isAlarming = false;
unsigned long alarmStartTime = 0;
unsigned long alarmDuration = 30000; // 30 seconds default
unsigned long lastBeepToggle = 0;
bool beepState = false;

void callback(char* topic, byte* payload, unsigned int length) {
  StaticJsonDocument<256> doc;
  deserializeJson(doc, payload, length);

  const char* action = doc["action"];
  if (strcmp(action, "ALARM_TRIGGER") == 0) {
    isAlarming = true;
    alarmStartTime = millis();
    if (doc.containsKey("duration_sec")) {
      alarmDuration = doc["duration_sec"].as<unsigned long>() * 1000;
    }
    Serial.println("[ALARM] Emergency Triggered!");
  } else if (strcmp(action, "ALARM_STOP") == 0) {
    isAlarming = false;
    digitalWrite(BUZZER_PIN, LOW);
    digitalWrite(RED_LED_PIN, LOW);
    Serial.println("[ALARM] Alarm Silenced!");
  }
}

void handleAlarmSound() {
  if (!isAlarming) return;

  if (millis() - alarmStartTime > alarmDuration) {
    isAlarming = false;
    digitalWrite(BUZZER_PIN, LOW);
    digitalWrite(RED_LED_PIN, LOW);
    return;
  }

  // Fast beep & strobe effect (150ms ON / 150ms OFF)
  if (millis() - lastBeepToggle >= 150) {
    lastBeepToggle = millis();
    beepState = !beepState;
    digitalWrite(BUZZER_PIN, beepState ? HIGH : LOW);
    digitalWrite(RED_LED_PIN, beepState ? HIGH : LOW);
  }
}

void checkMuteButton() {
  if (digitalRead(MUTE_BUTTON_PIN) == LOW && isAlarming) {
    delay(50); // Debounce
    if (digitalRead(MUTE_BUTTON_PIN) == LOW) {
      isAlarming = false;
      digitalWrite(BUZZER_PIN, LOW);
      digitalWrite(RED_LED_PIN, LOW);
      mqttClient.publish("sic2026/actuators/buzzer/status", "{\"status\":\"MUTED_MANUALLY\"}");
    }
  }
}

void reconnect() {
  while (!mqttClient.connected()) {
    if (mqttClient.connect("ESP32_BuzzerNode", MQTT_USER, MQTT_PASS)) {
      mqttClient.subscribe("sic2026/actuators/buzzer/cmd");
      mqttClient.publish("sic2026/system/status/esp32_buzzer", "{\"status\":\"online\"}", true);
    } else {
      delay(3000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(RED_LED_PIN, OUTPUT);
  pinMode(MUTE_BUTTON_PIN, INPUT_PULLUP);

  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(RED_LED_PIN, LOW);

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(callback);
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    if (!mqttClient.connected()) {
      reconnect();
    }
    mqttClient.loop();
  }
  handleAlarmSound();
  checkMuteButton();
}
