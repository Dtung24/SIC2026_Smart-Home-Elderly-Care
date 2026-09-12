const mongoose = require("mongoose");

const medicationReminderSchema = new mongoose.Schema(
  {
    dateKey: {
      type: String,
      required: true
    },

    slot: {
      type: String,
      enum: ["morning", "noon", "evening"],
      required: true
    },

    label: {
      type: String,
      required: true
    },

    scheduledTime: {
      type: String,
      required: true
    },

    status: {
      type: String,
      enum: ["pending", "overdue", "taken"],
      default: "pending"
    },

    takenAt: {
      type: Date,
      default: null
    },

    alertSentAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

medicationReminderSchema.index(
  { dateKey: 1, slot: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  "MedicationReminder",
  medicationReminderSchema
);
