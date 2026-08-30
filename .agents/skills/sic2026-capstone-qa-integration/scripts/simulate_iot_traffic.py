"""
SIC 2026 - Smart Home Elderly Care System
QA Utility: Mock Telemetry & Fall Event Simulation Script
"""

import time
import json
import random
import argparse
import paho.mqtt.client as mqtt

def generate_mock_image():
    # 1x1 blank white JPEG base64
    return "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA="

def run_simulation(broker, port, duration, trigger_fall):
    print(f"[QA SIM] Connecting to MQTT broker at {broker}:{port}...")
    client = mqtt.Client("QA_Traffic_Simulator")
    
    try:
        client.connect(broker, port, 60)
        client.loop_start()
        print("[QA SIM] Connected successfully! Starting simulated traffic...")
    except Exception as e:
        print(f"[QA SIM ERROR] Failed to connect: {e}")
        return

    start_time = time.time()
    fall_triggered = False

    try:
        while (time.time() - start_time) < duration:
            # 1. Publish mock environmental telemetry
            temp = round(random.uniform(25.0, 30.5), 1)
            hum = round(random.uniform(55.0, 75.0), 1)
            gas_raw = random.randint(300, 600)
            
            env_payload = {
                "node_id": "esp32_sensor_01",
                "timestamp": int(time.time()),
                "temperature": temp,
                "humidity": hum,
                "gas_raw": gas_raw,
                "gas_alert": False
            }
            client.publish("sic2026/sensors/environment", json.dumps(env_payload))
            print(f"[QA TELEMETRY] Temp: {temp}°C | Hum: {hum}% | Gas: {gas_raw}")

            # 2. Publish mock motion
            motion_payload = {
                "node_id": "esp32_sensor_01",
                "timestamp": int(time.time()),
                "motion_detected": random.choice([True, False])
            }
            client.publish("sic2026/sensors/motion", json.dumps(motion_payload))

            # 3. Optional Mock Fall Event trigger after 5 seconds
            if trigger_fall and not fall_triggered and (time.time() - start_time) > 5:
                print("\n🚨 [QA ALERT TRIGGER] Injecting Simulated Emergency Fall Event...")
                fall_payload = {
                    "event_type": "FALL_DETECTED",
                    "timestamp": int(time.time()),
                    "confidence": 0.97,
                    "trunk_angle": 78.4,
                    "aspect_ratio": 1.55,
                    "image_base64": generate_mock_image()
                }
                t0 = time.time()
                client.publish("sic2026/ai/fall_event", json.dumps(fall_payload), qos=1)
                print(f"[QA ALERT TRIGGER] Fall event published! (Dispatch time: {round((time.time() - t0)*1000, 2)}ms)\n")
                fall_triggered = True

            time.sleep(2)

    except KeyboardInterrupt:
        print("\n[QA SIM] Simulation interrupted by user.")
    finally:
        client.loop_stop()
        client.disconnect()
        print("[QA SIM] Simulation finished.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="SIC2026 IoT Traffic & Alert Simulator")
    parser.add_argument("--broker", default="localhost", help="MQTT Broker host (default: localhost)")
    parser.add_argument("--port", type=int, default=1883, help="MQTT Broker port (default: 1883)")
    parser.add_argument("--duration", type=int, default=30, help="Duration in seconds (default: 30)")
    parser.add_argument("--trigger-fall", action="store_true", help="Trigger a test fall event after 5s")
    args = parser.parse_args()

    run_simulation(args.broker, args.port, args.duration, args.trigger_fall)
