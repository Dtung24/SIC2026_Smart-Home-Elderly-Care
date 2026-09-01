const mongoose = require("mongoose");

const incidentSchema = new mongoose.Schema({
  room: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true
  },
  deviceId: String,
  detected: Boolean,
  confidence: Number,
  severity: {
    type: String,
    default: "critical"
  },
  snapshotPath: String,
  status: {
    type: String,
    default: "new"
  },
  timestamp: {
    type: Date,
    required: true
  }
});

module.exports = mongoose.model("Incident", incidentSchema);