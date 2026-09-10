#include <Arduino.h>
#include <WiFi.h>
#include <WiFiManager.h>
#include <PubSubClient.h> 
#include <DHT.h> 
#include "esp_system.h"

// --- IN LÝ DO RESET LẦN TRƯỚC (để chẩn đoán boot loop / brownout) ---
void printResetReason() {
  esp_reset_reason_t reason = esp_reset_reason();
  Serial.print("🔍 Lý do reset lần trước: ");
  switch (reason) {
    case ESP_RST_POWERON:  Serial.println("Cấp nguồn lần đầu (Power-on)"); break;
    case ESP_RST_EXT:      Serial.println("Reset từ chân EN/nút Reset ngoài"); break;
    case ESP_RST_SW:       Serial.println("Reset do phần mềm (ESP.restart())"); break;
    case ESP_RST_PANIC:    Serial.println("⚠️ PANIC / Exception - code bị crash"); break;
    case ESP_RST_INT_WDT:  Serial.println("⚠️ Interrupt Watchdog timeout"); break;
    case ESP_RST_TASK_WDT: Serial.println("⚠️ Task Watchdog timeout"); break;
    case ESP_RST_WDT:      Serial.println("⚠️ Watchdog khác"); break;
    case ESP_RST_BROWNOUT: Serial.println("⚠️⚠️ BROWNOUT - THIẾU NGUỒN ĐIỆN!"); break;
    default:                Serial.printf("Mã lý do: %d\n", (int)reason); break;
  }
}

// --- THÔNG SỐ MQTT BROKER ---
const char* mqtt_server = "broker.hivemq.com"; 

// --- KHAI BÁO CHÂN GPIO ---
#define MQ2_AO_PIN 35       // Cảm biến Gas Nhà bếp
#define PIR_PIN 13          // Cảm biến PIR Hành lang
#define LED_HALLWAY_PIN 14  // Đèn LED Hành lang
#define DHTPIN1 26          // DHT1: Phòng khách
#define DHTPIN2 27          // DHT2: Phòng ngủ
#define DHTTYPE DHT11
#define BUZZER_PIN 32       // Còi báo động
#define BUZZER_CHANNEL 0

DHT dht_livingroom(DHTPIN1, DHTTYPE);
DHT dht_bedroom(DHTPIN2, DHTTYPE);

WiFiClient espClient;
PubSubClient client(espClient);

unsigned long lastMsg = 0; 

// --- HÀM CẤU HÌNH WIFIMANAGER ---
void setup_wifi() {
  WiFiManager wm;

  // 🔧 FIX QUAN TRỌNG: một số board ESP32-S2/S3/C3 không tự bật radio WiFi
  // ở chế độ AP nếu không set mode tường minh trước khi gọi autoConnect().
  // Đây là nguyên nhân phổ biến nhất khiến AP "ElderHome_Setup" không hiện lên
  // dù resetSettings() đã chạy. Với ESP32 thường thì dòng này vô hại, cứ để luôn.
  WiFi.mode(WIFI_AP_STA);

  // Bật log chi tiết của WiFiManager ra Serial để dễ chẩn đoán khi có lỗi
  wm.setDebugOutput(true);

  // Nếu không cấu hình được trong 3 phút thì tự thoát cổng cấu hình và
  // quay lại loop (thay vì treo AP vĩnh viễn không rõ lý do)
  wm.setConfigPortalTimeout(180);

  // ⚠️ Xóa bộ nhớ WiFi cũ để ép phát AP "ElderHome_Setup" (Nên giữ khi test)
  // Sau khi demo xong có thể comment dấn // ở dòng dưới
  wm.resetSettings(); 

  Serial.println("📡 Đang phát Access Point: ElderHome_Setup ...");
  
  // Tên AP: ElderHome_Setup | Mật khẩu: 12345678
  bool res = wm.autoConnect("ElderHome_Setup", "12345678");

  if(!res) {
    Serial.println("❌ Kết nối thất bại, đang khởi động lại ESP32...");
    ESP.restart();
  } 
  else {
    Serial.println("\n✅ WiFi ĐÃ KẾT NỐI THÀNH CÔNG!");
  }
}

// --- HÀM RECONNECT MQTT ---
void reconnect() {
  while (!client.connected()) {
    Serial.print("Đang kết nối MQTT Broker...");
    String clientId = "ESP32_SS_Project_" + String(random(0xffff), HEX);
    if (client.connect(clientId.c_str())) {
      Serial.println(" ✅ KẾT NỐI MẠNG BẮN DATA NGON LÀNH!");
    } else {
      Serial.print("Thất bại, rc=");
      Serial.print(client.state());
      Serial.println(" -> Thử lại sau 5 giây...");
      delay(5000);
    }
  }
}

// --- HÀM GỬI TELEMETRY TỚI DASHBOARD WEB ---
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
  // 1. Mở Serial với Baud Rate 74880
  Serial.begin(74880); 
  delay(1000); 
  printResetReason();
  Serial.println("\n🚀 KHỞI ĐỘNG HỆ THỐNG ELDERHOME AI...");

  // 2. Ép kết nối/Phát WiFi ngay lập tức
  setup_wifi(); 

  // 3. Khởi tạo Còi hú Báo động
  ledcSetup(BUZZER_CHANNEL, 2000, 8);
  ledcAttachPin(BUZZER_PIN, BUZZER_CHANNEL);
  ledcWriteTone(BUZZER_CHANNEL, 0); 

  // 4. Khởi tạo GPIO Đèn & PIR Hành lang
  pinMode(PIR_PIN, INPUT);
  pinMode(LED_HALLWAY_PIN, OUTPUT);
  digitalWrite(LED_HALLWAY_PIN, LOW);
  
  // 5. Khởi tạo Cảm biến Nhiệt độ / Độ ẩm
  dht_livingroom.begin();
  dht_bedroom.begin();
  
  // 6. Cấu hình Server MQTT
  client.setServer(mqtt_server, 1883); 
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop(); 

  // 1. XỬ LÝ BẬT/TẮT ĐÈN HÀNH LANG TỨC THỜI (REAL-TIME)
  int co_nguoi_hanh_lang = digitalRead(PIR_PIN);
  if (co_nguoi_hanh_lang == HIGH) {
    digitalWrite(LED_HALLWAY_PIN, HIGH);
  } else {
    digitalWrite(LED_HALLWAY_PIN, LOW);
  }

  // 2. CHU KỲ ĐỌC CẢM BIẾN & BẮN DỮ LIỆU MỖI 2 GIÂY
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

    // Ngưỡng Báo Cháy / Khói Gas
    bool chay_kitchen = (gas_kitchen > 2200);
    bool chay_livingroom = (t_livingroom > 40.0);
    bool chay_bedroom = (t_bedroom > 40.0);

    // Bắn Dữ liệu Phòng Khách
    String alert_living = chay_livingroom ? "FIRE" : "NONE";
    publishTelemetry("livingroom", "temperature", t_livingroom, "°C", alert_living);
    publishTelemetry("livingroom", "humidity", h_livingroom, "%", alert_living);

    // Bắn Dữ liệu Phòng Ngủ
    String alert_bed = chay_bedroom ? "FIRE" : "NONE";
    publishTelemetry("bedroom", "temperature", t_bedroom, "°C", alert_bed);
    publishTelemetry("bedroom", "humidity", h_bedroom, "%", alert_bed);

    // Bắn Dữ liệu Nhà Bếp & Hành Lang
    String alert_kit = chay_kitchen ? "FIRE" : "NONE";
    publishTelemetry("kitchen", "gas", gas_kitchen, "PPM", alert_kit);
    publishTelemetry("hallway", "motion", co_nguoi_hanh_lang, "boolean", "NONE");

    // Bật Còi Hú khi phát hiện Sự cố
    if (chay_kitchen || chay_livingroom || chay_bedroom) {
      ledcWriteTone(BUZZER_CHANNEL, 2000); 
      Serial.println("🚨 CANH BAO CHAY / GAS!");
    } else {
      ledcWriteTone(BUZZER_CHANNEL, 0); 
      Serial.println("✅ AN TOÀN");
    }
  }
}
