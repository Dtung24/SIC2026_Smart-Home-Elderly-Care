#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>


const char* ssid = "Giang Khang";       
const char* password = "Aibietdau0507";       
const char* mqtt_server = "broker.hivemq.com"; 


#define MQ2_AO_PIN 35
#define PIR_PIN 13
#define DHTPIN1 26
#define DHTPIN2 27
#define DHTTYPE DHT11

DHT dht1(DHTPIN1, DHTTYPE);
DHT dht2(DHTPIN2, DHTTYPE);

WiFiClient espClient;
PubSubClient client(espClient);

unsigned long lastMsg = 0; 


void setup_wifi() {
  Serial.print("Đang kết nối WiFi...");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(" ✅ WiFi ĐÃ KẾT NỐI!");
}


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
  
  
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, HIGH); 
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

    
    float t1 = dht1.readTemperature();
    float t2 = dht2.readTemperature();
    int khoi_gas = analogRead(MQ2_AO_PIN); 
    int co_nguoi = digitalRead(PIR_PIN);

  
    if (khoi_gas > 1500 || t1 > 35.0) {
      tone(BUZZER_PIN, 2000);   !
      Serial.println("🚨 BÁO ĐỘNG: CỜI HÚ!");
    } else {
      noTone(BUZZER_PIN);       
      Serial.println("✅ AN TOÀN");
    }

    
    String payload = "{";
    payload += "\"nhiet_do_1\":" + String(t1) + ",";
    payload += "\"nhiet_do_2\":" + String(t2) + ",";
    payload += "\"muc_khoi\":" + String(khoi_gas) + ",";
    payload += "\"chuyen_dong\":" + String(co_nguoi);
    payload += "}";

    
    client.publish("du_an_samsung/canh_bao_nguoi_gia", payload.c_str());
    Serial.println(" Đã bắn lên Cloud: " + payload);
  }
}