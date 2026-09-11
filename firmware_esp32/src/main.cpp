#include <Arduino.h>
#include <WiFi.h>
#include <WiFiManager.h>
#include <PubSubClient.h>
#include <Preferences.h>
#include <DHT.h>
#include "esp_system.h"

// ============================================================
// ELDERHOME / TAM AN - ESP32 FIRMWARE
// Khu vực:
//   - Phòng khách
//   - Phòng bếp
//   - Cầu thang
// ============================================================

// ---------------- GPIO ----------------

// Giữ nguyên các chân cảm biến đã lắp trên breadboard
#define MQ2_AO_PIN 35

#define PIR_STAIR_PIN 13

#define DHTPIN_LIVINGROOM 26
#define DHTPIN_KITCHEN 27
#define DHTTYPE DHT11

#define BUZZER_PIN 32
#define BUZZER_CHANNEL 0

// LED
#define LED_STAIR_PIN 14
#define LED_LIVINGROOM_PIN 25
#define LED_KITCHEN_PIN 33

// ---------------- THRESHOLD ----------------

#define GAS_THRESHOLD_RAW 2200
#define TEMP_FIRE_THRESHOLD 40.0

// Đèn cầu thang giữ sáng 30 giây sau lần phát hiện chuyển động cuối
#define STAIR_LIGHT_HOLD_MS 30000UL

// Nếu Wi-Fi mất liên tục 30 giây -> restart.
// Sau restart WiFiManager sẽ thử mạng cũ;
// nếu không được sẽ tự phát ElderHome_Setup.
#define WIFI_LOST_RESTART_MS 30000UL

// MQTT reconnect mỗi 5 giây, không block loop()
#define MQTT_RETRY_MS 5000UL

// ---------------- WIFI MANAGER ----------------

const char* CONFIG_AP_SSID = "ElderHome_Setup";
const char* CONFIG_AP_PASSWORD = "12345678";

Preferences preferences;

// MQTT broker được lưu trong NVS
char mqtt_server[64] = "";
const uint16_t MQTT_PORT = 1883;

bool shouldSaveParams = false;

// ---------------- OBJECTS ----------------

DHT dht_livingroom(DHTPIN_LIVINGROOM, DHTTYPE);
DHT dht_kitchen(DHTPIN_KITCHEN, DHTTYPE);

WiFiClient espClient;
PubSubClient client(espClient);

// ---------------- DEVICE ----------------

String deviceId = "esp32-elderhome";

// ---------------- TIMERS ----------------

unsigned long lastTelemetryMs = 0;
unsigned long lastMqttAttemptMs = 0;
unsigned long wifiLostSinceMs = 0;
unsigned long lastStairMotionMs = 0;

// ---------------- LIGHT STATE ----------------

bool livingroomLedOn = false;
bool kitchenLedOn = false;
bool stairLedOn = false;

enum StairLightMode {
  STAIR_AUTO,
  STAIR_MANUAL_ON,
  STAIR_MANUAL_OFF
};

StairLightMode stairMode = STAIR_AUTO;

// ---------------- ALARM STATE ----------------

bool fallAlarmActive = false;
bool remoteGasAlarmActive = false;
bool localHazardActive = false;

// ============================================================
// RESET REASON
// ============================================================

void printResetReason() {
  esp_reset_reason_t reason = esp_reset_reason();

  Serial.print("[RESET] Ly do reset lan truoc: ");

  switch (reason) {
    case ESP_RST_POWERON:
      Serial.println("Power-on");
      break;

    case ESP_RST_EXT:
      Serial.println("Nut reset / EN");
      break;

    case ESP_RST_SW:
      Serial.println("Software restart");
      break;

    case ESP_RST_PANIC:
      Serial.println("PANIC / Exception");
      break;

    case ESP_RST_INT_WDT:
      Serial.println("Interrupt Watchdog");
      break;

    case ESP_RST_TASK_WDT:
      Serial.println("Task Watchdog");
      break;

    case ESP_RST_WDT:
      Serial.println("Watchdog");
      break;

    case ESP_RST_BROWNOUT:
      Serial.println("BROWNOUT - thieu nguon");
      break;

    default:
      Serial.printf("Ma: %d\n", (int)reason);
      break;
  }
}

// ============================================================
// MQTT CONFIG PERSISTENCE
// ============================================================

void saveParamsCallback() {
  shouldSaveParams = true;
}

void loadMqttBroker() {
  preferences.begin("elderhome", true);

  String savedBroker =
      preferences.getString("mqtt_host", "");

  preferences.end();

  if (savedBroker.length() > 0) {
    savedBroker.toCharArray(
        mqtt_server,
        sizeof(mqtt_server)
    );
  }
}

void saveMqttBroker(const char* broker) {
  if (broker == nullptr || strlen(broker) == 0) {
    return;
  }

  preferences.begin("elderhome", false);
  preferences.putString("mqtt_host", broker);
  preferences.end();

  Serial.print("[CONFIG] Da luu MQTT Broker: ");
  Serial.println(broker);
}

// ============================================================
// WIFI MANAGER
// ============================================================

void setupWiFi() {
  loadMqttBroker();

  WiFi.mode(WIFI_AP_STA);
  WiFi.setAutoReconnect(true);

  WiFiManager wm;

  wm.setDebugOutput(true);
  wm.setConfigPortalTimeout(180);
  wm.setSaveParamsCallback(saveParamsCallback);

  WiFiManagerParameter mqttParam(
      "mqtt",
      "MQTT Broker IP (Raspberry Pi)",
      mqtt_server,
      63
  );

  wm.addParameter(&mqttParam);

  bool connected = false;

  // Nếu chưa từng lưu MQTT Broker thì bắt buộc mở Portal
  // để người dùng nhập IP Raspberry Pi.
  if (strlen(mqtt_server) == 0) {
    Serial.println();
    Serial.println("[WIFI] Chua co MQTT Broker.");
    Serial.println("[WIFI] Dang mo Access Point ElderHome_Setup...");
    Serial.println("[WIFI] Ket noi AP va mo 192.168.4.1");

    connected = wm.startConfigPortal(
        CONFIG_AP_SSID,
        CONFIG_AP_PASSWORD
    );
  } else {
    Serial.println();
    Serial.println("[WIFI] Dang thu Wi-Fi da luu...");

    // Nếu không kết nối được mạng cũ,
    // WiFiManager tự chuyển sang Access Point.
    connected = wm.autoConnect(
        CONFIG_AP_SSID,
        CONFIG_AP_PASSWORD
    );
  }

  if (!connected) {
    Serial.println(
        "[WIFI] Cau hinh that bai / timeout -> restart"
    );

    delay(1000);
    ESP.restart();
  }

  const char* enteredBroker = mqttParam.getValue();

  if (enteredBroker != nullptr &&
      strlen(enteredBroker) > 0) {

    strncpy(
        mqtt_server,
        enteredBroker,
        sizeof(mqtt_server) - 1
    );

    mqtt_server[sizeof(mqtt_server) - 1] = '\0';

    if (shouldSaveParams) {
      saveMqttBroker(mqtt_server);
    }
  }

  // Không cho chạy tiếp nếu vẫn chưa có broker
  if (strlen(mqtt_server) == 0) {
    Serial.println(
        "[CONFIG] Chua nhap MQTT Broker -> restart"
    );

    delay(1500);
    ESP.restart();
  }

  deviceId =
      "esp32-" + WiFi.macAddress();

  deviceId.replace(":", "");
  deviceId.toLowerCase();

  Serial.println();
  Serial.println("====================================");
  Serial.println("[WIFI] KET NOI THANH CONG");
  Serial.print("[WIFI] SSID: ");
  Serial.println(WiFi.SSID());

  Serial.print("[WIFI] ESP32 IP: ");
  Serial.println(WiFi.localIP());

  Serial.print("[MQTT] Broker: ");
  Serial.print(mqtt_server);
  Serial.print(":");
  Serial.println(MQTT_PORT);

  Serial.print("[DEVICE] ");
  Serial.println(deviceId);
  Serial.println("====================================");
}

// ============================================================
// LED HELPERS
// ============================================================

void publishLightState(
    const char* topic,
    bool state
) {
  if (!client.connected()) return;

  client.publish(
      topic,
      state ? "ON" : "OFF",
      true
  );
}

void publishStairMode() {
  if (!client.connected()) return;

  const char* mode = "AUTO";

  if (stairMode == STAIR_MANUAL_ON) {
    mode = "ON";
  } else if (stairMode == STAIR_MANUAL_OFF) {
    mode = "OFF";
  }

  client.publish(
      "home/esp32/light/staircase/mode",
      mode,
      true
  );
}

void setLivingroomLight(bool on) {
  if (livingroomLedOn == on) return;

  livingroomLedOn = on;

  digitalWrite(
      LED_LIVINGROOM_PIN,
      on ? HIGH : LOW
  );

  publishLightState(
      "home/esp32/light/livingroom/state",
      on
  );

  Serial.printf(
      "[LIGHT] Livingroom: %s\n",
      on ? "ON" : "OFF"
  );
}

void setKitchenLight(bool on) {
  if (kitchenLedOn == on) return;

  kitchenLedOn = on;

  digitalWrite(
      LED_KITCHEN_PIN,
      on ? HIGH : LOW
  );

  publishLightState(
      "home/esp32/light/kitchen/state",
      on
  );

  Serial.printf(
      "[LIGHT] Kitchen: %s\n",
      on ? "ON" : "OFF"
  );
}

void setStairLight(bool on) {
  if (stairLedOn == on) return;

  stairLedOn = on;

  digitalWrite(
      LED_STAIR_PIN,
      on ? HIGH : LOW
  );

  publishLightState(
      "home/esp32/light/staircase/state",
      on
  );

  Serial.printf(
      "[LIGHT] Staircase: %s\n",
      on ? "ON" : "OFF"
  );
}

void publishAllLightStates() {
  publishLightState(
      "home/esp32/light/livingroom/state",
      livingroomLedOn
  );

  publishLightState(
      "home/esp32/light/kitchen/state",
      kitchenLedOn
  );

  publishLightState(
      "home/esp32/light/staircase/state",
      stairLedOn
  );

  publishStairMode();
}

// ============================================================
// BUZZER
// ============================================================

void updateBuzzer() {
  // Mức ưu tiên:
  // 1. Gas / cháy -> 2000 Hz
  // 2. Té ngã      -> 1000 Hz
  // 3. An toàn     -> OFF

  if (localHazardActive ||
      remoteGasAlarmActive) {

    ledcWriteTone(
        BUZZER_CHANNEL,
        2000
    );

  } else if (fallAlarmActive) {

    ledcWriteTone(
        BUZZER_CHANNEL,
        1000
    );

  } else {

    ledcWriteTone(
        BUZZER_CHANNEL,
        0
    );
  }
}

// ============================================================
// MQTT CALLBACK
// ============================================================

void mqttCallback(
    char* topic,
    byte* payload,
    unsigned int length
) {
  String message;

  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }

  message.trim();
  message.toUpperCase();

  String topicStr(topic);

  Serial.print("[MQTT RX] ");
  Serial.print(topicStr);
  Serial.print(" -> ");
  Serial.println(message);

  // ----------------------------------------------------------
  // ALARM
  // ----------------------------------------------------------

  if (topicStr == "home/esp32/alarm") {

    if (message == "FALL_ALARM_ON") {
      fallAlarmActive = true;

    } else if (message == "GAS_ALARM_ON") {
      remoteGasAlarmActive = true;

    } else if (message == "ALARM_OFF") {
      fallAlarmActive = false;
      remoteGasAlarmActive = false;
    }

    updateBuzzer();
    return;
  }

  if (topicStr == "home/esp32/alarm/off") {
    fallAlarmActive = false;
    remoteGasAlarmActive = false;

    updateBuzzer();
    return;
  }

  // ----------------------------------------------------------
  // PHONG KHACH
  // ----------------------------------------------------------

  if (topicStr ==
      "home/esp32/light/livingroom/set") {

    if (message == "ON") {
      setLivingroomLight(true);

    } else if (message == "OFF") {
      setLivingroomLight(false);
    }

    return;
  }

  // ----------------------------------------------------------
  // PHONG BEP
  // ----------------------------------------------------------

  if (topicStr ==
      "home/esp32/light/kitchen/set") {

    if (message == "ON") {
      setKitchenLight(true);

    } else if (message == "OFF") {
      setKitchenLight(false);
    }

    return;
  }

  // ----------------------------------------------------------
  // CAU THANG
  // ----------------------------------------------------------

  if (topicStr ==
      "home/esp32/light/staircase/set") {

    if (message == "AUTO") {

      stairMode = STAIR_AUTO;

      int motion =
          digitalRead(PIR_STAIR_PIN);

      if (motion == HIGH) {
        lastStairMotionMs = millis();
        setStairLight(true);
      } else {
        setStairLight(false);
      }

    } else if (message == "ON") {

      stairMode = STAIR_MANUAL_ON;
      setStairLight(true);

    } else if (message == "OFF") {

      stairMode = STAIR_MANUAL_OFF;
      setStairLight(false);
    }

    publishStairMode();
    return;
  }
}

// ============================================================
// MQTT CONNECT
// ============================================================

void subscribeMqttTopics() {
  client.subscribe(
      "home/esp32/alarm",
      1
  );

  client.subscribe(
      "home/esp32/alarm/off",
      1
  );

  client.subscribe(
      "home/esp32/light/livingroom/set",
      1
  );

  client.subscribe(
      "home/esp32/light/kitchen/set",
      1
  );

  client.subscribe(
      "home/esp32/light/staircase/set",
      1
  );

  Serial.println(
      "[MQTT] Da subscribe alarm + light commands"
  );
}

void connectMqttIfNeeded() {
  if (client.connected()) {
    return;
  }

  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  unsigned long now = millis();

  if (now - lastMqttAttemptMs <
      MQTT_RETRY_MS) {
    return;
  }

  lastMqttAttemptMs = now;

  Serial.print("[MQTT] Dang ket noi ");
  Serial.print(mqtt_server);
  Serial.print(":");
  Serial.println(MQTT_PORT);

  // Dùng client ID cố định.
  // Tránh session MQTT cũ còn tồn tại và phát Last Will false muộn.
  String mqttClientId = deviceId;

  bool connected =
      client.connect(
          mqttClientId.c_str(),
          "home/esp32/status",
          1,
          true,
          "{\"online\":false}"
      );

  if (connected) {

    Serial.println(
        "[MQTT] KET NOI THANH CONG"
    );

    subscribeMqttTopics();

    client.publish(
        "home/esp32/status",
        "{\"online\":true}",
        true
    );

    publishAllLightStates();

  } else {

    Serial.print(
        "[MQTT] Ket noi that bai, state="
    );

    Serial.println(client.state());
  }
}

// ============================================================
// TELEMETRY
// ============================================================

void publishTelemetry(
    const String& room,
    const String& sensorType,
    float value,
    const String& unit,
    const String& alert
) {
  if (!client.connected()) {
    return;
  }

  String topic =
      "home/" +
      room +
      "/telemetry";

  String payload = "{";

  payload +=
      "\"deviceId\":\"" +
      deviceId +
      "\",";

  payload +=
      "\"room\":\"" +
      room +
      "\",";

  payload +=
      "\"sensorType\":\"" +
      sensorType +
      "\",";

  payload +=
      "\"value\":" +
      String(value, 2) +
      ",";

  payload +=
      "\"unit\":\"" +
      unit +
      "\",";

  payload +=
      "\"alert\":\"" +
      alert +
      "\",";

  payload +=
      "\"timestamp\":\"" +
      String(millis()) +
      "\"";

  payload += "}";

  client.publish(
      topic.c_str(),
      payload.c_str()
  );
}

// ============================================================
// PIR + STAIR LIGHT AUTO
// ============================================================

void handleStaircasePIR() {
  int motion =
      digitalRead(PIR_STAIR_PIN);

  // Chỉ PIR điều khiển khi cầu thang ở AUTO
  if (stairMode != STAIR_AUTO) {
    return;
  }

  unsigned long now = millis();

  if (motion == HIGH) {

    lastStairMotionMs = now;

    setStairLight(true);

  } else {

    if (stairLedOn &&
        lastStairMotionMs != 0 &&
        now - lastStairMotionMs >=
            STAIR_LIGHT_HOLD_MS) {

      setStairLight(false);
    }
  }
}

// ============================================================
// WIFI WATCHDOG
// ============================================================

void monitorWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    wifiLostSinceMs = 0;
    return;
  }

  if (wifiLostSinceMs == 0) {
    wifiLostSinceMs = millis();

    Serial.println(
        "[WIFI] Mat ket noi, dang cho reconnect..."
    );
  }

  if (millis() - wifiLostSinceMs >=
      WIFI_LOST_RESTART_MS) {

    Serial.println(
        "[WIFI] Mat mang qua lau -> restart de mo AP neu can"
    );

    delay(500);
    ESP.restart();
  }
}

// ============================================================
// SETUP
// ============================================================

void setup() {
  // Đồng bộ với platformio.ini
  Serial.begin(9600);

  delay(1000);

  Serial.println();
  Serial.println();
  Serial.println(
      "===================================="
  );
  Serial.println(
      " TAM AN HOME - ESP32 STARTING"
  );
  Serial.println(
      "===================================="
  );

  printResetReason();

  // ---------------- GPIO ----------------

  pinMode(
      PIR_STAIR_PIN,
      INPUT
  );

  pinMode(
      LED_STAIR_PIN,
      OUTPUT
  );

  pinMode(
      LED_LIVINGROOM_PIN,
      OUTPUT
  );

  pinMode(
      LED_KITCHEN_PIN,
      OUTPUT
  );

  // Mặc định tất cả đèn tắt lúc boot
  digitalWrite(
      LED_STAIR_PIN,
      LOW
  );

  digitalWrite(
      LED_LIVINGROOM_PIN,
      LOW
  );

  digitalWrite(
      LED_KITCHEN_PIN,
      LOW
  );

  // ---------------- BUZZER ----------------

  ledcSetup(
      BUZZER_CHANNEL,
      2000,
      8
  );

  ledcAttachPin(
      BUZZER_PIN,
      BUZZER_CHANNEL
  );

  ledcWriteTone(
      BUZZER_CHANNEL,
      0
  );

  // ---------------- DHT ----------------

  dht_livingroom.begin();
  dht_kitchen.begin();

  // ---------------- WIFI ----------------

  setupWiFi();

  // ---------------- MQTT ----------------

  client.setServer(
      mqtt_server,
      MQTT_PORT
  );

  // Tăng keepalive để kết nối ổn định hơn trên Wi-Fi.
  client.setKeepAlive(30);

  client.setCallback(
      mqttCallback
  );

  // Lần đầu sẽ được xử lý trong loop
  lastMqttAttemptMs =
      millis() - MQTT_RETRY_MS;

  Serial.println(
      "[SYSTEM] Khoi tao hoan tat"
  );
}

// ============================================================
// LOOP
// ============================================================

void loop() {
  monitorWiFi();

  connectMqttIfNeeded();

  if (client.connected()) {
    client.loop();
  }

  // PIR điều khiển đèn cầu thang ở AUTO
  handleStaircasePIR();

  // ----------------------------------------------------------
  // TELEMETRY MỖI 2 GIÂY
  // ----------------------------------------------------------

  unsigned long now = millis();

  if (now - lastTelemetryMs >= 2000) {
    lastTelemetryMs = now;

    float tLiving =
        dht_livingroom.readTemperature();

    float hLiving =
        dht_livingroom.readHumidity();

    float tKitchen =
        dht_kitchen.readTemperature();

    float hKitchen =
        dht_kitchen.readHumidity();

    int gasKitchen =
        analogRead(MQ2_AO_PIN);

    int stairMotion =
        digitalRead(PIR_STAIR_PIN);

    // Nếu DHT lỗi thì không chế số liệu giả.
    // Tạm gửi 0 để dễ nhìn lỗi khi test.
    if (isnan(tLiving)) {
      tLiving = 0.0;
    }

    if (isnan(hLiving)) {
      hLiving = 0.0;
    }

    if (isnan(tKitchen)) {
      tKitchen = 0.0;
    }

    if (isnan(hKitchen)) {
      hKitchen = 0.0;
    }

    bool gasDanger =
        gasKitchen > GAS_THRESHOLD_RAW;

    bool livingFire =
        tLiving > TEMP_FIRE_THRESHOLD;

    bool kitchenFire =
        tKitchen > TEMP_FIRE_THRESHOLD;

    localHazardActive =
        gasDanger ||
        livingFire ||
        kitchenFire;

    updateBuzzer();

    // ---------------- PHONG KHACH ----------------

    String livingAlert =
        livingFire ?
        "FIRE" :
        "NONE";

    publishTelemetry(
        "livingroom",
        "temperature",
        tLiving,
        "celsius",
        livingAlert
    );

    publishTelemetry(
        "livingroom",
        "humidity",
        hLiving,
        "percent",
        livingAlert
    );

    // ---------------- PHONG BEP ----------------

    String kitchenAlert =
        (gasDanger || kitchenFire) ?
        "DANGER" :
        "NONE";

    publishTelemetry(
        "kitchen",
        "temperature",
        tKitchen,
        "celsius",
        kitchenAlert
    );

    publishTelemetry(
        "kitchen",
        "humidity",
        hKitchen,
        "percent",
        kitchenAlert
    );

    // MQ-2 chưa hiệu chuẩn ppm:
    // đây là giá trị ADC thô.
    publishTelemetry(
        "kitchen",
        "gas",
        gasKitchen,
        "raw_adc",
        gasDanger ?
        "GAS" :
        "NONE"
    );

    // ---------------- CAU THANG ----------------

    publishTelemetry(
        "staircase",
        "motion",
        stairMotion,
        "boolean",
        "NONE"
    );

    // ---------------- DEBUG ----------------

    Serial.println();
    Serial.println(
        "-------- SENSOR --------"
    );

    Serial.printf(
        "Living: %.1f C | %.1f %%\n",
        tLiving,
        hLiving
    );

    Serial.printf(
        "Kitchen: %.1f C | %.1f %%\n",
        tKitchen,
        hKitchen
    );

    Serial.printf(
        "MQ2 raw: %d | threshold: %d\n",
        gasKitchen,
        GAS_THRESHOLD_RAW
    );

    Serial.printf(
        "Stair PIR: %s | LED: %s\n",
        stairMotion ?
        "MOTION" :
        "NO MOTION",
        stairLedOn ?
        "ON" :
        "OFF"
    );

    Serial.printf(
        "Lights -> Living:%s Kitchen:%s Stair:%s\n",
        livingroomLedOn ? "ON" : "OFF",
        kitchenLedOn ? "ON" : "OFF",
        stairLedOn ? "ON" : "OFF"
    );

    Serial.printf(
        "Alarm -> FALL:%s GAS_REMOTE:%s LOCAL:%s\n",
        fallAlarmActive ? "ON" : "OFF",
        remoteGasAlarmActive ? "ON" : "OFF",
        localHazardActive ? "ON" : "OFF"
    );
  }
}
