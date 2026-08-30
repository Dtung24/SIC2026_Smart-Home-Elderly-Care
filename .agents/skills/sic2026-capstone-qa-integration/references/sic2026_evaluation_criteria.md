# Samsung Innovation Campus (SIC 2026) IoT Evaluation Criteria

To achieve top tier ranking in the Capstone evaluation, the project aligns with the official 4-pillar rubric:

---

## 1. Technical Complexity & Depth (35%)
- **Edge AI Implementation**: Effective on-device inference using YOLOv8-pose with ONNX Runtime on Raspberry Pi 5 (ARM Cortex-A76 @ 2.4GHz) achieving 25-30+ FPS without cloud reliance.
- **Hardware Integration**: Multi-node ESP32 architecture using ADC analog filtering, digital interrupt debounce, and safety voltage divider circuitry.
- **Network Protocol Robustness**: Clean MQTT hierarchical namespace with QoS 1 for alarms, Keep-Alive, and Last Will & Testament (LWT) node status management.

---

## 2. Practical Applicability & Social Impact (25%)
- Solves a real-world aging population crisis: elderly living alone, risk of unassisted falls, gas leaks, and heat exhaustion.
- **Non-intrusive advantage**: Zero wearable requirement eliminates user friction and battery charging forgetfulness.
- **Privacy Preservation**: Video stream stays within local Edge Gateway; only cropped emergency snapshots dispatched upon incident confirmation.

---

## 3. Innovation & User Experience (20%)
- Sub-2-second instant multi-channel alert pipeline (Local Buzzer + Mobile Telegram + Web Dashboard).
- Responsive real-time caregiver interface with live skeleton rendering and dynamic telemetry telemetry.

---

## 4. Completeness, Code Quality & Presentation (20%)
- Modular code architecture (`ai_vision/`, `firmware_esp32/`, `backend/`, `frontend_dashboard/`).
- Fully automated deployment, systemd daemons, structured Git commit history, and live working physical prototype.
