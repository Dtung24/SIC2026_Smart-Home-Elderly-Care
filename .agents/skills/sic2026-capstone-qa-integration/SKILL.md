---
name: sic2026-capstone-qa-integration
description: >-
  Quality assurance, end-to-end integration testing, Raspberry Pi 5 gateway setup, and Samsung Innovation Campus (SIC 2026) IoT scoring criteria evaluation skill. Use when running stress tests, latency benchmarks (< 2s target), simulation scripts, or preparing Capstone demo deliverables.
---

# SIC 2026 Capstone QA & System Integration Skill

This skill contains the integration verification procedures, automated stress-test scripts, Raspberry Pi 5 gateway provisioning steps, and compliance checklists aligned with the **Samsung Innovation Campus 2026 IoT Chapter** evaluation rubric.

---

## 🎯 Target Acceptance Metrics
- [x] **AI Fall Detection Precision**: $> 90\%$ accuracy on real-time 1080p stream.
- [x] **End-to-End Latency**: $< 2.0\text{ seconds}$ from fall event to Telegram snapshot received.
- [x] **MQTT Reliability**: Packet drop rate $< 1\%$ over continuous 24-hour test.
- [x] **System Autonomy**: Auto-restart on power failure using `systemd` daemon services on Pi 5.

---

## 📂 Sub-Documentation & References

- **SIC 2026 Evaluation Rubric**: [references/sic2026_evaluation_criteria.md](references/sic2026_evaluation_criteria.md)
  - Detailed breakdown of Innovation, Technical Complexity, Presentation, and Hardware Prototype scoring.
- **Raspberry Pi 5 Gateway Auto-Start Setup**: [references/pi5_gateway_setup.md](references/pi5_gateway_setup.md)
  - Mosquitto broker setup, Node.js systemd service, Python AI service daemon, and watchdog scripts.
- **Automated Mock Test Script**: [scripts/simulate_iot_traffic.py](scripts/simulate_iot_traffic.py)
  - Standalone Python utility to simulate ESP32 sensors and trigger mock fall events to benchmark end-to-end latency without physical hardware connected.

---

## ⚡ Quick End-to-End Verification Run

```bash
# 1. Start simulated MQTT sensor traffic & benchmark
python .agents/skills/sic2026-capstone-qa-integration/scripts/simulate_iot_traffic.py --duration 60 --trigger-fall
```
