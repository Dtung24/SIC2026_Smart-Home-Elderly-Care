const { GoogleGenAI } = require("@google/genai");
const Incident = require("../models/Incident");

// ============================================================
// AI AGENT CONFIG
// ============================================================

const DEFAULT_MODEL = "gemini-3.8-flash";

// MQ-2 hiện chưa hiệu chuẩn ppm.
// Giá trị hệ thống đang dùng là ADC thô.
const GAS_THRESHOLD_RAW = 2200;

// Client được tạo lazy để backend vẫn chạy được
// ngay cả khi Gemini tạm thời chưa khả dụng.
let aiClient = null;

function getModelName() {
  return process.env.GEMINI_MODEL || DEFAULT_MODEL;
}

function getFallbackModelName() {
  return process.env.GEMINI_FALLBACK_MODEL || "gemini-3.6-flash";
}

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return null;
  }

  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey
    });
  }

  return aiClient;
}

// ============================================================
// CONTEXT
// ============================================================

async function getRecentIncidents(limit = 10) {
  return Incident.find()
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();
}

function formatVietnamTime(timestamp) {
  if (!timestamp) {
    return null;
  }

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

function calculateAgeSeconds(timestamp) {
  if (!timestamp) {
    return null;
  }

  const time = new Date(timestamp).getTime();

  if (Number.isNaN(time)) {
    return null;
  }

  return Math.max(
    0,
    Math.round((Date.now() - time) / 1000)
  );
}

async function buildAiContext(latestData) {
  const incidents = await getRecentIncidents(10);

  const sensorUpdatedAt =
    latestData?.updatedAt || null;

  return {
    generatedAt: new Date().toISOString(),

    sensors: {
      livingroom: latestData?.livingroom || null,
      kitchen: latestData?.kitchen || null,
      staircase: latestData?.staircase || null,
      updatedAt: sensorUpdatedAt,
      ageSeconds:
        calculateAgeSeconds(sensorUpdatedAt)
    },

    sensorContract: {
      temperatureUnit: "celsius",
      humidityUnit: "percent",

      gas: {
        sensor: "MQ-2",
        unit: "raw_adc",
        dangerThreshold: GAS_THRESHOLD_RAW,
        note:
          "Giá trị ADC thô, chưa hiệu chuẩn ppm. Không được quy đổi hoặc mô tả là ppm."
      },

      motion: {
        unit: "boolean",
        zeroMeans: "không phát hiện chuyển động",
        oneMeans: "phát hiện chuyển động"
      }
    },

    recentIncidents: incidents.map((item) => ({
      id: String(item._id),
      room: item.room,
      type: item.type,
      detected: item.detected,
      confidence: item.confidence,
      severity: item.severity,
      status: item.status,
      snapshotPath: item.snapshotPath,
      timestamp: item.timestamp,
      timestampVietnam: formatVietnamTime(item.timestamp)
    }))
  };
}

// ============================================================
// LOCAL FALLBACK
// ============================================================

function roomLabel(room) {
  const labels = {
    livingroom: "phòng khách",
    kitchen: "phòng bếp",
    staircase: "cầu thang"
  };

  return labels[room] || room;
}

function valueOrUnknown(value, suffix = "") {
  if (value === null || value === undefined) {
    return "chưa có dữ liệu";
  }

  return `${value}${suffix}`;
}

function buildLocalFallback(message, context) {
  const q = String(message || "")
    .toLowerCase()
    .trim();

  const living =
    context.sensors.livingroom || {};

  const kitchen =
    context.sensors.kitchen || {};

  const staircase =
    context.sensors.staircase || {};

  // Gas
  if (
    q.includes("gas") ||
    q.includes("khí") ||
    q.includes("mq-2") ||
    q.includes("mq2")
  ) {
    const gas = kitchen.gas;

    if (gas === null || gas === undefined) {
      return "Hiện chưa có dữ liệu cảm biến khí gas từ phòng bếp.";
    }

    const state =
      Number(gas) > GAS_THRESHOLD_RAW
        ? "đang vượt ngưỡng cảnh báo"
        : "đang dưới ngưỡng cảnh báo";

    let answer =
      `MQ-2 phòng bếp hiện là ${gas} raw_adc, ` +
      `${state}. Ngưỡng cấu hình là ${GAS_THRESHOLD_RAW} raw_adc. ` +
      "Đây là ADC thô, không phải ppm.";

    const wantsHistory =
      q.includes("lịch sử") ||
      q.includes("từng") ||
      q.includes("trước đây") ||
      q.includes("gần đây");

    if (wantsHistory) {
      const gasIncidents =
        context.recentIncidents.filter(
          (item) => item.type === "gas"
        );

      if (gasIncidents.length === 0) {
        answer +=
          " Trong danh sách sự cố gần đây chưa ghi nhận cảnh báo gas.";
      } else {
        const latestGas =
          gasIncidents[0];

        const latestTime =
          latestGas.timestampVietnam ||
          new Date(latestGas.timestamp)
            .toLocaleString(
              "vi-VN",
              { timeZone: "Asia/Ho_Chi_Minh" }
            );

        answer +=
          ` Trong danh sách sự cố gần đây có ${gasIncidents.length} ` +
          `cảnh báo gas; gần nhất vào ${latestTime} giờ Việt Nam.`;
      }
    }

    return answer;
  }

  // Nhiệt độ
  if (
    q.includes("nhiệt") ||
    q.includes("temperature")
  ) {
    return (
      `Nhiệt độ hiện tại: phòng khách ` +
      `${valueOrUnknown(living.temperature, "°C")}; ` +
      `phòng bếp ` +
      `${valueOrUnknown(kitchen.temperature, "°C")}.`
    );
  }

  // Độ ẩm
  if (
    q.includes("ẩm") ||
    q.includes("humidity")
  ) {
    return (
      `Độ ẩm hiện tại: phòng khách ` +
      `${valueOrUnknown(living.humidity, "%")}; ` +
      `phòng bếp ` +
      `${valueOrUnknown(kitchen.humidity, "%")}.`
    );
  }

  // Chuyển động
  if (
    q.includes("chuyển động") ||
    q.includes("cầu thang") ||
    q.includes("pir") ||
    q.includes("motion")
  ) {
    if (
      staircase.motion === null ||
      staircase.motion === undefined
    ) {
      return "Hiện chưa có dữ liệu PIR cầu thang.";
    }

    return Number(staircase.motion) === 1
      ? "PIR cầu thang hiện đang phát hiện chuyển động."
      : "PIR cầu thang hiện không phát hiện chuyển động.";
  }

  // Incident
  if (
    q.includes("sự cố") ||
    q.includes("cảnh báo") ||
    q.includes("té") ||
    q.includes("ngã") ||
    q.includes("fall") ||
    q.includes("incident")
  ) {
    if (context.recentIncidents.length === 0) {
      return "Hiện chưa ghi nhận sự cố nào trong dữ liệu gần đây.";
    }

    const latest =
      context.recentIncidents[0];

    return (
      `Sự cố gần nhất: ${latest.type} tại ` +
      `${roomLabel(latest.room)}, ` +
      `mức ${latest.severity}, ` +
      `trạng thái ${latest.status}, ` +
      `thời gian ${new Date(latest.timestamp).toLocaleString("vi-VN")}.`
    );
  }

  // Tổng quan
  return (
    "Trạng thái cảm biến hiện tại: " +
    `phòng khách ${valueOrUnknown(living.temperature, "°C")}, ` +
    `${valueOrUnknown(living.humidity, "%")}; ` +
    `phòng bếp ${valueOrUnknown(kitchen.temperature, "°C")}, ` +
    `${valueOrUnknown(kitchen.humidity, "%")}, ` +
    `MQ-2 ${valueOrUnknown(kitchen.gas, " raw_adc")}; ` +
    `PIR cầu thang ${
      Number(staircase.motion) === 1
        ? "có chuyển động"
        : "không phát hiện chuyển động"
    }.`
  );
}

// ============================================================
// GEMINI
// ============================================================

const SYSTEM_INSTRUCTION = `
Bạn là trợ lý AI của hệ thống Tâm An Home - Smart Home Elderly Care.

QUY TẮC BẮT BUỘC:

1. Chỉ sử dụng dữ liệu cảm biến và sự cố được cung cấp trong CONTEXT.
2. Không được tự bịa dữ liệu, người dùng, thuốc, bác sĩ, bệnh án,
   số điện thoại, sự cố hoặc trạng thái thiết bị.
3. Phân biệt rõ dữ liệu hiện tại với sự cố trong lịch sử.
4. Cảm biến MQ-2 đang dùng giá trị raw_adc.
   Không được gọi giá trị này là ppm và không tự quy đổi sang ppm.
5. Ngưỡng gas cấu hình của hệ thống là 2200 raw_adc.
6. Nếu dữ liệu không có hoặc đã cũ, phải nói rõ.
7. Không chẩn đoán bệnh và không kê đơn hoặc thay đổi liều thuốc.
8. Nếu dữ liệu cho thấy nguy hiểm nghiêm trọng,
   khuyên người dùng kiểm tra trực tiếp và liên hệ người chăm sóc
   hoặc dịch vụ khẩn cấp phù hợp.
9. Không được nói rằng bạn đã bật/tắt thiết bị nếu hệ thống
   không cung cấp xác nhận hành động đó.
10. Trả lời bằng tiếng Việt, rõ ràng, ngắn gọn và dễ hiểu.
11. Phải trả lời trực tiếp câu hỏi của người dùng.
12. Không trả về checklist, tự đánh giá, tiêu chí kiểm tra,
    nhận xét kiểu "Yes/No", hay mô tả quá trình suy luận.
13. Nếu câu hỏi có nhiều ý, phải trả lời đủ từng ý dựa trên CONTEXT.
14. Khi nói thời gian sự cố cho người dùng, ưu tiên trường timestampVietnam
    và gọi đó là giờ Việt Nam. Không hiển thị UTC nếu người dùng không yêu cầu.
`;

function getGeminiErrorCode(error) {
  if (
    error &&
    Number.isInteger(error.status)
  ) {
    return error.status;
  }

  if (
    error &&
    Number.isInteger(error.code)
  ) {
    return error.code;
  }

  try {
    const parsed =
      JSON.parse(String(error?.message || ""));

    return parsed?.error?.code || null;
  } catch {
    return null;
  }
}

function shouldTryFallbackModel(error) {
  const code =
    getGeminiErrorCode(error);

  return [
    404,
    408,
    429,
    500,
    502,
    503,
    504
  ].includes(code);
}

async function generateGeminiAnswer(
  client,
  model,
  message,
  context
) {
  const response =
    await client.models.generateContent({
      model,

      contents:
        `CONTEXT THỰC TẾ CỦA HỆ THỐNG:\n` +
        `${JSON.stringify(context, null, 2)}\n\n` +
        `CÂU HỎI NGƯỜI DÙNG:\n${message}`,

      config: {
        systemInstruction:
          SYSTEM_INSTRUCTION,

        temperature: 0.2,
        maxOutputTokens: 800,

        thinkingConfig: {
          thinkingLevel: "LOW",
          includeThoughts: false
        },

        responseMimeType: "application/json",

        responseJsonSchema: {
          type: "object",
          properties: {
            answer: {
              type: "string",
              description:
                "Câu trả lời trực tiếp bằng tiếng Việt cho người dùng."
            }
          },
          required: ["answer"],
          additionalProperties: false
        }
      }
    });

  const parsed =
    JSON.parse(
      String(response.text || "{}")
    );

  const answer =
    String(parsed.answer || "").trim();

  if (!answer) {
    throw new Error(
      "Gemini trả về nội dung rỗng"
    );
  }

  return answer;
}

async function askAiAgent(message, latestData) {
  if (
    typeof message !== "string" ||
    message.trim() === ""
  ) {
    throw new Error("MESSAGE_REQUIRED");
  }

  const context =
    await buildAiContext(latestData);

  const fallbackAnswer =
    buildLocalFallback(
      message,
      context
    );

  const client =
    getAiClient();

  if (!client) {
    return {
      answer: fallbackAnswer,
      source: "local-fallback",
      model: null,
      fallbackUsed: false,
      contextUpdatedAt:
        context.sensors.updatedAt
    };
  }

  const primaryModel =
    getModelName();

  const fallbackModel =
    getFallbackModelName();

  const models =
    [primaryModel];

  if (
    fallbackModel &&
    fallbackModel !== primaryModel
  ) {
    models.push(fallbackModel);
  }

  let lastError = null;

  for (
    let index = 0;
    index < models.length;
    index++
  ) {
    const model =
      models[index];

    try {
      const answer =
        await generateGeminiAnswer(
          client,
          model,
          message.trim(),
          context
        );

      return {
        answer,
        source: "gemini",
        model,
        fallbackUsed:
          index > 0,
        contextUpdatedAt:
          context.sensors.updatedAt
      };

    } catch (error) {
      lastError = error;

      const hasNextModel =
        index < models.length - 1;

      const retryable =
        shouldTryFallbackModel(error);

      console.warn(
        `⚠️ Gemini model ${model} lỗi:`,
        error.message
      );

      if (
        !hasNextModel ||
        !retryable
      ) {
        break;
      }

      console.warn(
        `↪ Thử model dự phòng: ${models[index + 1]}`
      );
    }
  }

  console.warn(
    "⚠️ Các model Gemini đều không khả dụng, dùng local fallback:",
    lastError?.message || "unknown error"
  );

  return {
    answer: fallbackAnswer,
    source: "local-fallback",
    model: null,
    attemptedModels: models,
    fallbackUsed: true,
    contextUpdatedAt:
      context.sensors.updatedAt
  };
}

// ============================================================
// HEALTH
// ============================================================

function getAiHealth() {
  return {
    configured:
      Boolean(process.env.GEMINI_API_KEY),

    model: getModelName(),

    fallbackModel:
      getFallbackModelName(),

    provider: "Google Gemini",

    fallbackAvailable: true
  };
}

module.exports = {
  askAiAgent,
  buildAiContext,
  getAiHealth
};
