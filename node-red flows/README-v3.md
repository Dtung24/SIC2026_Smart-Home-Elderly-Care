# Node-RED Flow v3 — Automation & Alerts (ElderHome AI)

Flow Node-RED chạy trên Raspberry Pi 5, đóng vai trò lớp trung gian giữa **ESP32 (Khang)** / **Camera AI (Nguyên)** và **Backend (Đông)**, đồng thời gửi cảnh báo Telegram trực tiếp.

File flow: `SIC-2026 Elderly Care flow Node-red.json`

## Kiến trúc luồng xử lý thực tế

```
[Camera AI - Nguyên] --home/camera/fall--------> fn_fall (debounce 60s, dùng chung)
[ESP32 PIR - Khang]  --home/livingroom/alert/fall-> fn_fall  ─┬─> file in (đọc ảnh nếu có) → fn_fall_telegram → Telegram
                                                                └─> mqtt out: home/esp32/alarm ("FALL_ALARM_ON")*

[Camera AI - Nguyên] --home/camera/safe---------> fn_safe_cancel → Telegram "an toàn" + ALARM_OFF*

[ESP32 - Khang] --home/{room}/telemetry---------> (chạy song song 3 nhánh)
    ├─> fn_telemetry_bridge  → home/{room}/sensor/{sensorType}  (cho Backend/Dashboard)
    ├─> fn_gas_check         → nếu gas > 2200: Telegram + home/{room}/alert/gas (cho Backend) + ALARM_ON*
    └─> fn_dht_check         → nếu vượt ngưỡng nhiệt/ẩm: Telegram (không tạo Incident)

[App/Web] --home/esp32/alarm/off----------------> fn_manual_off → reset toàn bộ cooldown + ALARM_OFF*
```
## MQTT Topics thực tế

### Subscribe (đầu vào)

| Topic | Nguồn | Payload thật | Node xử lý |
|---|---|---|---|
| `home/camera/fall` | Camera AI (`nguyen/mqtt_client.py`) | `{deviceId, detected, severity, image_path, snapshotPath, status, timestamp, confidence}` | `fn_fall` |
| `home/livingroom/alert/fall` | ESP32 PIR (`khang/main.cpp`, khi bất động >15s) | `{room, alert:true, type:"FALL_DETECTED"}` — **không có ảnh** | `fn_fall` |
| `home/camera/safe` | Camera AI | `{deviceId, detected:false, status:"safe", timestamp}` | `fn_safe_cancel` |
| `home/+/telemetry` | ESP32 (mọi phòng: livingroom, bedroom, kitchen) | `{room, sensorType, value, unit, timestamp(millis nội bộ)}` | `fn_telemetry_bridge`, `fn_gas_check`, `fn_dht_check` |
| `home/esp32/alarm/off` | App/Dashboard | bất kỳ | `fn_manual_off` |

### Publish (đầu ra)

| Topic | Payload | Người nhận |
|---|---|---|
| `home/{room}/sensor/{sensorType}` | `{value, unit, deviceId, timestamp}` | Backend (Đông) — ghi Mongo + `telemetry:update` cho Dashboard |
| `home/{room}/alert/gas` | `{room, type:"gas", deviceId, detected:true, severity:"critical", timestamp}` | Backend (Đông) — tạo Incident |
| `home/esp32/alarm` | `"FALL_ALARM_ON"` / `"GAS_ALARM_ON"` / `"ALARM_OFF"` | ESP32 (hiện chưa nghe — xem mục cảnh báo ở trên) |
| Telegram | `{chatId, type:"photo"/"message", content/caption}` | Người thân qua bot `ElderlyCare_SIC` |

## Ngưỡng cảnh báo

| Điều kiện | Ngưỡng | Khớp với `main.cpp` |
|---|---|---|
| Gas nguy hiểm | > 2200 (đơn vị `analogRead`, PPM ước lượng) | `gas_kitchen > 2200` |
| Quá nhiệt / nguy cơ cháy | ≥ 40°C | `t_livingroom/t_bedroom > 40.0` |
| Nhiệt độ cao (nhắc nhở) | ≥ 35°C | — (chỉ Node-RED, không có ở firmware) |
| Nhiệt độ thấp (nhắc nhở) | ≤ 16°C | — |
| Độ ẩm cao (nhắc nhở) | ≥ 85% | — |


## Cơ chế chống spam (debounce/cooldown, 60 giây)

| Biến `global` | Phạm vi |
|---|---|
| `fallLastAlertTime` | Dùng chung cho cả Camera AI và ESP32 PIR (tránh báo trùng 2 lần cho cùng 1 lần ngã) |
| `gasLastAlertTime` | Toàn hệ thống (hiện chỉ có 1 cảm biến gas ở kitchen) |
| `dhtLastAlertTime_<room>` | **Riêng theo từng phòng** (livingroom, bedroom có thể vượt ngưỡng độc lập) |

Reset toàn bộ khi có lệnh `home/esp32/alarm/off`, hoặc riêng `fallLastAlertTime` reset khi Camera AI báo an toàn trong vòng 5 phút.

## Test nhanh bằng `mosquitto_pub`

```bash
# Camera AI báo ngã (có ảnh)
mosquitto_pub -h localhost -t home/camera/fall -m '{"image_path":"/opt/smart-home/assets/fallback_fall.jpg","deviceId":"camera_livingroom_01","status":"new","timestamp":"2026-09-03T10:00:00+07:00"}'

# ESP32 PIR báo ngã (không ảnh) — nên bị debounce nếu gửi trong vòng 60s sau lệnh trên
mosquitto_pub -h localhost -t home/livingroom/alert/fall -m '{"room":"livingroom","alert":true,"type":"FALL_DETECTED"}'

# Telemetry gas vượt ngưỡng
mosquitto_pub -h localhost -t home/kitchen/telemetry -m '{"room":"kitchen","sensorType":"gas","value":3000,"unit":"PPM","timestamp":"183456"}'

# Telemetry nhiệt độ cao ở phòng ngủ
mosquitto_pub -h localhost -t home/bedroom/telemetry -m '{"room":"bedroom","sensorType":"temperature","value":42,"unit":"°C","timestamp":"183456"}'

# Camera AI báo an toàn (trong vòng 5 phút sau báo ngã)
mosquitto_pub -h localhost -t home/camera/safe -m '{"deviceId":"camera_livingroom_01","detected":false,"status":"safe"}'

# Tắt còi thủ công (chỉ reset cooldown, chưa tắt còi vật lý thật — xem mục cảnh báo)
mosquitto_pub -h localhost -t home/esp32/alarm/off -m '{}'
```

Theo dõi bằng debug node gắn vào `home/{room}/sensor/*`, `home/{room}/alert/gas` và Telegram.

## Đã kiểm thử logic (tự động, offline)

Toàn bộ code JavaScript trong 7 function-node của flow đã được chạy qua bộ test tự động (mô phỏng `global`/`node`/`msg` của Node-RED, dùng dữ liệu mẫu lấy đúng từ code thật của Khang/Nguyên) — 44/44 assertion pass, gồm: debounce đúng hạn 60s, cooldown độc lập theo từng phòng cho DHT, phân loại đúng 3 tier nhiệt độ, không tạo Incident trùng, không còn dây nối treo trong file JSON. Xem mục "Giới hạn của phần test" trong tin nhắn đi kèm — đây là kiểm thử logic offline, **chưa phải kiểm thử end-to-end với broker/ESP32/Mongo thật**.
