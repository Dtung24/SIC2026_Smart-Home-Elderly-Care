---
name: iot-frontend-dashboard
description: >-
  Expert guide and UI/UX design patterns for building the React.js / TailwindCSS Web Dashboard in the SIC2026 Elderly Care project. Use when developing real-time telemetry gauges (temperature, humidity, air quality), live camera video feeds with skeleton overlay, emergency red alert modals with sound sirens, and incident history tables.
---

# IoT Frontend Web Dashboard Skill (Elderly Care)

This skill guides the construction of the real-time caregiver monitoring dashboard built with **React**, **TailwindCSS**, **Lucide Icons**, and **WebSockets**.

---

## 🎨 UI/UX Design System & Layout Requirements
- **Theme**: Clean Medical / Healthcare aesthetic (Slate 900 background, Cyan / Emerald indicators, Rose 500 for critical emergencies).
- **Responsive Grid**:
  1. **Top Bar**: System status (ESP32 online / offline, AI Vision status, current time, Mute Siren button).
  2. **Main Live View (Left / Top on Mobile)**: Video stream player with toggleable YOLOv8-pose skeleton overlay & FPS counter.
  3. **Sensor Telemetry Cards (Right / Bottom on Mobile)**:
     - 🌡️ Temperature (°C) & Humidity (%) gauge with comfort range color coding.
     - 🔥 MQ-2 Gas PPM gauge with safety threshold indicator.
     - 🚶 Motion & Presence status badge (PIR HC-SR501).
  4. **Emergency Red Alert Modal**: Fullscreen or popup overlay with audio warning chime when `EMERGENCY_ALERT` arrives over WebSockets.
  5. **Incident Audit Trail**: Table of recent fall events, gas alerts, and timestamps.

---

## 📂 Sub-Documentation & References

- **Component Specifications & State Architecture**: [references/ui_components_spec.md](references/ui_components_spec.md)
  - WebSocket event hook, audio synth siren, and responsive Tailwind layouts.
- **Dashboard Component Template**: [examples/DashboardLayout.jsx](examples/DashboardLayout.jsx)
  - Ready-to-use React component structure.
