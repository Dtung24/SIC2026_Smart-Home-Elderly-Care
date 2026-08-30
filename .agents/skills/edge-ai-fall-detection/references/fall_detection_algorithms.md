# Fall Detection Geometric & Kinematic Algorithms

## 1. Keypoints Anatomy (COCO 17-Point Format)

```text
0: Nose          5: Left Shoulder    11: Left Hip       15: Left Ankle
1: Left Eye      6: Right Shoulder   12: Right Hip      16: Right Ankle
2: Right Eye     7: Left Elbow       13: Left Knee
3: Left Ear      8: Right Elbow      14: Right Knee
4: Right Ear     9: Left Wrist
                 10: Right Wrist
```

---

## 2. Multi-Stage Detection Heuristics

To avoid false alarms caused by simple sitting on a sofa or picking up an item, a 3-tier validation logic is applied:

### Stage 1: Bounding Box Aspect Ratio ($AR$)
$$AR = \frac{\text{Width}}{\text{Height}}$$
- **Standing / Walking**: $AR < 0.8$ (Height significantly exceeds width).
- **Fallen on Floor / Horizontal**: $AR > 1.25$ (Width exceeds height).

---

### Stage 2: Spine Trunk Inclination Angle ($\theta_{\text{trunk}}$)
Calculate the vector between the midpoint of the shoulders and the midpoint of the hips:
$$P_{\text{shoulder}} = \frac{P_5 + P_6}{2} = (X_s, Y_s)$$
$$P_{\text{hip}} = \frac{P_{11} + P_{12}}{2} = (X_h, Y_h)$$

Spine vector $\vec{V} = (X_s - X_h, Y_s - Y_h)$.

The angle with the vertical axis ($Y$-axis):
$$\theta_{\text{trunk}} = \arccos\left( \frac{|\Delta Y|}{\sqrt{\Delta X^2 + \Delta Y^2}} \right) \times \frac{180^\circ}{\pi}$$

- **Normal upright posture**: $\theta_{\text{trunk}} < 35^\circ$
- **Bending / Crouching**: $35^\circ \le \theta_{\text{trunk}} \le 55^\circ$
- **Fallen State**: $\theta_{\text{trunk}} > 60^\circ$

---

### Stage 3: Temporal Stillness Confirmation Buffer ($\Delta t$)
When $AR > 1.25$ and $\theta_{\text{trunk}} > 60^\circ$, a sudden fall candidate is flagged.
- A sudden descent has high vertical centroid velocity $V_y > V_{\text{threshold}}$.
- Once the person hits the floor, they typically remain motionless if injured or unconscious.
- **Stillness Rule**: If the person remains in the fallen state for $\ge 3.0\text{ seconds}$, the system triggers **`CONFIRMED_FALL`**.
- If the person gets back up within 3 seconds, the state transitions back to `NORMAL` without firing an emergency alarm.

---

## 3. False Positive Mitigation (Bed / Couch exclusion)
- Optional virtual exclusion zones (ROI mask) for designated bed areas where lying down is normal.
- Integration with PIR motion sensor: If PIR detects continuous high activity across the room, it invalidates static camera misdetections.
