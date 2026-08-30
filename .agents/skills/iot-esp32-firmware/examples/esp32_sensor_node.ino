/*
 * SIC 2026 - Smart Home Elderly Care System
 * Node 1: Sensor Hub (DHT22, MQ-2, PIR HC-SR501)
 * Target: ESP32 DevKit V1
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <esp_task_wdt.h>

#define WIFI_SSID "SIC_SMART_HOME"
#define WIFI_PASS "SIC2026Password"
#define MQTT_BROKER "192.168.1.100" // Raspberry Pi 4 IP
#define MQTT_PORT 1883
#define MQTT_USER "esp32_sensor"
#define MQTT_PASS "esp_secret"

// Pin Definitions
#define DHTPIN 4
#define DHTTYPE DHT22
#define MQ2_ANALOG_PIN 34 // ADC1 pin
#define PIR_PIN 14
#define LED_PIN 2

#define WDT_TIMEOUT 10 // 10 seconds

DHT dht(DHTPIN, DHTTYPE);
WiFiClient espClient;
PubSubClient mqttClient(espClient);

unsigned long lastSensorPublish = 0;
const unsigned long SENSOR_INTERVAL = 2000; // 2000 ms
unsigned long lastReconnectAttempt = 0;
int lastPirState = LOW;

void setupWiFi() {
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
}

boolean reconnect() {
  if (mqttClient.connect("ESP32_SensorHub", MQTT_USER, MQTT_PASS, "sic2026/system/status/esp32_sensor", 1, true, "{\"node_id\":\"esp32_sensor\",\"status\":\"offline\"}")) {
    digitalWrite(LED_PIN, HIGH);
    mqttClient.publish("sic2026/system/status/esp32_sensor", "{\"node_id\":\"esp32_sensor\",\"status\":\"online\"}", true);
  }
  return mqttClient.connected();
}

int readSmoothedMQ2(int pin) {
  long sum = 0;
  for (int i = 0; i < 10; i++) {
    sum += analogRead(pin);
    delayMicroseconds(100);
  }
  return (int)(sum / 10);
}

void readAndPublishTelemetry() {
  float temp = dht.readTemperature();
  float hum = dht.readHumidity();
  int rawGas = readSmoothedMQ2(MQ2_ANALOG_PIN);

  if (isnan(temp) || isnan(hum)) {
    Serial.println("Failed to read from DHT22 sensor!");
    return;
  }

  StaticJsonDocument<256> doc;
  doc["node_id"] = "esp32_sensor_01";
  doc["timestamp"] = millis() / 1000;
  doc["temperature"] = serialized(String(temp, 1));
  doc["humidity"] = serialized(String(hum, 1));
  doc["gas_raw"] = rawGas;
  doc["gas_alert"] = (rawGas > 1200); // Configurable threshold

  char buffer[256];
  serializeJson(doc, buffer);
  mqttClient.publish("sic2026/sensors/environment", buffer);
}

void checkMotion() {
  int pirState = digitalRead(PIR_PIN);
  if (pirState != lastPirState) {
    lastPirState = pirState;
    StaticJsonDocument<128> doc;
    doc["node_id"] = "esp32_sensor_01";
    doc["timestamp"] = millis() / 1000;
    doc["motion_detected"] = (pirState == HIGH);
    
    char buffer[128];
    serializeJson(doc, buffer);
    mqttClient.publish("sic2026/sensors/motion", buffer);
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIR_PIN, INPUT);
  dht.begin();
  
  setupWiFi();
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  
  esp_task_wdt_init(WDT_TIMEOUT, true);
  esp_task_wdt_add(NULL);
}

void loop() {
  esp_task_wdt_reset();

  if (WiFi.status() == WL_CONNECTED) {
    if (!mqttClient.connected()) {
      unsigned long now = millis();
      if (now - lastReconnectAttempt > 5000) {
        lastReconnectAttempt = now;
        if (reconnect()) {
          lastReconnectAttempt = 0;
        }
      }
    } else {
      mqttClient.loop();
      checkMotion();

      unsigned long currentMillis = millis();
      if (currentMillis - lastSensorPublish >= SENSOR_INTERVAL) {
        lastSensorPublish = currentMillis;
        readAndPublishTelemetry();
      }
    }
  }
}
