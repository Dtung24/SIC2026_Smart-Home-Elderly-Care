require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const mqtt = require("mqtt");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const Telemetry = require("./models/Telemetry");
const Incident = require("./models/Incident");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

app.use(cors());
app.use(express.json());
mongoose.connect(process.env.MONGODB_URI, {
  dbName: "elderlycare"
})
  .then(() => console.log("✅ Đã kết nối MongoDB"))
  .catch((error) => console.error("❌ Lỗi MongoDB:", error.message));

// Chỗ lưu dữ liệu mới nhất để test tuần 1
const createRoomData = () => ({
  temperature: null,
  humidity: null,
  motion: null,
  gas: null
});

const latestData = {
  livingroom: createRoomData(),
  kitchen: createRoomData(),
  bedroom: createRoomData(),
  updatedAt: null
};

// Kết nối từ backend tới Mosquitto trên chính Pi
const mqttClient = mqtt.connect(process.env.MQTT_URL);

// API để test backend có chạy không
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Backend đang chạy",
    mqttConnected: mqttClient.connected
  });
});

// API để xem dữ liệu sensor mới nhất
app.get("/api/telemetry/latest", (req, res) => {
  res.json(latestData);
});
app.get("/api/telemetry/history", async (req, res) => {
  const data = await Telemetry.find()
    .sort({ timestamp: -1 })
    .limit(50);

  res.json(data);
});
app.get("/api/incidents", async (req, res) => {
  const data = await Incident.find()
    .sort({ timestamp: -1 });

  res.json(data);
});
app.patch("/api/incidents/:id/status", async (req, res) => {
  const incident = await Incident.findByIdAndUpdate(
    req.params.id,
    { status: req.body.status },
    { returnDocument: "after" }
  );

  res.json(incident);
});

// Khi kết nối Mosquitto thành công
mqttClient.on("connect", () => {
  console.log("✅ Đã kết nối MQTT:", process.env.MQTT_URL);

  // Nghe tất cả topic bắt đầu bằng home/
  mqttClient.subscribe("home/#", (error) => {
    if (error) {
      console.error("❌ Subscribe thất bại:", error.message);
      return;
    }

    console.log("✅ Đang nghe topic: home/#");
  });
});

// Nếu Mosquitto lỗi
mqttClient.on("error", (error) => {
  console.error("❌ MQTT lỗi:", error.message);
});

// Khi ESP32, AI hoặc Node-RED gửi dữ liệu MQTT
mqttClient.on("message", async (topic, messageBuffer) => {
  try {
    const payload = JSON.parse(messageBuffer.toString());

    console.log("\n📩 Nhận MQTT");
    console.log("Topic:", topic);
    console.log("Data:", payload);

    const parts = topic.split("/");

  // Nhận sensor: home/{room}/sensor/{sensorType}
  if (
    parts.length === 4 &&
    parts[0] === "home" &&
    parts[2] === "sensor"
  ) {
    const room = parts[1];
    const sensorType = parts[3];

    if (!latestData[room]) {
      console.warn(`⚠️ Phòng không hợp lệ: ${room}`);
      return;
    }

    latestData[room][sensorType] = payload.value;
    latestData.updatedAt = payload.timestamp;

    await Telemetry.create({
      room: room,
      sensorType: sensorType,
      deviceId: payload.deviceId,
      value: payload.value,
      unit: payload.unit,
      timestamp: payload.timestamp
    });

    io.emit("telemetry:update", {
      room: room,
      sensorType: sensorType,
      value: payload.value,
      unit: payload.unit,
      timestamp: payload.timestamp
    });
  }

  // Nhận alert: home/{room}/alert/{type}
  if (
    parts.length === 4 &&
    parts[0] === "home" &&
    parts[2] === "alert"
  ) {
    const room = parts[1];
    const type = parts[3];

    if (!latestData[room]) {
      console.warn(`⚠️ Phòng không hợp lệ: ${room}`);
      return;
    }

    const alert = {
      room: room,
      type: type,
      ...payload
    };

    console.log("🚨 CẢNH BÁO:", alert);

    await Incident.create(alert);
    io.emit("alert:new", alert);
  }
    // Nhận trạng thái Pi, ESP32 hoặc camera
    if (topic.endsWith("/status")) {
      io.emit("device:status", {
        topic: topic,
        ...payload
      });
    }
  } catch (error) {
    console.error("❌ Data gửi lên không phải JSON hợp lệ:", error.message);
  }
});

// Khi web dashboard kết nối vào backend
io.on("connection", (socket) => {
  console.log("🌐 Dashboard đã kết nối:", socket.id);

  // Web vừa vào sẽ nhận data hiện có ngay
  socket.emit("telemetry:latest", latestData);

  socket.on("disconnect", () => {
    console.log("Dashboard đã ngắt:", socket.id);
  });
});

// Chạy backend
server.listen(process.env.PORT, () => {
  console.log(`🚀 Backend chạy tại: http://localhost:${process.env.PORT}`);
});