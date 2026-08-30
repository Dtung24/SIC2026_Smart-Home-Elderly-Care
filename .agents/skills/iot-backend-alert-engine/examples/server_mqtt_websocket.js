/**
 * SIC 2026 - Smart Home Elderly Care System
 * Module: Central Backend Server (Express + MQTT + WebSockets + Telegram)
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mqtt = require('mqtt');
const cors = require('cors');
require('dotenv').config();

const { sendTelegramEmergencyAlert } = require('./telegram_helper');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 5000;
const MQTT_BROKER = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// In-Memory Telemetry State & Incident History
let latestTelemetry = {
  temperature: 26.0,
  humidity: 60.0,
  gas_raw: 400,
  gas_alert: false,
  motion_detected: false,
  buzzer_active: false,
  updated_at: Date.now()
};

let incidentHistory = [];

// Broadcast helper for WebSockets
function broadcastToClients(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// MQTT Connection
console.log(`[MQTT] Connecting to broker at ${MQTT_BROKER}...`);
const mqttClient = mqtt.connect(MQTT_BROKER);

mqttClient.on('connect', () => {
  console.log('[MQTT] Connected to Mosquitto broker.');
  mqttClient.subscribe('sic2026/#', (err) => {
    if (!err) console.log('[MQTT] Subscribed to topic root: sic2026/#');
  });
});

mqttClient.on('message', async (topic, message) => {
  try {
    const data = JSON.parse(message.toString());

    if (topic === 'sic2026/sensors/environment') {
      latestTelemetry = { ...latestTelemetry, ...data, updated_at: Date.now() };
      broadcastToClients({ type: 'TELEMETRY_UPDATE', payload: latestTelemetry });

      if (data.gas_alert) {
        handleGasEmergency(data);
      }
    } 
    else if (topic === 'sic2026/sensors/motion') {
      latestTelemetry.motion_detected = data.motion_detected;
      broadcastToClients({ type: 'MOTION_UPDATE', payload: data });
    } 
    else if (topic === 'sic2026/ai/fall_event') {
      handleFallEmergency(data);
    } 
    else if (topic === 'sic2026/actuators/buzzer/cmd') {
      latestTelemetry.buzzer_active = (data.action === 'ALARM_TRIGGER');
      broadcastToClients({ type: 'BUZZER_STATE', payload: data });
    }
  } catch (err) {
    console.error(`[MQTT] Error parsing message on ${topic}:`, err.message);
  }
});

async function handleFallEmergency(eventData) {
  console.log('[BACKEND] Processing FALL EMERGENCY event!');
  
  // 1. Trigger local hardware buzzer via MQTT
  mqttClient.publish('sic2026/actuators/buzzer/cmd', JSON.stringify({
    action: "ALARM_TRIGGER",
    reason: "FALL_DETECTED",
    duration_sec: 30
  }));

  // 2. Broadcast Red Alert to Web Dashboard
  broadcastToClients({ type: 'EMERGENCY_ALERT', payload: eventData });

  // 3. Save incident log
  incidentHistory.unshift({
    id: `fall_${Date.now()}`,
    type: 'FALL_DETECTED',
    timestamp: new Date().toISOString(),
    details: `Góc nghiêng thân: ${eventData.trunk_angle}° | Độ tin cậy: ${Math.round(eventData.confidence * 100)}%`
  });

  // 4. Send Telegram Bot notification with snapshot
  if (TELEGRAM_TOKEN && TELEGRAM_CHAT_ID) {
    let imgBuffer = null;
    if (eventData.image_base64) {
      imgBuffer = Buffer.from(eventData.image_base64, 'base64');
    }
    await sendTelegramEmergencyAlert(TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, {
      title: 'TÉ NGÃ BẤT THƯỜNG',
      details: `- Góc nghiêng cột sống: ${eventData.trunk_angle}°\n- Độ tin cậy: ${Math.round(eventData.confidence * 100)}%`,
      imageBuffer: imgBuffer
    });
  }
}

async function handleGasEmergency(sensorData) {
  mqttClient.publish('sic2026/actuators/buzzer/cmd', JSON.stringify({
    action: "ALARM_TRIGGER",
    reason: "GAS_LEAK",
    duration_sec: 45
  }));

  broadcastToClients({ type: 'GAS_ALERT', payload: sensorData });

  if (TELEGRAM_TOKEN && TELEGRAM_CHAT_ID) {
    await sendTelegramEmergencyAlert(TELEGRAM_TOKEN, TELEGRAM_CHAT_ID, {
      title: 'RÒ RỈ KHÍ GAS / KHÓI NGUY HIỂM',
      details: `- Chỉ số Gas Raw: ${sensorData.gas_raw}\n- Nhiệt độ phòng: ${sensorData.temperature}°C`,
      imageBuffer: null
    });
  }
}

// REST Endpoints
app.get('/api/telemetry', (req, res) => res.json(latestTelemetry));
app.get('/api/incidents', (req, res) => res.json(incidentHistory.slice(0, 50)));
app.post('/api/buzzer/mute', (req, res) => {
  mqttClient.publish('sic2026/actuators/buzzer/cmd', JSON.stringify({ action: "ALARM_STOP" }));
  res.json({ success: true, message: "Mute command sent" });
});

server.listen(PORT, () => {
  console.log(`[BACKEND] Server running on http://localhost:${PORT}`);
});
