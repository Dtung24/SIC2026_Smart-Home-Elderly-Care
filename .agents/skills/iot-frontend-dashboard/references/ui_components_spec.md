# UI Component Specifications & WebSocket Architecture

## 1. WebSocket Event Protocol (Frontend)

The frontend connects to `ws://<GATEWAY_IP>:5000` on mount.

| Event Type | Payload Schema | Action in React |
| :--- | :--- | :--- |
| `TELEMETRY_UPDATE` | `{ temperature, humidity, gas_raw, gas_alert, motion_detected }` | Updates sensor cards, redraws dynamic gauges. |
| `EMERGENCY_ALERT` | `{ event_type, timestamp, trunk_angle, confidence, image_base64 }` | Pops up Red Alert Modal, triggers audio siren sound effect. |
| `GAS_ALERT` | `{ gas_raw, temperature }` | Displays Warning Toast, highlights Gas card in pulsing Red. |
| `BUZZER_STATE` | `{ action, reason }` | Toggles Siren status indicator (Active / Silenced). |

---

## 2. Web Audio API Alarm Siren
To play emergency sounds directly without external MP3 files:

```javascript
export function playEmergencySiren() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + 0.4);

    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  } catch (e) {
    console.error("Audio playback error:", e);
  }
}
```
