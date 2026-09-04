import express, { Request, Response } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 5173;

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

// Voice & Text AI Chat assistant for elder care
app.post("/api/chat", async (req: Request, res: Response) => {
  try {
    const { message, context, conversationHistory } = req.body;
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Missing message" });
    }

    const ai = getGeminiClient();

    const systemInstruction = `Bạn là "Tâm An Trợ Lý AI" - trợ lý ảo thông minh, chu đáo và ân cần hỗ trợ gia đình theo dõi, chăm sóc sức khỏe và đảm bảo an toàn cho người cao tuổi (ông bà / cha mẹ) trong ngôi nhà thông minh Tâm An Home.
Đặc điểm giao tiếp:
1. Xưng hô chuẩn mực, thân thiện và ấm áp: Xưng là "Tâm An" hoặc "cháu/em", gọi người dùng là "bạn" hoặc "gia đình", và khi nhắc đến người cao tuổi được theo dõi thì gọi là "ông bà" hoặc "cụ/bác" một cách kính trọng.
2. Trả lời súc tích, rõ ràng, dễ hiểu (từ 2-4 câu) vì nội dung có thể được phát trực tiếp qua giọng nói tiếng Việt cho cả gia đình nghe.
3. Hỗ trợ giải đáp các vấn đề:
   - Tình trạng an toàn, nhiệt độ, không khí, cảm biến gas và hình ảnh camera các phòng của ông bà.
   - Nhắc nhở và kiểm tra lịch uống thuốc hàng ngày của ông bà.
   - Hướng dẫn sơ cứu, xử lý khi ông bà trượt ngã, chóng mặt hoặc có sự cố trong nhà.
   - Hỗ trợ kết nối các thành viên gia đình (anh Nguyễn Văn Hùng, chị Nguyễn Thị Mai) và Bác sĩ gia đình BS. Trần Lan qua Telegram.
   - Kiến trúc phần cứng: Hệ thống 100% KHÔNG CẦN module SIM (như SIM800L hay GSM) trên ESP32. Thiết bị chỉ cần Wi-Fi kết nối MQTT Broker, cảnh báo và gọi điện được thực hiện qua Telegram Bot API trên đường truyền Internet hoàn toàn miễn phí.
4. Thông tin bối cảnh hiện tại của ngôi nhà:
   ${context ? JSON.stringify(context) : "Trạng thái các cảm biến và camera trong nhà của ông bà đang an toàn."}`;

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
    console.log(`ElderHome AI Server running on:`);
    console.log(`  > Local:   http://localhost:${PORT}`);
    console.log(`  > Network: http://127.0.0.1:${PORT}`);
  });
}
startServer();
