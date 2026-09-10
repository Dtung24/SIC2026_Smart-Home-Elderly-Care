#include <Arduino.h>
#include <WiFi.h>
#include <WiFiManager.h>  // Thêm thư viện thần thánh này
#include <PubSubClient.h>
#include <DHT.h>

// --- THÔNG SỐ MQTT ---
const char* mqtt_server = "broker.hivemq.com"; 
// (Đã xóa ssid và password cũ)

// --- KHAI BÁO CHÂN GPIO ---
#define MQ2_AO_PIN 35
#define PIR_PIN 13          
#define LED_HALLWAY_PIN 14  
#define DHTPIN1 26          
#define DHTPIN2 27          
#define DHTTYPE DHT11
#define BUZZER_PIN 32 
#define BUZZER_CHANNEL 0

DHT dht_livingroom(DHTPIN1, DHTTYPE);
DHT dht_bedroom(DHTPIN2, DHTTYPE);

WiFiClient espClient;
PubSubClient client(espClient);

unsigned long lastMsg = 0; 

void setup_wifi() {
  // Khởi tạo WiFiManager
  WiFiManager wm;

  Serial.println("📡 Đang kết nối WiFi hoặc mở Access Point...");
  
  // Tạo Access Point tên là "ElderHome_Setup", pass là "12345678"
  // Hàm này sẽ tự động kết nối mạng cũ, nếu không có nó sẽ mở AP
  bool res = wm.autoConnect("ElderHome_Setup", "12345678");

  if(!res) {
    Serial.println("❌ Kết nối thất bại, đang khởi động lại...");
    ESP.restart();
  } 
  else {
    Serial.println("\n✅ WiFi ĐÃ KẾT NỐI THÀNH CÔNG!");
  }
}

void reconnect() {
  while (!client.connected()) {
    Serial.print("Đang kết nối Server MQTT...");
    String clientId = "ESP32_SS_Project_" + String(random(0xffff), HEX);
    if (client.connect(clientId.c_str())) {
      Serial.println(" ✅ MQTT KẾT NỐI THÀNH CÔNG!");
    } else {
      delay(5000);
    }
  }
}

void publishTelemetry(String room, String sensorType, float value, String unit, String alert) {
  String topic = "home/" + room + "/telemetry";
  String payload = "{";
  payload += "\"room\":\"" + room + "\",";
  payload += "\"sensorType\":\"" + sensorType + "\",";
  payload += "\"value\":" + String(value, 2) + ",";
  payload += "\"unit\":\"" + unit + "\",";
  payload += "\"alert\":\"" + alert + "\",";
  payload += "\"timestamp\":\"" + String(millis()) + "\"";
  payload += "}";

  client.publish(topic.c_str(), payload.c_str());
}

void setup() {
  Serial.begin(9600);
  
  ledcSetup(BUZZER_CHANNEL, 2000, 8);
  ledcAttachPin(BUZZER_PIN, BUZZER_CHANNEL);
  ledcWriteTone(BUZZER_CHANNEL, 0); 

  pinMode(PIR_PIN, INPUT);
  pinMode(LED_HALLWAY_PIN, OUTPUT);
  digitalWrite(LED_HALLWAY_PIN, LOW);
  
  dht_livingroom.begin();
  dht_bedroom.begin();
  
  // GỌI HÀM SETUP WIFI MỚI
  setup_wifi(); 
  client.setServer(mqtt_server, 1883); 
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop(); 

  int co_nguoi_hanh_lang = digitalRead(PIR_PIN);
  if (co_nguoi_hanh_lang == HIGH) {
    digitalWrite(LED_HALLWAY_PIN, HIGH);
  } else {
    digitalWrite(LED_HALLWAY_PIN, LOW);
  }

  unsigned long now = millis();
  if (now - lastMsg > 2000) { 
    lastMsg = now;

    float t_livingroom = dht_livingroom.readTemperature();
    float h_livingroom = dht_livingroom.readHumidity();
    float t_bedroom = dht_bedroom.readTemperature();
    float h_bedroom = dht_bedroom.readHumidity();
    int gas_kitchen = analogRead(MQ2_AO_PIN); 

    if (isnan(t_livingroom)) t_livingroom = 0.0;
    if (isnan(h_livingroom)) h_livingroom = 0.0;
    if (isnan(t_bedroom)) t_bedroom = 0.0;
    if (isnan(h_bedroom)) h_bedroom = 0.0;

    bool chay_kitchen = (gas_kitchen > 2200);
    bool chay_livingroom = (t_livingroom > 40.0);
    bool chay_bedroom = (t_bedroom > 40.0);

    String alert_living = chay_livingroom ? "FIRE" : "NONE";
    publishTelemetry("livingroom", "temperature", t_livingroom, "°C", alert_living);
    publishTelemetry("livingroom", "humidity", h_livingroom, "%", alert_living);

    String alert_bed = chay_bedroom ? "FIRE" : "NONE";
    publishTelemetry("bedroom", "temperature", t_bedroom, "°C", alert_bed);
    publishTelemetry("bedroom", "humidity", h_bedroom, "%", alert_bed);

    String alert_kit = chay_kitchen ? "FIRE" : "NONE";
    publishTelemetry("kitchen", "gas", gas_kitchen, "PPM", alert_kit);
    publishTelemetry("hallway", "motion", co_nguoi_hanh_lang, "boolean", "NONE");

    if (chay_kitchen || chay_livingroom || chay_bedroom) {
      ledcWriteTone(BUZZER_CHANNEL, 2000); 
      Serial.println("🚨 BÁO ĐỘNG CHÁY / GAS!");
    } else {
      ledcWriteTone(BUZZER_CHANNEL, 0); 
      Serial.println("✅ AN TOÀN");
    }
  }
}