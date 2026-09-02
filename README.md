🏡 ElderHome AI - Tâm An Home

> **Hệ thống Giám sát & Bảo vệ An toàn Thông minh cho Người Cao Tuổi**
> Tích hợp Camera AI Phát hiện Té ngã, Cảm biến Cảnh báo Rò rỉ Khí Gas, Theo dõi Môi trường, Nhắc lịch Uống thuốc và Trợ lý Giọng nói AI Tiếng Việt.

## 📌 Giới thiệu dự án

**ElderHome AI (Tâm An Home)** là giải pháp nhà thông minh chuyên biệt hỗ trợ chăm sóc và bảo vệ người cao tuổi khi ở nhà một mình. Hệ thống kết hợp giữa thiết bị IoT (ESP32/Raspberry Pi), Camera AI, giao thức MQTT/Socket.IO thời gian thực, và Trợ lý Trí tuệ Nhân tạo (sử dụng Google Gemini API) hỗ trợ tương tác giọng nói tiếng Việt.

Đặc điểm nổi bật của hệ thống là **hoạt động 100% qua kết nối Wi-Fi gia đình**, không cần module SIM (như SIM800L/GSM). Cảnh báo khẩn cấp được gửi tức thì qua **Telegram Bot API** hoàn toàn miễn phí và truyền tín hiệu thời gian thực lên ứng dụng web dashboard.

## ✨ Tính năng chính

### 1. 📷 Camera AI Phát hiện Té ngã
- Giám sát trực tiếp (Live Stream) tại Phòng Khách.
- Nhận diện hành vi bất thường và cảnh báo té ngã thời gian thực qua giao thức MQTT topic `home/livingroom/alert/fall`.
- Hiển thị hình ảnh chụp khoảnh khắc sự cố (snapshot) và mức độ tin cậy của mô hình AI.
- Bảo vệ quyền riêng tư: Tối ưu hoá giám sát tại không gian chung.

### 2. 🔥 Cảnh báo Rò rỉ Khí Gas & Nguy hiểm
- Giám sát nồng độ khí gas (PPM) theo từng khu vực: **Nhà Bếp**, **Phòng Khách**, **Phòng Ngủ**.
- Cảnh báo tức thì khi nồng độ gas vượt ngưỡng an toàn ($ \ge 50 	ext{ ppm} $).
- Tích hợp còi báo động khẩn cấp bằng âm thanh tự tổng hợp (Web Audio API) và phát âm thanh giọng nói tiếng Việt hướng dẫn xử lý.

### 3. 🌡️ Giám sát Khí hậu & Chất lượng Không khí
- Theo dõi nhiệt độ ($^\circ	ext{C}$) và độ ẩm ($\%$) thời gian thực từng phòng.
- Cảnh báo khi nhiệt độ quá cao ($ > 38^\circ	ext{C}$) ảnh hưởng sức khỏe người già.
- Theo dõi chỉ số chất lượng không khí **AQI** và bụi mịn **PM2.5**.

### 4. 💊 Nhắc lịch Uống thuốc & Nhật ký Sinh hoạt
- Quản lý danh mục và lịch uống thuốc theo giờ trong ngày.
- Đánh dấu trạng thái đã uống/chưa uống thuốc kèm thông báo âm thanh thanh lịch.
- Nhật ký sự cố (`Activity Logs`) lưu trữ lịch sử cảnh báo, phân loại theo mức độ (An toàn, Cảnh báo, Nguy hiểm) và hỗ trợ xác nhận xử lý (`Resolve`).

### 5. 📞 Cuộc gọi & Liên hệ Khẩn cấp (SOS / Telegram Hub)
- Nút bấm khẩn cấp **"KHẨN CẤP"** (SOS) nổi bật, kích hoạt còi báo động toàn hệ thống.
- Kết nối nhanh tới người thân qua **Telegram Call / Telegram Chat** (`@username`) và số điện thoại khẩn cấp (**115** Cứu tế y tế, **114** PCCC).
- Không tốn chi phí cước SIM/SMS nhờ tận dụng Telegram Bot API & Wi-Fi.

### 6. 🎙️ Trợ lý Giọng nói AI Tiếng Việt (Gemini AI Integration)
- Tương tác 2 chiều bằng giọng nói tiếng Việt (`vi-VN`) trực tiếp trên trình duyệt.
- Nhận diện giọng nói (Speech Recognition) và phản hồi bằng giọng nói tự nhiên (Text-to-Speech).
- Tích hợp **Google Gemini API** (`@google/genai`) để giải đáp thắc mắc về sức khỏe, hướng dẫn sơ cứu khẩn cấp, tra cứu lịch uống thuốc và tình trạng ngôi nhà.

## 🛠️ Kiến trúc Hệ thống & Luồng Dữ liệu (Data Pipeline)

```text
[ Cảm biến ESP32 / Camera AI ]
              │ (Wi-Fi / MQTT)
              ▼
    [ Mosquitto MQTT Broker ]
              │
              ▼
   [ Backend Node.js / Express ] ────► [ Telegram Bot API ] ──► (Gửi cảnh báo đến điện thoại)
              │
              ├─ REST API (/api/telemetry, /api/incidents, /api/chat)
              └─ Socket.IO Server (telemetry:update, alert:new)
                      │
                      ▼
        [ Frontend React + Vite Dashboard ] ──► (Trợ lý Gemini AI + Âm thanh + Giao diện)
```

1. **Thiết bị đầu cuối (Hardware):** Cảm biến gas/nhiệt độ/độ ẩm ESP32 & Camera AI kết nối Wi-Fi gửi dữ liệu định kỳ tới MQTT Broker.
2. **Backend Server (Express & Socket.IO):** Lắng nghe MQTT topic, lưu nhật ký incident, kích hoạt Telegram Bot API gửi thông báo khẩn cấp, đồng thời phát sóng Socket.IO event tới Frontend.
3. **Dashboard Web (React & TypeScript):** Hiển thị dữ liệu trực quan thời gian thực, điều khiển hệ thống, hỗ trợ mô phỏng sự cố (Simulation Mode) và tương tác giọng nói với Trợ lý Gemini AI.

---

## 🗂️ Cấu trúc Tệp tin (Project Structure)

```text
.
├── metadata.json           # Thông tin metadata applet / permissions
├── tsconfig.json           # Cấu hình TypeScript compiler
├── vite.config.ts          # Cấu hình Vite & Tailwind CSS v4
├── package.json            # Các thư viện phụ thuộc & npm scripts
├── .env.example            # Tệp mẫu cấu hình biến môi trường
├── index.html              # HTML entry point với Be Vietnam Pro font
├── server.ts               # Node.js Express server tích hợp Gemini AI endpoint
└── src/
    ├── main.tsx            # React root mount
    ├── App.tsx             # Component chính (Navigation, Socket.IO & State management)
    ├── index.css           # Cấu hình Tailwind CSS v4
    ├── types.ts            # Khai báo TypeScript types & Backend contracts
    ├── components/         # Các UI Components
    │   ├── Header.tsx              # Thanh tiêu đề, nút SOS khẩn cấp & đọc trạng thái bằng giọng nói
    │   ├── StatusBanner.tsx        # Banner hiển thị trạng thái tổng quan (AN TOÀN / CẢNH BÁO)
    │   ├── CameraLiveCard.tsx      # Khung xem trực tiếp Camera AI & tình trạng nhận diện té ngã
    │   ├── GasSensorCard.tsx       # Khung giám sát khí gas 3 phòng
    │   ├── AirQualityCard.tsx      # Khung theo dõi AQI & PM2.5
    │   ├── ClimateCard.tsx         # Khung hiển thị Nhiệt độ & Độ ẩm
    │   ├── LogScreen.tsx           # Màn hình nhật ký cảnh báo & lịch sử sự cố
    │   ├── HelpScreen.tsx          # Màn hình Trợ lý AI, Lịch uống thuốc & Danh bạ khẩn cấp
    │   ├── EmergencyModal.tsx      # Pop-up khẩn cấp khi nhấn nút SOS
    │   ├── SimulationBar.tsx       # Thanh mô phỏng giả lập sự cố (Gas leak, Fall, High temp)
    │   └── BackendStatusBadge.tsx  # Badge cấu hình kết nối IP Backend LAN & Socket.IO
    ├── data/
    │   └── mockData.ts     # Dữ liệu khởi tạo (Phòng, Cảm biến, Liên hệ, Thuốc)
    ├── services/
    │   └── backendService.ts # Quản lý kết nối REST API & Socket.IO client
    └── utils/
        └── audio.ts        # Bộ tổng hợp âm thanh Web Audio API (Chime, Beep, Siren) & Text-to-Speech
```

## 🚀 Hướng dẫn Cài đặt & Chạy ứng dụng

### 1. Yêu cầu hệ thống
- **Node.js**: phiên bản `>= 18.x`
- **npm** hoặc **yarn** / **pnpm**

### 2. Cài đặt Phụ thuộc
```bash
npm install
```

### 3. Cấu hình Biến môi trường (`.env`)
Tạo tệp `.env` từ `.env.example`:
```bash
cp .env.example .env
```
Cập nhật các giá trị thích hợp trong `.env`:
```env
# Gemini API Key cho Trợ lý AI
GEMINI_API_KEY="YOUR_GEMINI_API_KEY"

# URL Backend Raspberry Pi / Server LAN
VITE_BACKEND_URL="http://192.168.1.8:3000"
```

### 4. Chạy Ứng dụng ở Chế độ Phát triển (Development)
```bash
npm run dev
```
Trình duyệt sẽ tự động mở ứng dụng (mặc định tại `http://localhost:3000` hoặc port do Vite cấp).

### 5. Build và Đóng gói Production
```bash
# Biển dịch Frontend Vite và đóng gói Server Node.js
npm run build
# Khởi chạy server production
npm run start
```

## 📡 Danh sách MQTT Topics & Socket Events

### 🌐 MQTT Topics (Kết nối phần cứng ESP32 / Pi)
- **Cảnh báo té ngã:** `home/livingroom/alert/fall`
- **Cảnh báo rò rỉ gas:** `home/{room}/alert/gas` (với `{room}` là `kitchen`, `livingroom`, `bedroom`)
- **Dữ liệu cảm biến định kỳ:** `home/{room}/telemetry`

### ⚡ Socket.IO Events (Thời gian thực giữa Backend & Frontend)
- `telemetry:latest` — Tải dữ liệu trạng thái mới nhất của tất cả các phòng
- `telemetry:update` — Cập nhật sự thay đổi từng cảm biến (`temperature`, `humidity`, `gas`, `motion`)
- `alert:new` — Phát tín hiệu cảnh báo khẩn cấp mới (Té ngã / Gas)
- `device:status` — Cập nhật trạng thái kết nối phần cứng (Online / Offline)