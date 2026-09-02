# Node-RED Flow — Automation & Alerts (ElderHome AI)

Flow Node-RED chạy trên Raspberry Pi, đóng vai trò "bộ não trung gian" xử lý sự kiện từ Camera AI (té ngã) và các cảm biến (gas, nhiệt độ/độ ẩm), sau đó:

- Bật còi cảnh báo trên ESP32 qua MQTT.
- Gửi cảnh báo khẩn cấp tới Telegram (kèm ảnh hiện trường nếu là té ngã).
- Tự huỷ báo động khi camera xác nhận người dùng đã an toàn, hoặc khi có lệnh tắt còi thủ công.

File flow: `flow1-automation-alerts-fixed.json`

## Kiến trúc luồng xử lý

```
[Camera AI] --MQTT--> home/camera/fall  ─┬─> function 1 (debounce 60s) ─┬─> mqtt out: home/esp32/alarm ("FALL_ALARM_ON")
                                          │                              └─> file in (đọc ảnh) → function 2 → Telegram (photo/text)
                                          │
[Camera AI] --MQTT--> home/camera/safe ──┴─> function 6 (huỷ báo động trong 5 phút kể từ lúc báo) ─┬─> mqtt out: ALARM_OFF
                                                                                                     └─> Telegram: "đã xác nhận an toàn"

[Cảm biến gas] --MQTT--> home/sensor/gas → switch (status == GAS_LEAK) → function 7 (debounce 60s)
                                                                            ├─> function 3 → Telegram
                                                                            └─> function 4 → mqtt out: GAS_ALARM_ON

[DHT22] --MQTT--> home/sensor/dht22 → function 5 (kiểm tra ngưỡng nhiệt độ/độ ẩm + debounce 60s) → Telegram (chỉ nhắc nhở, KHÔNG bật còi)

[App/người thân] --MQTT--> home/esp32/alarm/off → function 8 (reset toàn bộ cooldown) → mqtt out: ALARM_OFF
```

## MQTT Topics

### Subscribe (đầu vào)

| Topic | Nguồn gửi | Payload mẫu | Ghi chú |
|---|---|---|---|
| `home/camera/fall` | Camera AI | `{ "image_path": "/path/anh.jpg" }` | Đã được AI xác nhận té ngã (qua ngưỡng bất động), Node-RED không xử lý lại logic AI |
| `home/camera/safe` | Camera AI | bất kỳ | Camera xác nhận người dùng đã đứng dậy/an toàn |
| `home/sensor/gas` | Cảm biến MQ-2 (qua ESP32) | `{ "status": "GAS_LEAK" }` | Chỉ xử lý khi `status == "GAS_LEAK"` |
| `home/sensor/dht22` | Cảm biến DHT22 (qua ESP32) | `{ "temp": 36.5, "humidity": 80 }` | |
| `home/esp32/alarm/off` | App/Web Dashboard | bất kỳ | Lệnh tắt còi thủ công + reset toàn bộ cooldown |

### Publish (đầu ra)

| Topic | Payload | Khi nào gửi |
|---|---|---|
| `home/esp32/alarm` | `"FALL_ALARM_ON"` / `"GAS_ALARM_ON"` / `"ALARM_OFF"` | Bật/tắt còi ESP32 — chuỗi lệnh cố định, ESP32 firmware phải hiểu đúng 3 giá trị này |
| Telegram (qua `node-red-contrib-telegrambot`) | `{ chatId, type: "photo"/"message", content, caption }` | Té ngã (kèm ảnh), rò gas, nhiệt độ/độ ẩm bất thường, xác nhận an toàn |

## Ngưỡng cảnh báo (DHT22)

| Điều kiện | Ngưỡng |
|---|---|
| Nhiệt độ quá cao | ≥ 35°C |
| Nhiệt độ quá thấp | ≤ 16°C |
| Độ ẩm cao bất thường | ≥ 85% |

Chỉ báo 1 điều kiện ưu tiên nhất mỗi lần (nhiệt độ cao > nhiệt độ thấp > độ ẩm), không gửi dồn nhiều cảnh báo cùng lúc.

## Cơ chế chống spam (debounce/cooldown)

Mỗi luồng cảnh báo dùng 1 biến `global` riêng để chặn gửi lặp lại trong 60 giây:

| Biến global | Dùng bởi |
|---|---|
| `fallLastAlertTime` | Té ngã (`function 1`) + điều kiện huỷ báo động (`function 6`, cửa sổ 5 phút) |
| `gasLastAlertTime` | Rò gas (`function 7`) |
| `dhtLastAlertTime` | Nhiệt độ/độ ẩm (`function 5`) |

Cả 3 biến được reset về `0` khi có lệnh `home/esp32/alarm/off` (`function 8`), hoặc riêng `fallLastAlertTime` được reset khi camera báo an toàn trong vòng 5 phút (`function 6`).

## Cấu hình bắt buộc trước khi chạy

1. **MQTT broker** (node `mqtt-broker`): mặc định trỏ tới `localhost:1883` — đúng cho Mosquitto chạy chung trên Pi. Đổi nếu broker đặt nơi khác.
2. **Telegram bot** (node `telegram bot`, package `node-red-contrib-telegrambot`): cần cấu hình `botname`/token bot thật trước khi deploy — hiện `usernames`/`chatids` đang để trống ở cấp bot, `chatId` được set cứng `"8823676499"` trong từng function gửi tin. Nếu thêm người nhận, sửa tại các node: `function 2`, `function 3`, `function 5`, `function 6`.
3. **Đường dẫn ảnh fallback** (`function 1`): mặc định `/opt/smart-home/assets/fallback_fall.jpg` — chỉ dùng khi payload té ngã không kèm `image_path`. Cần đảm bảo file này tồn tại trên Pi, hoặc để trống vì `function 2` đã có nhánh xử lý khi đọc ảnh lỗi (gửi cảnh báo dạng text thay vì photo).
4. **Module cần cài trong Node-RED**: `node-red-contrib-telegrambot` (v19.0.1, xem `global-config`).

## Cài đặt / Import

1. Mở Node-RED (`http://<pi-ip>:1880`).
2. Menu ☰ → **Import** → chọn file `flow1-automation-alerts-fixed.json`.
3. Mở node **telegram bot**, nhập token bot thật.
4. Kiểm tra node **mqtt-broker** trỏ đúng broker đang chạy.
5. **Deploy**.

## Test nhanh bằng `mosquitto_pub`

```bash
# Giả lập té ngã
mosquitto_pub -h localhost -t home/camera/fall -m '{"image_path":"/opt/smart-home/assets/fallback_fall.jpg"}'

# Giả lập rò gas
mosquitto_pub -h localhost -t home/sensor/gas -m '{"status":"GAS_LEAK"}'

# Giả lập nhiệt độ cao
mosquitto_pub -h localhost -t home/sensor/dht22 -m '{"temp":37,"humidity":60}'

# Xác nhận an toàn (trong vòng 5 phút sau báo té ngã)
mosquitto_pub -h localhost -t home/camera/safe -m '{}'

# Tắt còi thủ công
mosquitto_pub -h localhost -t home/esp32/alarm/off -m '{}'
```

Theo dõi kết quả qua tab **mqtt out `home/esp32/alarm`** (debug node nếu có) và Telegram.

## Giới hạn hiện tại / việc cần làm tiếp

- Flow này **chưa gửi dữ liệu về Backend (Node.js + MongoDB) / Web Dashboard** — hiện chỉ có 2 đích: còi ESP32 và Telegram. Cần thêm nhánh publish sang topic dạng `home/{room}/alert/{type}` và `home/{room}/sensor/{type}` nếu muốn tích hợp với backend (xem flow mở rộng `flow1-automation-alerts-v2-backend-bridge.json`).
- Chưa có cảm biến chuyển động (PIR/motion) trong flow.
- `chatId` Telegram đang hardcode ở nhiều nơi — nên gom vào 1 biến `global`/`env` dùng chung để dễ bảo trì.
- Còi ESP32 dùng chung 1 topic `home/esp32/alarm` cho cả té ngã và gas — firmware ESP32 cần phân biệt được các lệnh `FALL_ALARM_ON` / `GAS_ALARM_ON` / `ALARM_OFF` nếu muốn có kiểu còi/đèn khác nhau cho từng loại sự cố.
