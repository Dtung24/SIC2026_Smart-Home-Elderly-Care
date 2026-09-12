const express = require("express");

const MedicationReminder = require("../models/MedicationReminder");

const {
  MEDICATION_SLOTS,
  getVietnamNow,
  ensureTodayReminders
} = require("../services/medicationScheduler");

function createMedicationRouter({ io }) {
  const router = express.Router();

  // Lấy trạng thái 3 lần uống thuốc của hôm nay.
  router.get("/today", async (req, res) => {
    try {
      const now = getVietnamNow();

      await ensureTodayReminders(now.dateKey);

      const reminders = await MedicationReminder.find({
        dateKey: now.dateKey
      }).lean();

      const order = new Map(
        MEDICATION_SLOTS.map((item, index) => [item.slot, index])
      );

      reminders.sort(
        (a, b) =>
          (order.get(a.slot) ?? 99) -
          (order.get(b.slot) ?? 99)
      );

      res.json({
        success: true,
        dateKey: now.dateKey,
        reminders
      });
    } catch (error) {
      console.error("❌ GET medication today:", error.message);

      res.status(500).json({
        success: false,
        error: "Không lấy được lịch uống thuốc."
      });
    }
  });

  // Người dùng xác nhận đã uống thuốc.
  router.patch("/:slot/taken", async (req, res) => {
    try {
      const { slot } = req.params;

      const validSlot = MEDICATION_SLOTS.some(
        (item) => item.slot === slot
      );

      if (!validSlot) {
        return res.status(400).json({
          success: false,
          error: "Khung giờ uống thuốc không hợp lệ."
        });
      }

      const now = getVietnamNow();

      await ensureTodayReminders(now.dateKey);

      const existingReminder = await MedicationReminder.findOne({
        dateKey: now.dateKey,
        slot
      });

      if (!existingReminder) {
        return res.status(404).json({
          success: false,
          error: "Không tìm thấy lịch uống thuốc."
        });
      }

      // Không cho xác nhận trước giờ uống.
      if (now.time < existingReminder.scheduledTime) {
        return res.status(409).json({
          success: false,
          code: "TOO_EARLY",
          error: "Chưa đến giờ uống thuốc.",
          scheduledTime: existingReminder.scheduledTime,
          currentTime: now.time
        });
      }

      // Nếu đã xác nhận rồi thì giữ nguyên takenAt cũ.
      if (existingReminder.status === "taken") {
        return res.json({
          success: true,
          reminder: {
            id: existingReminder._id,
            dateKey: existingReminder.dateKey,
            slot: existingReminder.slot,
            label: existingReminder.label,
            scheduledTime: existingReminder.scheduledTime,
            status: existingReminder.status,
            takenAt: existingReminder.takenAt
          }
        });
      }

      const reminder = await MedicationReminder.findOneAndUpdate(
        {
          dateKey: now.dateKey,
          slot
        },
        {
          $set: {
            status: "taken",
            takenAt: now.timestamp
          }
        },
        {
          returnDocument: "after"
        }
      );

      const payload = {
        id: reminder._id,
        dateKey: reminder.dateKey,
        slot: reminder.slot,
        label: reminder.label,
        scheduledTime: reminder.scheduledTime,
        status: reminder.status,
        takenAt: reminder.takenAt
      };

      io.emit("medication:update", payload);

      console.log(
        `💊 ĐÃ XÁC NHẬN: ${reminder.label} lúc ${now.time}`
      );

      res.json({
        success: true,
        reminder: payload
      });
    } catch (error) {
      console.error("❌ PATCH medication taken:", error.message);

      res.status(500).json({
        success: false,
        error: "Không xác nhận được việc uống thuốc."
      });
    }
  });

  return router;
}

module.exports = createMedicationRouter;
