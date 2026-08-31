#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>

// Cấu hình WiFi & MQTT Broker
const char* ssid = "Giang Khang";       
const char* password = "Aibietdau0507";       
const char* mqtt_server = "broker.hivemq.com"; 

// Khai báo chân Cảm biến & Còi (Gom gọn GPIO 32)
#define MQ2_AO_PIN 35
#define BUZZER_PIN 32  // Chuyển sang GPIO 32 cho gọn bên cắm dây
#define PIR_PIN 13
#define DHTPIN1 26
#define DHTPIN2 27
#define DHTTYPE DHT11

DHT dht1(DHTPIN1, DHTTYPE);
DHT dht2(DHTPIN2, DHTTYPE);

WiFiClient espClient;
PubSubClient client(espClient);

unsigned long lastMsg = 0; 

// Hàm kết nối WiFi
void setup_wifi() {
  Serial.print("Đang kết nối WiFi...");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(" ✅ WiFi ĐÃ KẾT NỐI!");
}

// Hàm duy trì kết nối MQTT
void reconnect() {
  while (!client.connected()) {
    Serial.print("Đang kết nối Server MQTT...");
    String clientId = "ESP32_SS_Project_" + String(random(0xffff), HEX);
    if (client.connect(clientId.c_str())) {
      Serial.println(" ✅ MQTT KẾT NỐI THÀNH CÔNG!");
    } else {
      Serial.print(" Lỗi! Thử lại sau 5s...");
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(9600);
  
  // Cấu hình Còi & Cảm biến
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, HIGH); // Mặc định TẮT còi khi mới cấp nguồn
  pinMode(PIR_PIN, INPUT);
  
  dht1.begin();
  dht2.begin();
  
  setup_wifi(); 
  client.setServer(mqtt_server, 1883); 
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop(); 

  unsigned long now = millis();
  if (now - lastMsg > 2000) {
    lastMsg = now;

    // Đọc dữ liệu cảm biến
    float t1 = dht1.readTemperature();
    float t2 = dht2.readTemperature();
    int khoi_gas = analogRead(MQ2_AO_PIN); 
    int co_nguoi = digitalRead(PIR_PIN);

   // LOGIC KÍCH CÒI DÙNG HÀM TẠO TẦN SỐ (Dành cho còi thụ động / còi 3 chân không chịu kêu)
    if (khoi_gas > 1500 || t1 > 35.0) {
      tone(BUZZER_PIN, 2000);   // Phát tần số 2000Hz để màng loa rung và hú lên!
      Serial.println("🚨 BÁO ĐỘNG: CỜI HÚ!");
    } else {
      noTone(BUZZER_PIN);       // Tắt tần số khi an toàn
      Serial.println("✅ AN TOÀN");
    }

    // Đóng gói JSON gửi lên Cloud
    String payload = "{";
    payload += "\"nhiet_do_1\":" + String(t1) + ",";
    payload += "\"nhiet_do_2\":" + String(t2) + ",";
    payload += "\"muc_khoi\":" + String(khoi_gas) + ",";
    payload += "\"chuyen_dong\":" + String(co_nguoi);
    payload += "}";

    // Publish dữ liệu
    client.publish("du_an_samsung/canh_bao_nguoi_gia", payload.c_str());
    Serial.println(" Đã bắn lên Cloud: " + payload);
  }
}