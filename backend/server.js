require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const mqtt = require("mqtt");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const Telemetry = require("./models/Telemetry");
const Incident = require("./models/Incident");
const createAiRouter = require("./routes/aiRoutes");
const createMedicationRouter = require("./routes/medicationRoutes");
const { startMedicationScheduler } = require("./services/medicationScheduler");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

app.use(cors());
app.use(express.json());
let mongoReady = false;
let medicationSchedulerStarted = false;

function maybeStartMedicationScheduler() {
  if (
    mongoReady &&
    mqttClient.connected &&
    !medicationSchedulerStarted
  ) {
    medicationSchedulerStarted = true;

    startMedicationScheduler({
      io,
      mqttClient
    });
  }
}

mongoose.connect(process.env.MONGODB_URI, {
  dbName: "elderlycare"
})
  .then(() => {
    console.log("✅ Đã kết nối MongoDB");
    mongoReady = true;
    maybeStartMedicationScheduler();
  })
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
  staircase: createRoomData(),
  updatedAt: null
};

const lightState = {
  livingroom: false,
  kitchen: false,
  staircase: false,
  staircaseMode: "AUTO",
  updatedAt: null
};

// AI Agent sử dụng dữ liệu cảm biến mới nhất trong bộ nhớ.
app.use(
  "/api/chat",
  createAiRouter({
    getLatestData: () => latestData
  })
);

app.use(
  "/api/medications",
  createMedicationRouter({ io })
);

// Kết nối từ backend tới Mosquitto trên chính Pi
const mqttClient = mqtt.connect(process.env.MQTT_URL);

// Xem trạng thái thật của 3 đèn
app.get("/api/lights", (req, res) => {
  res.json(lightState);
});

// Điều khiển đèn qua MQTT
app.post("/api/lights/:room", (req, res) => {
  const room = req.params.room;
  const action = String(req.body.action || "").toUpperCase();

  const validRooms = ["livingroom", "kitchen", "staircase"];

  if (!validRooms.includes(room)) {
    return res.status(400).json({
      success: false,
      message: "Phòng không hợp lệ"
    });
  }

  const validActions =
    room === "staircase"
      ? ["ON", "OFF", "AUTO"]
      : ["ON", "OFF"];

  if (!validActions.includes(action)) {
    return res.status(400).json({
      success: false,
      message: "Lệnh điều khiển không hợp lệ"
    });
  }

  if (!mqttClient.connected) {
    return res.status(503).json({
      success: false,
      message: "MQTT chưa kết nối"
    });
  }

  const topic = `home/esp32/light/${room}/set`;

  mqttClient.publish(
    topic,
    action,
    { qos: 1 },
    (error) => {
      if (error) {
        return res.status(500).json({
          success: false,
          message: error.message
        });
      }

      res.json({
        success: true,
        room,
        action,
        topic
      });
    }
  );
});

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

  maybeStartMedicationScheduler();

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
    const parts = topic.split("/");

    const isSensorTopic =
      parts.length === 4 &&
      parts[0] === "home" &&
      parts[2] === "sensor";

    const isAlertTopic =
      parts.length === 4 &&
      parts[0] === "home" &&
      parts[2] === "alert";

    const isStatusTopic =
      topic.endsWith("/status");

    const isLightStateTopic =
      parts.length === 5 &&
      parts[0] === "home" &&
      parts[1] === "esp32" &&
      parts[2] === "light" &&
      parts[4] === "state";

    const isStairModeTopic =
      topic === "home/esp32/light/staircase/mode";

    if (
      !isSensorTopic &&
      !isAlertTopic &&
      !isStatusTopic &&
      !isLightStateTopic &&
      !isStairModeTopic
    ) {
      return;
    }

    if (isLightStateTopic) {
      const room = parts[3];
      const value =
        messageBuffer.toString().trim().toUpperCase();

      if (
        room === "livingroom" ||
        room === "kitchen" ||
        room === "staircase"
      ) {
        lightState[room] = value === "ON";
        lightState.updatedAt = new Date().toISOString();

        io.emit("light:update", {
          room,
          state: lightState[room],
          timestamp: lightState.updatedAt
        });
      }

      return;
    }

    if (isStairModeTopic) {
      const mode =
        messageBuffer.toString().trim().toUpperCase();

      if (["AUTO", "ON", "OFF"].includes(mode)) {
        lightState.staircaseMode = mode;
        lightState.updatedAt = new Date().toISOString();

        io.emit("light:update", {
          room: "staircase",
          mode,
          timestamp: lightState.updatedAt
        });
      }

      return;
    }

    const payload = JSON.parse(messageBuffer.toString());

    console.log("\n📩 Nhận MQTT");
    console.log("Topic:", topic);
    console.log("Data:", payload);

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

  const rawTimestamp = payload.timestamp;
  let timestamp = new Date();

  if (typeof rawTimestamp === "number" && rawTimestamp > 1500000000000) {
    timestamp = new Date(rawTimestamp);
  } else if (
    typeof rawTimestamp === "string" &&
    rawTimestamp.trim() !== "" &&
    !Number.isNaN(new Date(rawTimestamp).getTime())
  ) {
    timestamp = new Date(rawTimestamp);
  }

  const alert = {
    ...payload,
    room: room,
    type: type,
    timestamp: timestamp
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
  socket.emit("light:latest", lightState);

  socket.on("disconnect", () => {
    console.log("Dashboard đã ngắt:", socket.id);
  });
});

// Chạy backend
server.listen(process.env.PORT, () => {
  console.log(`🚀 Backend chạy tại: http://localhost:${process.env.PORT}`);
});