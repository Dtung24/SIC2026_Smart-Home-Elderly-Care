import express, { Request, Response } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import os from "os";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5173;

app.use(express.json());

// Lazy-initialized Gemini client
let genAI: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI | null {
  if (!genAI && process.env.GEMINI_API_KEY) {
    try {
      genAI = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    } catch (e) {
      console.error("Failed to initialize GoogleGenAI:", e);
    }
  }
  return genAI;
}

// Health check endpoint
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// In-memory latest telemetry state
const latestTelemetryState = {
  livingroom: {
    temperature: 26.5,
    humidity: 55,
    motion: true,
    gas: 12,
  },
  kitchen: {
    temperature: 28.0,
    humidity: 62,
    motion: false,
    gas: 15,
  },
  bedroom: {
    temperature: 25.2,
    humidity: 50,
    motion: false,
    gas: 8,
  },
  updatedAt: new Date().toISOString(),
};

// REST Contract: GET /api/telemetry/latest
app.get("/api/telemetry/latest", (_req: Request, res: Response) => {
  res.json({
    ...latestTelemetryState,
    updatedAt: new Date().toISOString(),
  });
});

// REST Contract: GET /api/telemetry/history
app.get("/api/telemetry/history", (_req: Request, res: Response) => {
  const history = [
    {
      room: "livingroom",
      sensorType: "temperature",
      value: 26.5,
      unit: "celsius",
      timestamp: new Date(Date.now() - 60000).toISOString(),
    },
    {
      room: "kitchen",
      sensorType: "gas",
      value: 15,
      unit: "ppm",
      timestamp: new Date(Date.now() - 80000).toISOString(),
    },
    {
      room: "bedroom",
      sensorType: "temperature",
      value: 25.2,
      unit: "celsius",
      timestamp: new Date(Date.now() - 100000).toISOString(),
    },
    {
      room: "livingroom",
      sensorType: "humidity",
      value: 55,
      unit: "percent",
      timestamp: new Date(Date.now() - 120000).toISOString(),
    },
    {
      room: "kitchen",
      sensorType: "temperature",
      value: 28.0,
      unit: "celsius",
      timestamp: new Date(Date.now() - 140000).toISOString(),
    },
    {
      room: "bedroom",
      sensorType: "humidity",
      value: 50,
      unit: "percent",
      timestamp: new Date(Date.now() - 160000).toISOString(),
    },
    {
      room: "livingroom",
      sensorType: "motion",
      value: true,
      unit: "boolean",
      timestamp: new Date(Date.now() - 180000).toISOString(),
    },
    {
      room: "livingroom",
      sensorType: "gas",
      value: 12,
      unit: "ppm",
      timestamp: new Date(Date.now() - 240000).toISOString(),
    },
  ];
  res.json(history);
});

// In-memory incidents store for dev
let incidentsList = [
  {
    id: "inc-1",
    room: "livingroom",
    type: "fall",
    topic: "home/livingroom/alert/fall",
    deviceId: "pi-cam-livingroom-01",
    detected: false,
    severity: "critical",
    confidence: 0.96,
    snapshotPath: "src={`http://${window.location.hostname}:8000/video_feed`}",
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    status: "resolved",
  },
];

// REST Contract: GET /api/incidents
app.get("/api/incidents", (_req: Request, res: Response) => {
  res.json(incidentsList);
});

// REST Contract: PATCH /api/incidents/:id/status
app.patch("/api/incidents/:id/status", (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  const incident = incidentsList.find((i) => i.id === id);
  if (incident) {
    incident.status = status;
  }
  res.json({ success: true, id, status });
});
function formatSensorContext(context: any): string {
  if (!context) return "Hiện chưa có dữ liệu cảm biến.";

  const { sensors, rooms, medications, emergencyContacts } = context;
  const lines: string[] = [];

  if (sensors) {
    const statusText = sensors.systemStatus === 'safe' ? 'AN TOÀN' : 'CẦN LƯU Ý';
    lines.push(`- Trạng thái hệ thống: ${statusText}`);
    if (sensors.temperature != null) lines.push(`- Nhiệt độ: ${sensors.temperature}°C`);
    if (sensors.humidity != null) lines.push(`- Độ ẩm: ${sensors.humidity}%`);
    if (sensors.aqi != null) lines.push(`- Chỉ số chất lượng không khí (AQI): ${sensors.aqi}`);
    if (sensors.gasLevelPpm != null) {
      const gasStatus = sensors.gasLevelPpm > 50 ? 'CAO BẤT THƯỜNG' : 'bình thường';
      lines.push(`- Nồng độ khí gas: ${sensors.gasLevelPpm} ppm (${gasStatus})`);
    }
  }

  if (Array.isArray(rooms) && rooms.length > 0) {
    lines.push(`- Chi tiết các phòng:`);
    rooms.forEach((r: any) => {
      const person = r.personDetected ? 'có người' : 'không có người';
      lines.push(`  + ${r.name}: ${person}${r.activityNote ? `, ${r.activityNote}` : ''}`);
    });
  }

  if (Array.isArray(medications) && medications.length > 0) {
    const pending = medications.filter((m: any) => !m.taken);
    if (pending.length > 0) {
      lines.push(`- Thuốc CHƯA uống hôm nay: ${pending.map((m: any) => `${m.name} (${m.time})`).join(', ')}`);
    } else {
      lines.push(`- Tất cả thuốc hôm nay đã uống đầy đủ.`);
    }
  }

  if (Array.isArray(emergencyContacts) && emergencyContacts.length > 0) {
    lines.push(`- Người thân/Bác sĩ liên hệ: ${emergencyContacts.map((c: any) => `${c.name} (${c.relation}, ${c.phone})`).join('; ')}`);
  }

  return lines.length > 0 ? lines.join('\n') : "Trạng thái các cảm biến và camera trong nhà của ông bà đang an toàn.";
}
// Voice & Text AI Chat assistant for elder care
app.post("/api/chat", async (req: Request, res: Response) => {
  try {
    const { message, context, conversationHistory } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Missing message" });
    }

    const ai = getGeminiClient();

    const systemInstruction = `Bạn là "Tâm An Trợ Lý AI" - trợ lý ảo thông minh, chu đáo và ân cần hỗ trợ gia đình theo dõi, chăm sóc sức khỏe và đảm bảo an toàn cho người cao tuổi (ông bà / cha mẹ) trong ngôi nhà thông minh Tâm An Home.

## Đặc điểm giao tiếp
1. Xưng hô chuẩn mực, thân thiện và ấm áp: Xưng là "Tâm An" hoặc "cháu/em", gọi người dùng là "bạn" hoặc "gia đình", và khi nhắc đến người cao tuổi được theo dõi thì gọi là "ông bà" hoặc "cụ/bác" một cách kính trọng.
2. Trả lời súc tích, rõ ràng, dễ hiểu (từ 2-4 câu) vì nội dung có thể được phát trực tiếp qua giọng nói tiếng Việt cho cả gia đình nghe.
3. Kiến trúc phần cứng: Hệ thống 100% KHÔNG CẦN module SIM (như SIM800L hay GSM) trên ESP32. Thiết bị chỉ cần Wi-Fi kết nối MQTT Broker, cảnh báo và gọi điện được thực hiện qua Telegram Bot API trên đường truyền Internet hoàn toàn miễn phí.
4. Hỗ trợ kết nối các thành viên gia đình (anh Nguyễn Văn Hùng, chị Nguyễn Thị Mai) và Bác sĩ gia đình BS. Trần Lan qua Telegram.

## Dữ liệu cảm biến & trạng thái nhà THỜI GIAN THỰC
${formatSensorContext(context)}

## Quy tắc bắt buộc khi trả lời
- Khi được hỏi về nhiệt độ, độ ẩm, không khí, khí gas, hoặc tình trạng phòng nào đó, LUÔN dùng đúng số liệu/trạng thái trong phần "Dữ liệu cảm biến" ở trên. TUYỆT ĐỐI không tự bịa ra con số khác.
- Nếu dữ liệu không có thông tin về điều được hỏi, hãy trả lời trung thực rằng hiện chưa có cảm biến/dữ liệu ở khu vực đó, thay vì đoán mò.
- Khi được hỏi về lịch uống thuốc, dựa đúng vào danh sách thuốc đã/chưa uống ở trên.
- Khi được hỏi cách xử lý khẩn cấp (ngã, chóng mặt, rò gas), đưa hướng dẫn sơ cứu cụ thể, ngắn gọn, dễ làm theo ngay.
- Nếu câu hỏi nằm ngoài phạm vi nhà thông minh Tâm An Home (ví dụ thời tiết ngoài trời, tin tức, kiến thức chung không liên quan), hãy lịch sự nói rằng Tâm An chỉ hỗ trợ theo dõi an toàn và sức khỏe trong nhà, và gợi ý người dùng hỏi câu liên quan.

## Ví dụ cách trả lời chuẩn
Hỏi: "Nhiệt độ phòng khách bao nhiêu?"
Trả lời mẫu: "Dạ, nhiệt độ Phòng Khách hiện là 26.5°C, độ ẩm 55%, mọi thứ đang ở mức an toàn ạ."`;
    if (ai) {
      try {
        let contentsPayload: any = message;
        if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
          const contents = conversationHistory.slice(-6).map((msg: { role: string; text: string }) => ({
            role: msg.role === "user" ? "user" : "model",
            parts: [{ text: msg.text }],
          }));
          contents.push({
            role: "user",
            parts: [{ text: message }],
          });
          contentsPayload = contents;
        }

        const response = await ai.models.generateContent({
          model: "gemini-3.7-flash",
          contents: contentsPayload,
          config: {
            systemInstruction,
            temperature: 0.7,
            topP: 0.9,
          },
        });

        const replyText = response.text || "Dạ, cháu đã nghe rõ câu hỏi của cụ ạ. Cụ cần cháu trợ giúp gì thêm không ạ?";
        return res.json({ reply: replyText });
      } catch (geminiErr: any) {
        console.warn("Gemini API error, using fallback logic:", geminiErr?.message || geminiErr);
      }
    }

    // Smart Local Fallback Response Logic if API key is not yet set or network issue
    const q = message.toLowerCase();
    let reply = "";
    if (q.includes("thuốc") || q.includes("uống")) {
      reply = "Dạ, hôm nay ông bà có lịch uống thuốc huyết áp Amlodipine 5mg vào buổi sáng và Canxi Vitamin D3 vào buổi tối. Gia đình nhớ nhắc ông bà uống sau bữa ăn cùng một cốc nước ấm nhé!";
    } else if (q.includes("bác sĩ") || q.includes("khám") || q.includes("bệnh")) {
      reply = "Dạ, Bác sĩ gia đình chăm sóc sức khỏe cho ông bà là BS. Trần Lan, số điện thoại 0988 765 432. Bạn có thể nhấn nút gọi ngay trên ứng dụng ạ.";
    } else if (q.includes("ngã") || q.includes("té") || q.includes("đau")) {
      reply = "Dạ nếu nghi ngờ hoặc phát hiện ông bà bị trượt ngã, gia đình hãy giữ ông bà nằm yên, tránh cử động mạnh và bấm nút KHẨN CẤP màu đỏ để hệ thống phát chuông cảnh báo và gọi người thân ngay lập tức!";
    } else if (q.includes("gas") || q.includes("khí") || q.includes("cháy") || q.includes("bếp")) {
      reply = "Dạ, nếu phát hiện có cảnh báo rò rỉ khí gas tại bếp, gia đình tuyệt đối không bật công tắc điện hay bật lửa, hãy mở toang cửa sổ thông gió và đưa ông bà ra khu vực thoáng mát ngoài phòng khách ngay.";
    } else if (q.includes("người thân") || q.includes("con") || q.includes("tuấn") || q.includes("anh")) {
      reply = "Dạ, danh bạ người thân gồm anh Nguyễn Văn Hùng (@hung_nguyen_care), chị Nguyễn Thị Mai (@mai_nguyen_family) và BS. Trần Lan (@bs_tranlan_eldercare). Bạn có thể bấm gọi Telegram ngay trong mục danh bạ ạ.";
    } else if (q.includes("sim") || q.includes("module") || q.includes("gsm") || q.includes("thẻ cước")) {
      reply = "Dạ bạn hoàn toàn yên tâm nhé! Hệ thống KHÔNG CẦN bất kỳ module SIM (như SIM800L/GSM/4G) nào trên ESP32. Thiết bị chạy 100% qua Wi-Fi gửi MQTT, cảnh báo và cuộc gọi khẩn cấp do Backend gửi qua Telegram trên đường truyền Internet miễn phí.";
    } else if (q.includes("chào") || q.includes("khỏe không") || q.includes("tâm an") || q.includes("nhà")) {
      reply = "Dạ chào bạn và gia đình! Trợ lý Tâm An luôn đồng hành theo dõi an toàn của ông bà. Hiện tại các phòng và chỉ số không khí, nhiệt độ trong nhà đều đang ở mức an toàn lý tưởng ạ.";
    } else {
      reply = `Dạ, Trợ lý Tâm An đã ghi nhận câu hỏi: "${message}". Tình trạng an toàn và sức khỏe của ông bà đang được giám sát chặt chẽ. Bạn có thể hỏi thêm thông tin bất cứ lúc nào!`;
    }

    return res.json({ reply });
  } catch (error: any) {
    console.error("Error in /api/chat:", error);
    return res.status(500).json({
      error: "Internal error",
      reply: "Dạ thưa cụ, cháu luôn sẵn sàng lắng nghe và hỗ trợ cụ. Cụ nói lại giúp cháu nhé!",
    });
  }
});

// Vite / Static file serving
function getLocalIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "localhost";
}
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    const ip = getLocalIp();   // 👈 gọi hàm lấy IP
    console.log(`ElderHome AI Server running on:`);
    console.log(`  > Local:   http://localhost:${PORT}`);
    console.log(`  > Network: http://${ip}:${PORT}`);   // 👈 thêm dòng log này
  });
}
startServer();