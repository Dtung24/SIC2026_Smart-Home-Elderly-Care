# Node-RED Flows — Automation & Alert System

Thư mục này chứa các flow Node-RED phụ trách phần **Rule Engine tự động hóa** và **Cảnh báo đa kênh** (Telegram Bot + Còi báo động) của hệ thống Smart Home Kết Hợp Camera AI Giám Sát & Bảo Vệ Người Cao Tuổi.

**Phụ trách:** Ngô Gia Bắc — Smart Home & Alert System

---

## 📁 Nội dung thư mục

| File | Mô tả |
|---|---|
| `flow1-automation-alerts.json` | Flow chính: xử lý té ngã, rò rỉ gas, nhiệt độ/độ ẩm, tự hủy cảnh báo, tắt còi thủ công |

---

## 🚀 Cách import flow vào Node-RED

1. Mở Node-RED, vào menu **☰** (góc trên phải) → **Import**.
2. Chọn tab **"select a file to import"**, chọn file `flow1-automation-alerts.json`.
3. Bấm **Import** → flow sẽ xuất hiện trên canvas.
4. Cần cài đặt sẵn các node package sau (qua Manage Palette): `node-red-contrib-telegrambot`.
5. Cấu hình lại **Bot Token** và **Chat ID** trong node Telegram sender/config (không lưu trong file export vì lý do bảo mật).
6. Bấm **Deploy**.

---

## 📡 Danh sách MQTT Topics đang sử dụng

Các bạn phụ trách Firmware (ESP32) và AI Computer Vision cần publish/subscribe đúng theo format dưới đây để đồng bộ với Node-RED.

### Subscribe (Node-RED lắng nghe)

| Topic | Nguồn gửi | Payload mẫu | Mô tả |
|---|---|---|---|
| `home/camera/fall` | AI Python (Pose Detection) | `{"image_path": "/path/to/snapshot.jpg"}` | Báo phát hiện té ngã kèm đường dẫn ảnh snapshot |
| `home/camera/safe` | AI Python | `{"status": "SAFE"}` | Báo người đã tự đứng dậy / an toàn, dùng để tự hủy cảnh báo té ngã |
| `home/sensor/gas` | ESP32 (MQ-2) | `{"status": "GAS_LEAK"}` | Báo phát hiện rò rỉ khí gas vượt ngưỡng |
| `home/sensor/dht22` | ESP32 (DHT22) | `{"temp": 38, "humidity": 60}` | Dữ liệu nhiệt độ & độ ẩm định kỳ |
| `home/esp32/alarm/off` | Frontend / Backend | (không cần payload) | Lệnh tắt còi thủ công khi người nhà xác nhận đã xử lý sự cố |

### Publish (Node-RED gửi ra)

| Topic | Đích nhận | Payload mẫu | Mô tả |
|---|---|---|---|
| `home/esp32/alarm` | ESP32 (Buzzer) | `"ALARM_OFF"` hoặc lệnh kích còi | Điều khiển bật/tắt còi báo động |

> **Lưu ý:** Ngưỡng cảnh báo nhiệt độ/độ ẩm hiện đặt tại `function 5`: `TEMP_HIGH = 35°C`, `TEMP_LOW = 16°C`, `HUMID_HIGH = 85%`. Có thể chỉnh trực tiếp trong code nếu cần thay đổi ngưỡng thực tế.

---

## 🧠 Cấu trúc xử lý trong flow

```
home/camera/fall ──► function 1 ──┬──► home/esp32/alarm  (kích còi)
                                   └──► read file ──► function 2 ──► Telegram sender (gửi ảnh)

home/sensor/gas ──► switch ──► function 7 (Gas Gate - debounce) ──┬──► function 3 ──► Telegram sender
                                                                    └──► function 4 ──► home/esp32/alarm

home/sensor/dht22 ──► function 5 ──► delay/limit ──► Telegram sender

home/camera/safe ──► function 6 (tự hủy cảnh báo) ──┬──► home/esp32/alarm (tắt còi)
                                                       └──► Telegram sender (báo an toàn)

home/esp32/alarm/off ──► function 8 (tắt còi thủ công + reset debounce) ──► home/esp32/alarm
```

### Cơ chế chống spam (Debounce)

- **Fall:** dùng `global.get/set('fallLastAlertTime')`, cooldown 60 giây.
- **Gas:** dùng `flow.get/set('gasAlertTime')`, cooldown 60 giây, kiểm tra tập trung tại `function 7` (Gas Gate) trước khi tách nhánh Telegram + còi, tránh xung đột giữa 2 nhánh.
- **DHT22:** dùng node `delay`/`limit` giới hạn tần suất gửi.

### Phân loại & Timestamp

Mỗi message xử lý sự cố đều được gắn:
```javascript
msg.topic = "fall" | "gas" | "dht22";
msg.eventTime = new Date().toISOString();
```
Dùng để phân loại log và đo độ trễ phản ứng (mục tiêu < 2 giây) khi tích hợp với Backend API.

---

## ✅ Trạng thái test

| Chức năng | Trạng thái |
|---|---|
| Kích còi + gửi ảnh khi té ngã | ✅ Đã test |
| Cảnh báo rò rỉ gas (Telegram + còi) | ✅ Đã test |
| Cảnh báo nhiệt độ/độ ẩm bất thường | ✅ Đã test |
| Debounce chống spam (fall & gas) | ✅ Đã test |
| Tự hủy cảnh báo khi an toàn | ✅ Đã test |
| Tắt còi thủ công | ✅ Đã test |

## 🔜 Việc còn lại

- Tích hợp dữ liệu thật từ AI Computer Vision và ESP32 (hiện đang test bằng node `inject` giả lập).
- Gửi log sự cố sang Backend API để lưu telemetry (phối hợp với phần Backend).
- Đo & xác nhận độ trễ phản ứng thực tế < 2 giây bằng `msg.eventTime`.
