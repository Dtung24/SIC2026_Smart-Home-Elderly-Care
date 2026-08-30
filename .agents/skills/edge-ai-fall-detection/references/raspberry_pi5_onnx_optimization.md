# Raspberry Pi 5 ONNX & AI Optimization Guide

The **Raspberry Pi 5** features a Broadcom BCM2712 with a Quad-core 64-bit Arm Cortex-A76 processor running @ 2.4GHz with cryptography extensions, larger caches, and dual 4-lane MIPI camera transceivers. This architecture provides **2.5x to 3x higher AI inference performance** compared to Raspberry Pi 4.

---

## 1. Exporting YOLOv8-pose to ONNX
Export on your development machine (PC):
```bash
pip install ultralytics onnx

python -c "
from ultralytics import YOLO
model = YOLO('yolov8n-pose.pt')
model.export(format='onnx', imgsz=[384, 640], dynamic=False, simplify=True)
"
```

---

## 2. ONNX Runtime Setup on Raspberry Pi OS 64-bit (Bookworm)

Raspberry Pi OS Bookworm enforces PEP 668 (externally managed environment). Always use a dedicated Python Virtual Environment:

```bash
# Create and activate environment
python3 -m venv ~/elderly_env
source ~/elderly_env/bin/activate

# Install optimized ONNX Runtime and OpenCV
pip install onnxruntime opencv-python-headless paho-mqtt numpy ultralytics
```

---

## 3. Cortex-A76 Multi-Threading Session Options
Configure ONNX Runtime to fully utilize all 4 Cortex-A76 cores with optimized memory allocators:

```python
import onnxruntime as ort

opts = ort.SessionOptions()
opts.intra_op_num_threads = 4
opts.inter_op_num_threads = 1
opts.execution_mode = ort.ExecutionMode.ORT_SEQUENTIAL
opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

session = ort.InferenceSession(
    "models/yolov8n-pose.onnx",
    sess_options=opts,
    providers=['CPUExecutionProvider']
)
```

---

## 4. Benchmark Expectation on Pi 5
- **Input Resolution**: 640x384
- **Single Frame Inference**: ~30ms to 40ms (vs ~75ms on Pi 4).
- **Sustained Stream FPS**: **25 – 30+ FPS** with camera capturing in parallel thread.
