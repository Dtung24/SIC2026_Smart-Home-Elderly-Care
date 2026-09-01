#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>

// Thông số WiFi & MQTT Broker
const char* ssid = "Giang Khang";       
const char* password = "Aibietdau0507";       
const char* mqtt_server = "broker.hivemq.com"; 

// Khai báo Chân GPIO
#define MQ2_AO_PIN 35
#define PIR_PIN 13
#define DHTPIN1 26 // DHT1: Đặt tại phòng khách (livingroom)
#define DHTPIN2 27 // DHT2: Đặt tại phòng ngủ (bedroom)
#define DHTTYPE DHT11
#define BUZZER_PIN 32 
#define BUZZER_CHANNEL 0

DHT dht_livingroom(DHTPIN1, DHTTYPE);
DHT dht_bedroom(DHTPIN2, DHTTYPE);

WiFiClient espClient;
PubSubClient client(espClient);

unsigned long lastMsg = 0; 
unsigned long lastMotionTime = 0; 
const unsigned long NO_MOTION_THRESHOLD = 15000; // 15s bất động = Báo động ngã

void setup_wifi() {
  delay(10);
  WiFi.mode(WIFI_STA); 
  Serial.print("Đang kết nối WiFi...");
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n✅ WiFi ĐÃ KẾT NỐI!");
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

// Hàm bổ trợ gửi Telemetry chuẩn Socket Event Schema cho Backend
void publishTelemetry(String room, String sensorType, float value, String unit) {
  String topic = "home/" + room + "/telemetry";
  String payload = "{";
  payload += "\"room\":\"" + room + "\",";
  payload += "\"sensorType\":\"" + sensorType + "\",";
  payload += "\"value\":" + String(value, 2) + ",";
  payload += "\"unit\":\"" + unit + "\",";
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
  
  dht_livingroom.begin();
  dht_bedroom.begin();
  
  setup_wifi(); 
  client.setServer(mqtt_server, 1883); 
  
  lastMotionTime = millis(); 
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop(); 

  unsigned long now = millis();

  // 1. ĐỌC PIR PHÒNG KHÁCH (LIVINGROOM)
  int co_nguoi = digitalRead(PIR_PIN);
  if (co_nguoi == HIGH) {
    lastMotionTime = now; 
  }

  // 2. CHU KỲ BẮN DỮ LIỆU MỖI 2 GIÂY
  if (now - lastMsg > 2000) { 
    lastMsg = now;

    // Đọc cảm biến các phòng
    float t_livingroom = dht_livingroom.readTemperature();
    float h_livingroom = dht_livingroom.readHumidity();
    
    float t_bedroom = dht_bedroom.readTemperature();
    float h_bedroom = dht_bedroom.readHumidity();
    
    int gas_kitchen = analogRead(MQ2_AO_PIN); 

    if (isnan(t_livingroom)) t_livingroom = 0.0;
    if (isnan(h_livingroom)) h_livingroom = 0.0;
    if (isnan(t_bedroom)) t_bedroom = 0.0;
    if (isnan(h_bedroom)) h_bedroom = 0.0;

    // --- A. BẮN TELEMETRY PHÒNG KHÁCH (LIVINGROOM) ---
    publishTelemetry("livingroom", "temperature", t_livingroom, "°C");
    publishTelemetry("livingroom", "humidity", h_livingroom, "%");
    publishTelemetry("livingroom", "motion", co_nguoi, "boolean");

    // --- B. BẮN TELEMETRY PHÒNG NGỦ (BEDROOM) ---
    publishTelemetry("bedroom", "temperature", t_bedroom, "°C");
    publishTelemetry("bedroom", "humidity", h_bedroom, "%");

    // --- C. BẮN TELEMETRY NHÀ BẾP (KITCHEN) ---
    publishTelemetry("kitchen", "gas", gas_kitchen, "PPM");

    // --- D. XỬ LÝ CẢNH BÁO VÀ HÚ CÒI ---
    bool canh_bao_chay = (gas_kitchen > 2200 || t_livingroom > 40.0 || t_bedroom > 40.0);
    bool canh_bao_nga = ((now - lastMotionTime) > NO_MOTION_THRESHOLD); 

    if (canh_bao_chay) {
      ledcWriteTone(BUZZER_CHANNEL, 2000); 
      Serial.println("🚨 CANH BAO CHAY / GAS!");
    } 
    else if (canh_bao_nga) {
      ledcWriteTone(BUZZER_CHANNEL, 1000); 
      
      // Bắn Cảnh báo ngã lên Topic phòng khách riêng chuẩn Camera
      String fallPayload = "{\"room\":\"livingroom\",\"alert\":true,\"type\":\"FALL_DETECTED\"}";
      client.publish("home/livingroom/alert/fall", fallPayload.c_str());
      
      Serial.println("🚨 BÁO ĐỘNG NGÃ PHÒNG KHÁCH -> home/livingroom/alert/fall");
    } 
    else {
      ledcWriteTone(BUZZER_CHANNEL, 0); 
      Serial.println("✅ AN TOÀN");
    }
  }
}       