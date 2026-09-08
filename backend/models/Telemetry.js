const mongoose = require("mongoose");

const telemetrySchema = new mongoose.Schema({
  room: {
    type: String,
    required: true
  },
  sensorType: {
    type: String,
    required: true
  },
  deviceId: {
    type: String,
    required: true
  },
  value: mongoose.Schema.Types.Mixed,
  unit: String,
  timestamp: {
    type: Date,
    required: true
  }
});

module.exports = mongoose.model("Telemetry", telemetrySchema);