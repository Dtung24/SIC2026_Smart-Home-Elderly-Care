# Node-RED Rule Engine & Automation Flows

Node-RED serves as an optional visual automation orchestrator running on the Raspberry Pi 5 (`http://localhost:1880`).

## 1. Core Rule Flows

### Rule 1: Fall Event $\rightarrow$ Buzzer Trigger + Telegram Dispatch
1. **MQTT In**: Topic `sic2026/ai/fall_event`
2. **Function Node (Validate & Format)**:
   ```javascript
   msg.payload = {
       action: "ALARM_TRIGGER",
       reason: "FALL_DETECTED",
       duration_sec: 30
   };
   return msg;
   ```
3. **MQTT Out**: Topic `sic2026/actuators/buzzer/cmd`

---

### Rule 2: Gas Leak Emergency Threshold
1. **MQTT In**: Topic `sic2026/sensors/environment`
2. **Switch Node**: Check `msg.payload.gas_alert == true` OR `msg.payload.gas_ppm_est > 100`
3. **Trigger Node**: Send `ALARM_TRIGGER` to `sic2026/actuators/buzzer/cmd` and notify Telegram bot node.

---

### Rule 3: Prolonged Inactivity Alert (Inactivity Check)
- If PIR HC-SR501 has `motion_detected == false` continuously for over 4 hours between 07:00 AM and 22:00 PM, send a gentle check-in notification to the caregiver.
