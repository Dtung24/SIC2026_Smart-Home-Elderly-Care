from collections import deque


class FallDetectorV2:
    """
    Fall Detection V2.3A

    Nguyên tắc:
    - FALL là một quá trình chuyển trạng thái, không phải một tư thế.
    - BBox toàn thân chỉ là tín hiệu phụ vì tay dang có thể làm bbox rộng.
    - Core ratio loại ảnh hưởng của hai cánh tay.
    - Baseline học dáng đứng tự nhiên của từng người.
    - Pose confidence quyết định mức độ tin skeleton.
    """

    def __init__(
        self,
        history_seconds=0.8,
        fall_confirm_time=0.8,
        safe_confirm_time=2.0,
        suspicious_confirm_time=0.35,
    ):
        self.history_seconds = history_seconds
        self.fall_confirm_time = fall_confirm_time
        self.safe_confirm_time = safe_confirm_time
        self.suspicious_confirm_time = suspicious_confirm_time

        # Pose
        self.pose_quality_threshold = 0.45

        # Chuyển động theo phương dọc.
        # Không chỉ xét quãng đường tụt mà còn xét tốc độ tụt.
        # Điều này giúp phân biệt ngã thật với động tác hạ người
        # có kiểm soát như chống đẩy.
        self.vertical_drop_threshold = 0.07

        # normalized frame-height / second
        self.vertical_drop_rate_threshold = 0.18

        # Nếu tụt rất sâu thì vẫn cho phép kích hoạt dù tốc độ
        # trung bình không vượt ngưỡng, tránh bỏ sót ngã chậm.
        self.vertical_drop_strong_threshold = 0.14

        # Thay đổi hình dạng.
        self.core_ratio_growth_threshold = 0.18
        self.bbox_ratio_growth_threshold = 0.30

        # Tư thế sau chuyển động rơi.
        self.core_lying_threshold = 0.72
        self.bbox_latch_threshold = 0.82

        # Chỉ dùng bbox đơn lẻ khi cực rộng.
        # Không dùng 0.82 như V2 cũ nữa.
        self.bbox_strong_threshold = 1.15

        # So với baseline cá nhân.
        self.angle_delta_suspicious = 28.0
        self.angle_delta_shape = 22.0

        # Học baseline.
        self.baseline_angle = None
        self.baseline_core_ratio = None
        self.baseline_samples = 0

        self.baseline_min_samples = 12
        self.baseline_alpha = 0.08

        # Chỉ học baseline khi thân người vẫn mang hình dạng đứng.
        self.baseline_core_max = 0.70

        self.history = deque()

        self.fall_candidate_start = None
        self.safe_candidate_start = None
        self.suspicious_start = None

        # SAFE recovery voting:
        # Không yêu cầu 100% frame liên tục đều hoàn hảo.
        self.safe_votes = deque()
        self.safe_last_true_time = None

        # Ít nhất 80% frame trong giai đoạn recovery phải SAFE.
        self.safe_vote_ratio_required = 0.80

        # Cho phép skeleton/keypoint rung ngắn tối đa 0.45 giây.
        self.safe_gap_tolerance = 0.45

        self.fall_active = False

    @property
    def baseline_ready(self):
        return (
            self.baseline_angle is not None
            and self.baseline_core_ratio is not None
            and self.baseline_samples >= self.baseline_min_samples
        )

    def _trim_history(self, now):
        while (
            self.history
            and now - self.history[0]["time"] > self.history_seconds
        ):
            self.history.popleft()

    def _update_baseline(self, body_angle, core_ratio):
        if self.baseline_angle is None:
            self.baseline_angle = float(body_angle)
            self.baseline_core_ratio = float(core_ratio)
        else:
            a = self.baseline_alpha

            self.baseline_angle = (
                (1.0 - a) * self.baseline_angle
                + a * float(body_angle)
            )

            self.baseline_core_ratio = (
                (1.0 - a) * self.baseline_core_ratio
                + a * float(core_ratio)
            )

        self.baseline_samples += 1

    def reset(self):
        self.history.clear()

        self.fall_candidate_start = None
        self.safe_candidate_start = None
        self.suspicious_start = None

        self.safe_votes.clear()
        self.safe_last_true_time = None

        self.fall_active = False

        self.baseline_angle = None
        self.baseline_core_ratio = None
        self.baseline_samples = 0

    def update(
        self,
        now,
        person_detected,
        body_angle=None,
        body_ratio=None,
        core_ratio=None,
        center_y_norm=None,
        pose_quality=0.0,
        support_posture=False,
    ):
        pose_quality = float(pose_quality or 0.0)

        result = {
            "state": "NO_PERSON",
            "vision_state": "NO_PERSON",
            "alarm_state": (
                "FALL_ACTIVE"
                if self.fall_active
                else "CLEAR"
            ),

            "event": None,

            "fall_candidate": False,
            "fall_active": self.fall_active,

            "pose_quality": pose_quality,
            "pose_reliable": False,

            "body_ratio": body_ratio,
            "core_ratio": core_ratio,

            "vertical_drop": 0.0,
            "vertical_drop_rate": 0.0,
            "ratio_growth": 0.0,
            "bbox_ratio_growth": 0.0,

            "angle_delta": 0.0,

            "dynamic_fall": False,
            "suspicious_posture": False,
            "safe_posture": False,

            "support_posture": bool(support_posture),
            "support_preexisting": False,

            "baseline_ready": self.baseline_ready,
            "baseline_angle": self.baseline_angle,
            "baseline_core_ratio": self.baseline_core_ratio,
        }

        # -------------------------------------------------
        # KHÔNG THẤY NGƯỜI
        # -------------------------------------------------

        if (
            not person_detected
            or body_ratio is None
            or center_y_norm is None
        ):
            self.suspicious_start = None

            if self.fall_active:
                result["state"] = "PERSON_LOST"
                result["alarm_state"] = "FALL_ACTIVE"
            else:
                result["state"] = "NO_PERSON"
                result["alarm_state"] = "CLEAR"

            return result

        result["vision_state"] = "PERSON_TRACKED"

        pose_reliable = (
            body_angle is not None
            and pose_quality >= self.pose_quality_threshold
        )

        core_valid = (
            core_ratio is not None
            and core_ratio > 0
        )

        result["pose_reliable"] = pose_reliable

        # -------------------------------------------------
        # HISTORY / TEMPORAL FEATURES
        # -------------------------------------------------

        self._trim_history(now)

        previous_center_samples = [
            (item["time"], item["center_y"])
            for item in self.history
            if item["center_y"] is not None
        ]

        previous_core_ratios = [
            item["core_ratio"]
            for item in self.history
            if item["core_ratio"] is not None
        ]

        previous_bbox_ratios = [
            item["bbox_ratio"]
            for item in self.history
            if item["bbox_ratio"] is not None
        ]

        vertical_drop = 0.0
        vertical_drop_rate = 0.0
        core_ratio_growth = 0.0
        bbox_ratio_growth = 0.0

        if previous_center_samples:
            # Lấy vị trí cao nhất trong history làm mốc trước khi rơi.
            reference_time, reference_center = min(
                previous_center_samples,
                key=lambda item: item[1]
            )

            vertical_drop = (
                center_y_norm - reference_center
            )

            drop_dt = now - reference_time

            # Không tin tốc độ tính từ đúng 1 frame vì dễ dính jitter.
            if drop_dt >= 0.12 and vertical_drop > 0:
                vertical_drop_rate = (
                    vertical_drop / drop_dt
                )

        if core_valid and previous_core_ratios:
            core_ratio_growth = (
                core_ratio - min(previous_core_ratios)
            )

        if previous_bbox_ratios:
            bbox_ratio_growth = (
                body_ratio - min(previous_bbox_ratios)
            )

        # -------------------------------------------------
        # BASELINE CÁ NHÂN
        # -------------------------------------------------

        angle_delta = 0.0

        if (
            self.baseline_ready
            and pose_reliable
        ):
            angle_delta = abs(
                body_angle - self.baseline_angle
            )

        # -------------------------------------------------
        # BẰNG CHỨNG TƯ THẾ
        # -------------------------------------------------

        angle_changed = (
            self.baseline_ready
            and pose_reliable
            and angle_delta >= self.angle_delta_suspicious
        )

        # Nếu skeleton đáng tin và thân trên vẫn gần baseline,
        # đây thường là ngồi/cúi có kiểm soát chứ chưa phải tư thế ngã.
        torso_near_baseline = (
            self.baseline_ready
            and pose_reliable
            and angle_delta < self.angle_delta_shape
        )

        core_lying = (
            core_valid
            and core_ratio >= self.core_lying_threshold
        )

        # BBox chỉ là tín hiệu phụ.
        bbox_extremely_wide = (
            body_ratio >= self.bbox_strong_threshold
        )

        suspicious_evidence = (
            angle_changed
            or core_lying
            or bbox_extremely_wide
        )

        # -------------------------------------------------
        # SUPPORT / PLANK PRE-EXISTING
        # -------------------------------------------------

        # Chống đẩy/plank có đặc điểm:
        # tay đã chống sàn + thân đã ngang trước khi hạ người.
        #
        # FALL thật có thể đưa tay chống xuống SAU khi bắt đầu ngã,
        # vì vậy chỉ dùng lịch sử support trước frame hiện tại.
        support_preexisting = False

        if support_posture:
            support_start = None
            support_count = 0

            for item in reversed(self.history):
                if not item.get(
                    "support_posture",
                    False
                ):
                    break

                support_start = item["time"]
                support_count += 1

            if (
                support_start is not None
                and support_count >= 2
                and now - support_start >= 0.15
            ):
                support_preexisting = True

        # -------------------------------------------------
        # BẰNG CHỨNG CHUYỂN ĐỘNG NGÃ
        # -------------------------------------------------

        rapid_drop = (
            vertical_drop >= self.vertical_drop_threshold
            and vertical_drop_rate
            >= self.vertical_drop_rate_threshold
        )

        shape_changed = (
            core_ratio_growth >= self.core_ratio_growth_threshold
            or bbox_ratio_growth >= self.bbox_ratio_growth_threshold
            or (
                self.baseline_ready
                and pose_reliable
                and angle_delta >= self.angle_delta_shape
            )
        )

        # FALL phải có chuyển động rơi.
        dynamic_fall = (
            rapid_drop
            and shape_changed
            and not torso_near_baseline

            # Nếu người đã ở tư thế plank/chống tay ổn định
            # trước khi trọng tâm hạ xuống thì đây có khả năng
            # cao là chuyển động có kiểm soát, không phải FALL.
            and not support_preexisting
        )

        # Sau khi đã phát hiện chuyển động rơi,
        # tư thế này giúp giữ candidate tới lúc xác nhận.
        if pose_reliable:
            if self.baseline_ready:
                # Khi skeleton đáng tin, thân người phải thực sự
                # rời khỏi baseline mới được giữ FALL candidate.
                post_transition_posture = (
                    angle_delta >= self.angle_delta_shape
                )
            else:
                # Fallback lúc mới khởi động, chưa học đủ baseline.
                post_transition_posture = (
                    body_angle is not None
                    and body_angle >= 45.0
                )
        else:
            # Pose kém/góc khuất: cho hình học + temporal cứu detection.
            post_transition_posture = (
                core_lying
                or body_ratio >= self.bbox_latch_threshold
            )

        # -------------------------------------------------
        # SAFE - SO VỚI BASELINE CỦA CHÍNH NGƯỜI ĐÓ
        # -------------------------------------------------

        safe_posture = False

        if (
            pose_reliable
            and core_valid
        ):
            # SAFE tuyệt đối:
            # nếu camera đang nhìn thấy một dáng rất rõ ràng là
            # thẳng/upright thì không để baseline cũ giữ FALL mãi.
            absolute_upright_safe = (
                pose_quality >= 0.65
                and body_angle <= 25.0
                and core_ratio <= 0.55
                and body_ratio <= 0.75
            )

            baseline_safe = False

            if self.baseline_ready:
                safe_angle = (
                    abs(body_angle - self.baseline_angle)
                    <= 18.0
                )

                safe_core = (
                    core_ratio
                    <= self.baseline_core_ratio + 0.18
                )

                baseline_safe = (
                    safe_angle
                    and safe_core
                )

            else:
                baseline_safe = (
                    body_angle < 40.0
                    and core_ratio < 0.65
                )

            safe_posture = (
                absolute_upright_safe
                or baseline_safe
            )

        # -------------------------------------------------
        # LƯU HISTORY
        # -------------------------------------------------

        self.history.append(
            {
                "time": now,
                "center_y": center_y_norm,
                "core_ratio": (
                    core_ratio
                    if core_valid
                    else None
                ),
                "bbox_ratio": body_ratio,
                "angle": body_angle,
                "support_posture": bool(
                    support_posture
                ),
            }
        )

        self._trim_history(now)

        # -------------------------------------------------
        # STATE MACHINE
        # -------------------------------------------------

        if not self.fall_active:
            self.safe_candidate_start = None

            if dynamic_fall:
                if self.fall_candidate_start is None:
                    self.fall_candidate_start = now

            if self.fall_candidate_start is not None:
                candidate_active = (
                    dynamic_fall
                    or post_transition_posture
                )

                if candidate_active:
                    duration = (
                        now - self.fall_candidate_start
                    )

                    if duration >= self.fall_confirm_time:
                        self.fall_active = True

                        self.fall_candidate_start = None
                        self.suspicious_start = None

                        self.safe_candidate_start = None
                        self.safe_last_true_time = None
                        self.safe_votes.clear()

                        result["state"] = "FALL_DETECTED"
                        result["event"] = "fall"

                    else:
                        result["state"] = "FALL_CANDIDATE"

                else:
                    # Ví dụ ngồi xuống nhanh nhưng sau đó
                    # vẫn là tư thế ngồi/đứng bình thường.
                    self.fall_candidate_start = None
                    result["state"] = "NORMAL"

            else:
                # SUSPICIOUS phải tồn tại một khoảng ngắn,
                # không phản ứng với đúng 1 frame.
                if suspicious_evidence:
                    if self.suspicious_start is None:
                        self.suspicious_start = now

                    if (
                        now - self.suspicious_start
                        >= self.suspicious_confirm_time
                    ):
                        result["state"] = "SUSPICIOUS"
                    else:
                        result["state"] = "NORMAL"

                else:
                    self.suspicious_start = None
                    result["state"] = "NORMAL"

        else:
            self.suspicious_start = None

            # ---------------------------------------------
            # SAFE RECOVERY VOTING
            # ---------------------------------------------

            if self.safe_candidate_start is None:
                # Chỉ bắt đầu recovery khi lần đầu thấy tư thế SAFE.
                if safe_posture:
                    self.safe_candidate_start = now
                    self.safe_last_true_time = now

                    self.safe_votes.clear()
                    self.safe_votes.append(
                        (now, True)
                    )

                    result["state"] = "RECOVERING"

                else:
                    result["state"] = "FALL_ACTIVE"

            else:
                # Đang trong quá trình hồi phục.
                self.safe_votes.append(
                    (now, bool(safe_posture))
                )

                if safe_posture:
                    self.safe_last_true_time = now

                # Chỉ giữ voting trong cửa sổ gần nhất.
                cutoff = (
                    now - self.safe_confirm_time
                )

                while (
                    self.safe_votes
                    and self.safe_votes[0][0] < cutoff
                ):
                    self.safe_votes.popleft()

                # Nếu mất tư thế SAFE liên tục quá lâu,
                # đây không còn là jitter đơn lẻ nữa.
                safe_gap = (
                    now - self.safe_last_true_time
                    if self.safe_last_true_time is not None
                    else 999.0
                )

                if safe_gap > self.safe_gap_tolerance:
                    self.safe_candidate_start = None
                    self.safe_last_true_time = None
                    self.safe_votes.clear()

                    result["state"] = "FALL_ACTIVE"

                else:
                    safe_duration = (
                        now - self.safe_candidate_start
                    )

                    safe_count = sum(
                        1
                        for _, is_safe in self.safe_votes
                        if is_safe
                    )

                    total_count = len(
                        self.safe_votes
                    )

                    safe_ratio = (
                        safe_count / total_count
                        if total_count
                        else 0.0
                    )

                    if (
                        safe_duration >= self.safe_confirm_time
                        and safe_ratio
                        >= self.safe_vote_ratio_required
                    ):
                        self.fall_active = False

                        self.safe_candidate_start = None
                        self.safe_last_true_time = None
                        self.safe_votes.clear()

                        self.fall_candidate_start = None

                        # Giữ baseline cá nhân,
                        # chỉ xóa history chuyển động.
                        self.history.clear()

                        result["state"] = "NORMAL"
                        result["event"] = "safe"

                    else:
                        result["state"] = "RECOVERING"

        # -------------------------------------------------
        # HỌC BASELINE KHI NGƯỜI ỔN ĐỊNH
        # -------------------------------------------------

        stable_for_baseline = (
            not self.fall_active
            and self.fall_candidate_start is None
            and pose_reliable
            and core_valid

            # Không học baseline từ tư thế cúi/ngồi/chống đẩy.
            and body_angle <= 30.0
            and body_ratio <= 0.80
            and core_ratio <= 0.60

            and abs(vertical_drop) < 0.025
            and abs(core_ratio_growth) < 0.08
        )

        if stable_for_baseline:
            self._update_baseline(
                body_angle,
                core_ratio,
            )

        # -------------------------------------------------
        # RESULT
        # -------------------------------------------------

        result.update(
            {
                "fall_candidate": (
                    self.fall_candidate_start is not None
                ),
                "fall_active": self.fall_active,

                "vertical_drop": vertical_drop,
                "vertical_drop_rate": vertical_drop_rate,
                "ratio_growth": core_ratio_growth,
                "bbox_ratio_growth": bbox_ratio_growth,

                "angle_delta": angle_delta,

                "dynamic_fall": dynamic_fall,
                "suspicious_posture": suspicious_evidence,
                "safe_posture": safe_posture,

                "support_posture": bool(
                    support_posture
                ),
                "support_preexisting": (
                    support_preexisting
                ),

                "alarm_state": (
                    "FALL_ACTIVE"
                    if self.fall_active
                    else "CLEAR"
                ),

                "baseline_ready": self.baseline_ready,
                "baseline_angle": self.baseline_angle,
                "baseline_core_ratio": self.baseline_core_ratio,
            }
        )

        return result
