const express = require("express");

const {
  askAiAgent,
  buildAiContext,
  getAiHealth
} = require("../services/aiAgentService");

function createAiRouter({ getLatestData }) {
  const router = express.Router();

  // ----------------------------------------------------------
  // GET /api/chat/health
  // ----------------------------------------------------------
  router.get("/health", (req, res) => {
    res.json({
      success: true,
      ...getAiHealth()
    });
  });

  // ----------------------------------------------------------
  // GET /api/chat/context
  // Chỉ phục vụ kiểm tra/debug context AI.
  // Không chứa GEMINI_API_KEY.
  // ----------------------------------------------------------
  router.get("/context", async (req, res) => {
    try {
      const context =
        await buildAiContext(getLatestData());

      res.json({
        success: true,
        context
      });
    } catch (error) {
      console.error(
        "❌ Không tạo được AI context:",
        error.message
      );

      res.status(500).json({
        success: false,
        error: "AI_CONTEXT_ERROR"
      });
    }
  });

  // ----------------------------------------------------------
  // POST /api/chat
  // Body:
  // {
  //   "message": "Nhiệt độ phòng khách thế nào?"
  // }
  // ----------------------------------------------------------
  router.post("/", async (req, res) => {
    try {
      const message = req.body?.message;

      if (
        typeof message !== "string" ||
        message.trim() === ""
      ) {
        return res.status(400).json({
          success: false,
          error: "MESSAGE_REQUIRED",
          message: "Cần nhập câu hỏi."
        });
      }

      // Giới hạn input tránh gửi prompt quá lớn ngoài ý muốn.
      if (message.length > 2000) {
        return res.status(400).json({
          success: false,
          error: "MESSAGE_TOO_LONG",
          message: "Câu hỏi quá dài."
        });
      }

      const result =
        await askAiAgent(
          message.trim(),
          getLatestData()
        );

      res.json({
        success: true,
        ...result
      });

    } catch (error) {
      console.error(
        "❌ AI Agent lỗi:",
        error.message
      );

      res.status(500).json({
        success: false,
        error:
          error.message === "MESSAGE_REQUIRED"
            ? "MESSAGE_REQUIRED"
            : "AI_AGENT_ERROR"
      });
    }
  });

  return router;
}

module.exports = createAiRouter;
