const MedicationReminder = require("../models/MedicationReminder");

const TIME_ZONE = "Asia/Ho_Chi_Minh";
const TIME_ZONE_LABEL = "Hà Nội (UTC+7)";

const MEDICATION_SLOTS = [
  {
    slot: "morning",
    label: "Thuốc buổi sáng",
    scheduledTime: "07:00"
  },
  {
    slot: "noon",
    label: "Thuốc buổi trưa",
    scheduledTime: "12:30"
  },
  {
    slot: "evening",
    label: "Thuốc buổi tối",
    scheduledTime: "19:00"
  }
];

function getVietnamNow() {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);

  const values = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
    timestamp: now
  };
}

async function ensureTodayReminders(dateKey) {
  for (const config of MEDICATION_SLOTS) {
    await MedicationReminder.updateOne(
      {
        dateKey,
        slot: config.slot
      },
      {
        $setOnInsert: {
          dateKey,
          slot: config.slot,
          label: config.label,
          scheduledTime: config.scheduledTime,
          status: "pending",
          takenAt: null,
          alertSentAt: null
        }
      },
      {
        upsert: true
      }
    );
  }
}

async function checkMedicationReminders({ io, mqttClient }) {
  try {
    const now = getVietnamNow();

    await ensureTodayReminders(now.dateKey);

    for (const config of MEDICATION_SLOTS) {
      if (now.time < config.scheduledTime) {
        continue;
      }

      // Atomic update:
      // chỉ một lần được chuyển sang overdue + đánh dấu đã gửi cảnh báo.
      const reminder = await MedicationReminder.findOneAndUpdate(
        {
          dateKey: now.dateKey,
          slot: config.slot,
          status: "pending",
          alertSentAt: null
        },
        {
          $set: {
            status: "overdue",
            alertSentAt: now.timestamp
          }
        },
        {
          returnDocument: "after"
        }
      );

      if (!reminder) {
        continue;
      }

      const alert = {
        type: "medication",
        slot: reminder.slot,
        label: reminder.label,
        scheduledTime: reminder.scheduledTime,
        status: reminder.status,
        dateKey: reminder.dateKey,
        timestamp: now.timestamp.toISOString()
      };

      console.log(
        `💊 CHƯA XÁC NHẬN UỐNG THUỐC: ${reminder.label} - ${reminder.scheduledTime}`
      );

      // Báo realtime lên Frontend.
      io.emit("medication:overdue", alert);

      // Chuyển sang Node-RED để gửi Telegram.
      if (mqttClient.connected) {
        mqttClient.publish(
          "home/medication/alert",
          JSON.stringify(alert)
        );
      }
    }
  } catch (error) {
    console.error(
      "❌ Medication scheduler:",
      error.message
    );
  }
}

function startMedicationScheduler({ io, mqttClient }) {
  console.log(
    `💊 Medication scheduler: 07:00 | 12:30 | 19:00 (${TIME_ZONE_LABEL})`
  );

  // Kiểm tra ngay khi Backend khởi động.
  checkMedicationReminders({ io, mqttClient });

  // Sau đó kiểm tra mỗi 30 giây.
  return setInterval(() => {
    checkMedicationReminders({ io, mqttClient });
  }, 30 * 1000);
}

module.exports = {
  MEDICATION_SLOTS,
  getVietnamNow,
  ensureTodayReminders,
  startMedicationScheduler
};
