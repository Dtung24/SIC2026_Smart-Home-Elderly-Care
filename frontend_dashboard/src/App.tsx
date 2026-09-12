import { useState, useEffect, useRef } from 'react';
import {
  TabType,
  RoomId,
  EmergencyContact,
  BackendTelemetryLatest,
  BackendTelemetryUpdate,
  BackendAlertNew,
  BackendMedicationReminder,
  BackendMedicationEvent,
  MedicationReminder,
} from './types';
import {
  INITIAL_ROOMS,
  INITIAL_SENSOR_STATE,
  INITIAL_LOGS,
  INITIAL_CONTACTS,
} from './data/mockData';
import { Header } from './components/Header';
import { StatusBanner } from './components/StatusBanner';
import { CameraLiveCard } from './components/CameraLiveCard';
import { GasSensorCard } from './components/GasSensorCard';
import { ClimateCard } from './components/ClimateCard';
import { LightControlCard } from './components/LightControlCard';

import { BottomNav } from './components/BottomNav';
import { LogScreen } from './components/LogScreen';
import { HelpScreen } from './components/HelpScreen';
import { EmergencyModal } from './components/EmergencyModal';
import { playSuccessChime, playWarningBeep, speakVietnamese } from './utils/audio';
import { backendService } from './services/backendService';
import { Home, Send, PhoneCall, ExternalLink } from 'lucide-react';

const GAS_THRESHOLD_RAW = 2200;

const normalizeMotion = (
  value: boolean | number | null | undefined
): boolean | null => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  return null;
};

const mapMedicationReminder = (
  item: BackendMedicationReminder | BackendMedicationEvent
): MedicationReminder => {
  const takenAt = item.takenAt ?? null;

  let note = 'Chưa đến giờ uống';

  if (item.status === 'taken') {
    note = takenAt
      ? `Đã uống lúc ${new Date(takenAt).toLocaleTimeString('vi-VN', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Ho_Chi_Minh',
        })}`
      : 'Đã xác nhận uống thuốc';
  } else if (item.status === 'overdue') {
    note = 'Đã quá giờ uống - chưa xác nhận';
  }

  return {
    id:
      ('_id' in item && item._id) ||
      item.id ||
      `${item.dateKey}-${item.slot}`,
    dateKey: item.dateKey,
    slot: item.slot,
    time: item.scheduledTime,
    name: item.label,
    status: item.status,
    taken: item.status === 'taken',
    takenAt,
    note,
  };
};

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [rooms, setRooms] = useState(INITIAL_ROOMS);
  const [selectedRoomId, setSelectedRoomId] = useState<RoomId>('livingroom');
  const [sensors, setSensors] = useState(INITIAL_SENSOR_STATE);
  const [logs, setLogs] = useState(INITIAL_LOGS);
  const [contacts] = useState<EmergencyContact[]>(INITIAL_CONTACTS);
  const [medications, setMedications] = useState<MedicationReminder[]>([]);
  const [backendConnected, setBackendConnected] = useState<boolean | null>(null);
  const [telemetryReady, setTelemetryReady] = useState(false);
  const [medicationLoading, setMedicationLoading] = useState(true);
  const [isEmergencyOpen, setIsEmergencyOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | undefined>();
  const [activeCallingContact, setActiveCallingContact] = useState<EmergencyContact | null>(null);

  // Gas là cảnh báo theo trạng thái cảm biến thực tế:
  // vượt ngưỡng -> danger, xuống ngưỡng -> tự hết danger.
  const gasDangerActiveRef = useRef(false);

  // Té ngã là sự cố cần người dùng xác nhận đã xử lý.
  // Có thể tồn tại nhiều incident té ngã chưa xử lý cùng lúc.
  const activeFallIncidentIdsRef = useRef<Set<string>>(new Set());

  const getRoomName = (roomId: string) => {
    switch (roomId) {
      case 'livingroom':
        return 'Phòng Khách';
      case 'kitchen':
        return 'Nhà Bếp';
      case 'staircase':
        return 'Cầu Thang';
      default:
        return roomId;
    }
  };

  // Backend Socket.IO and REST Integration Lifecycle
  useEffect(() => {
    // 1. Initiate Socket.IO Connection
    backendService.connectSocket();

    const unsubConnection =
      backendService.subscribeConnectionStatus((connected) => {
        setBackendConnected(connected);

        // Khi Backend kết nối/reconnect thành công,
        // tải lại lịch thuốc thật để không giữ mảng rỗng cũ.
        if (connected) {
          setMedicationLoading(true);

          backendService.fetchMedicationsToday()
            .then((data) => {
              if (data) {
                setMedications(
                  data.map(mapMedicationReminder)
                );
              }
            })
            .finally(() => {
              setMedicationLoading(false);
            });
        }
      });

    // 2. Fetch Initial REST Telemetry & Incidents
    const fetchInitialData = async () => {
      const latestTelemetry = await backendService.fetchLatestTelemetry();
      if (latestTelemetry) {
        handleApplyTelemetryLatest(latestTelemetry);
      }

      const incidents = await backendService.fetchIncidents();
      if (incidents && Array.isArray(incidents) && incidents.length > 0) {
        const newIncidentLogs = incidents.map((inc, index) => {
          const incidentId = String(
            inc.id || `inc-${inc.timestamp || index}`
          );

          return {
            id: incidentId,
            timestamp: inc.timestamp
              ? new Date(inc.timestamp).toLocaleTimeString('vi-VN') + ' - Gần đây'
              : 'Vừa xong',
            timeAgo: 'Gần đây',
            type: (inc.type === 'fall' ? 'ai_camera' : 'gas') as any,
            title:
              inc.type === 'fall'
                ? 'CẢNH BÁO AI: Phát hiện té ngã'
                : 'CẢNH BÁO: Rò rỉ khí Gas',
            detail:
              `Sự cố ${inc.type === 'fall' ? 'té ngã' : 'khí gas'} ghi nhận tại ${getRoomName(inc.room)} (Thiết bị: ${inc.deviceId || 'ESP32/Pi'}).`,
            level: 'danger' as const,
            room: getRoomName(inc.room),
            resolved: inc.status === 'resolved',
            snapshotUrl: inc.snapshotPath,
          };
        });

        const unresolvedFallIds = newIncidentLogs
          .filter(
            (log) =>
              log.type === 'ai_camera' &&
              !log.resolved
          )
          .map((log) => log.id);

        activeFallIncidentIdsRef.current =
          new Set(unresolvedFallIds);

        if (unresolvedFallIds.length > 0) {
          setSensors((prev) => ({
            ...prev,
            systemStatus: 'danger',
          }));

          setAlertMessage(
            'Camera AI có sự cố té ngã tại Phòng Khách chưa được xử lý.'
          );
        }

        setLogs((prev) => {
          const existingIds =
            new Set(prev.map((log) => log.id));

          const toAdd = newIncidentLogs.filter(
            (log) => !existingIds.has(log.id)
          );

          return [...toAdd, ...prev];
        });
      }

      setMedicationLoading(true);

      const medicationData =
        await backendService.fetchMedicationsToday();

      if (medicationData) {
        const mapped = medicationData.map(mapMedicationReminder);
        setMedications(mapped);

        const overdue = mapped.find(
          (item) => item.status === 'overdue'
        );

        if (overdue) {
          setAlertMessage(
            `Chưa xác nhận ${overdue.name} lúc ${overdue.time}.`
          );
        }
      }

      setMedicationLoading(false);
    };

    fetchInitialData();

    // 3. Subscribe to Socket.IO event: telemetry:latest
    const unsubLatest = backendService.subscribeTelemetryLatest((data: BackendTelemetryLatest) => {
      setTelemetryReady(true);
      handleApplyTelemetryLatest(data);
    });

    // 4. Subscribe to Socket.IO event: telemetry:update
    const unsubUpdate = backendService.subscribeTelemetryUpdate((data: BackendTelemetryUpdate) => {
      setTelemetryReady(true);

      const { room, sensorType, value } = data;
      if (
        room !== 'livingroom' &&
        room !== 'kitchen' &&
        room !== 'staircase'
      ) {
        console.warn('[Frontend] Bỏ qua telemetry room không hợp lệ:', room);
        return;
      }

      const roomKey = room as RoomId;

      let gasTransition: 'entered' | 'cleared' | null = null;
      let currentGasRawAdc: number | null = null;

      if (
        sensorType === 'gas' &&
        typeof value === 'number' &&
        roomKey === 'kitchen'
      ) {
        currentGasRawAdc = Math.round(value);

        const wasDanger =
          gasDangerActiveRef.current;

        const isDanger =
          currentGasRawAdc >= GAS_THRESHOLD_RAW;

        gasDangerActiveRef.current = isDanger;

        if (isDanger && !wasDanger) {
          gasTransition = 'entered';
        } else if (!isDanger && wasDanger) {
          gasTransition = 'cleared';
        }
      }

      setSensors((prev) => {
        const nextRooms = {
          ...prev.rooms,
          [roomKey]: {
            ...prev.rooms[roomKey],
            [sensorType]: value,
          },
        };

        const next = {
          ...prev,
          rooms: nextRooms,
          lastUpdated: 'Vừa xong (Socket.IO)',
        };

        if (
          sensorType === 'temperature' &&
          typeof value === 'number'
        ) {
          if (roomKey === 'livingroom') {
            next.temperature =
              Math.round(value * 10) / 10;
          }
        } else if (
          sensorType === 'humidity' &&
          typeof value === 'number'
        ) {
          if (roomKey === 'livingroom') {
            next.humidity = Math.round(value);
          }
        } else if (currentGasRawAdc !== null) {
          next.gasRawAdc = currentGasRawAdc;

          next.gasStatus =
            gasDangerActiveRef.current
              ? 'danger'
              : 'normal';

          next.systemStatus =
            gasDangerActiveRef.current ||
            activeFallIncidentIdsRef.current.size > 0
              ? 'danger'
              : 'safe';
        }

        return next;
      });

      if (
        gasTransition === 'entered' &&
        currentGasRawAdc !== null
      ) {
        setAlertMessage(
          `Cảnh báo khí Gas tại Nhà Bếp (${currentGasRawAdc} raw_adc)!`
        );

        playWarningBeep();

        speakVietnamese(
          'Cảnh báo nguy hiểm! Cảm biến khí Gas tại Nhà Bếp vượt ngưỡng.'
        );
      }

      if (gasTransition === 'cleared') {
        if (
          activeFallIncidentIdsRef.current.size > 0
        ) {
          setAlertMessage(
            'Camera AI có sự cố té ngã tại Phòng Khách chưa được xử lý.'
          );
        } else {
          setAlertMessage((prevMessage) => {
            if (
              prevMessage?.toLowerCase().includes('gas')
            ) {
              return undefined;
            }

            return prevMessage;
          });
        }
      }

      if (sensorType === 'motion') {
        const hasMotion = Boolean(value);
        setRooms((prev) =>
          prev.map((r) =>
            r.id === roomKey
              ? {
                  ...r,
                  personDetected: hasMotion,
                  lastMotionTime: hasMotion ? 'Vừa phát hiện' : r.lastMotionTime,
                  activityNote: hasMotion ? `Phát hiện chuyển động tại ${r.name}` : 'Phòng yên tĩnh',
                }
              : r
          )
        );
      }
    });

    // 5. Subscribe to Socket.IO event: alert:new
    const unsubAlert =
      backendService.subscribeAlertNew(
        (alert: BackendAlertNew) => {
          const alertId =
            String(alert.id || `alert-${Date.now()}`);

          const alertRoom =
            alert.room || 'livingroom';

          const isFall =
            alert.type === 'fall' ||
            alert.topic ===
              'home/livingroom/alert/fall';

          if (isFall) {
            const isNewFall =
              !activeFallIncidentIdsRef.current.has(
                alertId
              );

            activeFallIncidentIdsRef.current.add(
              alertId
            );

            setRooms((prev) =>
              prev.map((room) =>
                room.id === 'livingroom'
                  ? {
                      ...room,
                      aiStatusText:
                        'AI: Phát hiện té ngã khẩn cấp!',
                      aiStatusLevel: 'danger',
                      activityNote:
                        `Độ tin cậy ${Math.round((alert.confidence || 0.95) * 100)}% - Phòng Khách (home/livingroom/alert/fall)`,
                    }
                  : room
              )
            );

            setSensors((prev) => ({
              ...prev,
              systemStatus: 'danger',
            }));

            setAlertMessage(
              'Camera AI phát hiện té ngã tại Phòng Khách (home/livingroom/alert/fall)!'
            );

            if (isNewFall) {
              playWarningBeep();

              speakVietnamese(
                'Cảnh báo khẩn cấp! Camera AI phát hiện té ngã tại Phòng Khách.'
              );
            }

            setLogs((prev) => {
              if (
                prev.some(
                  (log) => log.id === alertId
                )
              ) {
                return prev;
              }

              return [
                {
                  id: alertId,
                  timestamp:
                    new Date().toLocaleTimeString(
                      'vi-VN'
                    ) + ' - Vừa xong',
                  timeAgo: 'Vừa xong',
                  type: 'ai_camera',
                  title:
                    'CẢNH BÁO AI: Phát hiện té ngã (home/livingroom/alert/fall)',
                  detail:
                    `Camera Phòng Khách nhận diện té ngã (Độ tin cậy ${Math.round((alert.confidence || 0.95) * 100)}%).`,
                  level: 'danger',
                  room: 'Phòng Khách',
                  resolved: false,
                  snapshotUrl:
                    alert.snapshotPath,
                },
                ...prev,
              ];
            });

            return;
          }

          if (alert.type === 'gas') {
            const roomName =
              getRoomName(alertRoom);

            const shouldNotify =
              !gasDangerActiveRef.current;

            gasDangerActiveRef.current = true;

            setSensors((prev) => ({
              ...prev,
              gasStatus: 'danger',
              systemStatus: 'danger',
            }));

            setAlertMessage(
              `Cảm biến phát hiện rò rỉ khí gas tại ${roomName}!`
            );

            if (shouldNotify) {
              playWarningBeep();

              speakVietnamese(
                `Cảnh báo nguy hiểm! Cảm biến phát hiện rò rỉ khí gas tại ${roomName}.`
              );
            }

            setLogs((prev) => {
              if (
                prev.some(
                  (log) => log.id === alertId
                )
              ) {
                return prev;
              }

              return [
                {
                  id: alertId,
                  timestamp:
                    new Date().toLocaleTimeString(
                      'vi-VN'
                    ) + ' - Vừa xong',
                  timeAgo: 'Vừa xong',
                  type: 'gas',
                  title:
                    `CẢNH BÁO: Rò rỉ khí Gas tại ${roomName}`,
                  detail:
                    `Cảm biến khí Gas cảnh báo mức nguy hiểm qua MQTT (${alert.topic || `home/${alertRoom}/alert/gas`}).`,
                  level: 'danger',
                  room: roomName,
                  resolved: false,
                },
                ...prev,
              ];
            });
          }
        }
      );

    const unsubMedicationUpdate =
      backendService.subscribeMedicationUpdate(
        (data: BackendMedicationEvent) => {
          const mapped = mapMedicationReminder(data);

          setMedications((prev) => {
            const exists = prev.some(
              (item) =>
                item.slot === mapped.slot &&
                item.dateKey === mapped.dateKey
            );

            if (!exists) {
              return [...prev, mapped];
            }

            return prev.map((item) =>
              item.slot === mapped.slot &&
              item.dateKey === mapped.dateKey
                ? mapped
                : item
            );
          });
        }
      );

    const unsubMedicationOverdue =
      backendService.subscribeMedicationOverdue(
        (data: BackendMedicationEvent) => {
          const mapped = mapMedicationReminder(data);

          setMedications((prev) => {
            const exists = prev.some(
              (item) =>
                item.slot === mapped.slot &&
                item.dateKey === mapped.dateKey
            );

            if (!exists) {
              return [...prev, mapped];
            }

            return prev.map((item) =>
              item.slot === mapped.slot &&
              item.dateKey === mapped.dateKey
                ? mapped
                : item
            );
          });

          setAlertMessage(
            `Quá giờ uống thuốc: ${mapped.name} lúc ${mapped.time}.`
          );

          playWarningBeep();
          speakVietnamese(
            `Nhắc uống thuốc. Chưa xác nhận ${mapped.name}.`
          );

          setLogs((prev) => [
            {
              id: `medication-${mapped.dateKey}-${mapped.slot}`,
              timestamp:
                new Date().toLocaleTimeString('vi-VN') +
                ' - Vừa xong',
              timeAgo: 'Vừa xong',
              type: 'medication',
              title: `Nhắc uống thuốc lúc ${mapped.time}`,
              detail: `${mapped.name}: chưa xác nhận đã uống.`,
              level: 'danger',
              room: 'Hệ thống',
              resolved: false,
            },
            ...prev.filter(
              (item) =>
                item.id !==
                `medication-${mapped.dateKey}-${mapped.slot}`
            ),
          ]);
        }
      );

    return () => {
      unsubConnection();
      unsubLatest();
      unsubUpdate();
      unsubAlert();
      unsubMedicationUpdate();
      unsubMedicationOverdue();
    };
  }, []);

  const handleApplyTelemetryLatest = (data: BackendTelemetryLatest) => {
    setTelemetryReady(true);
    if (!data) return;
    const lr = data.livingroom;
    const kt = data.kitchen;
    const st = data.staircase;

    setSensors((prev) => {
      const nextRooms = {
        livingroom: {
          temperature: typeof lr?.temperature === 'number'
            ? Math.round(lr.temperature * 10) / 10
            : prev.rooms?.livingroom?.temperature ?? null,
          humidity: typeof lr?.humidity === 'number'
            ? Math.round(lr.humidity)
            : prev.rooms?.livingroom?.humidity ?? null,
          motion: normalizeMotion(lr?.motion) ?? prev.rooms?.livingroom?.motion ?? false,
          gas: typeof lr?.gas === 'number'
            ? Math.round(lr.gas)
            : prev.rooms?.livingroom?.gas ?? null,
        },
        kitchen: {
          temperature: typeof kt?.temperature === 'number'
            ? Math.round(kt.temperature * 10) / 10
            : prev.rooms?.kitchen?.temperature ?? null,
          humidity: typeof kt?.humidity === 'number'
            ? Math.round(kt.humidity)
            : prev.rooms?.kitchen?.humidity ?? null,
          motion: normalizeMotion(kt?.motion) ?? prev.rooms?.kitchen?.motion ?? false,
          gas: typeof kt?.gas === 'number'
            ? Math.round(kt.gas)
            : prev.rooms?.kitchen?.gas ?? null,
        },
        staircase: {
          temperature: typeof st?.temperature === 'number'
            ? Math.round(st.temperature * 10) / 10
            : prev.rooms?.staircase?.temperature ?? null,
          humidity: typeof st?.humidity === 'number'
            ? Math.round(st.humidity)
            : prev.rooms?.staircase?.humidity ?? null,
          motion: normalizeMotion(st?.motion)
            ?? prev.rooms?.staircase?.motion
            ?? false,
          gas: typeof st?.gas === 'number'
            ? Math.round(st.gas)
            : prev.rooms?.staircase?.gas ?? null,
        },
      };

      const kitchenGasRawAdc =
        typeof nextRooms.kitchen.gas === 'number'
          ? nextRooms.kitchen.gas
          : null;

      const gasStatus =
        kitchenGasRawAdc !== null &&
        kitchenGasRawAdc >= GAS_THRESHOLD_RAW
          ? 'danger'
          : 'normal';

      gasDangerActiveRef.current =
        gasStatus === 'danger';

      const systemStatus =
        gasDangerActiveRef.current ||
        activeFallIncidentIdsRef.current.size > 0
          ? 'danger'
          : 'safe';

      return {
        ...prev,
        rooms: nextRooms,
        temperature:
          nextRooms.livingroom.temperature ??
          prev.temperature,
        humidity:
          nextRooms.livingroom.humidity ??
          prev.humidity,
        gasRawAdc: kitchenGasRawAdc,
        gasStatus,
        systemStatus,
        lastUpdated: 'Vừa xong (REST & Socket.IO)',
      };
    });

    const lrMotion = normalizeMotion(lr?.motion);
    const ktMotion = normalizeMotion(kt?.motion);
    const stMotion = normalizeMotion(st?.motion);

    setRooms((prev) =>
      prev.map((r) => {
        if (r.id === 'livingroom' && lrMotion !== null) {
          return {
            ...r,
            personDetected: lrMotion,
            lastMotionTime: lrMotion ? 'Vừa phát hiện' : r.lastMotionTime,
            activityNote: lrMotion
              ? 'Phát hiện chuyển động tại phòng khách'
              : 'Phòng yên tĩnh',
          };
        }

        if (r.id === 'kitchen' && ktMotion !== null) {
          return {
            ...r,
            personDetected: ktMotion,
            lastMotionTime: ktMotion ? 'Vừa phát hiện' : r.lastMotionTime,
          };
        }

        if (r.id === 'staircase' && stMotion !== null) {
          return {
            ...r,
            personDetected: stMotion,
            lastMotionTime: stMotion
              ? 'Vừa phát hiện'
              : r.lastMotionTime,
            activityNote: stMotion
              ? 'Phát hiện chuyển động tại cầu thang'
              : 'Cầu thang yên tĩnh',
          };
        }


        return r;
      })
    );
  };

  // Simulation handlers
  const handleToggleMedication = async (id: string) => {
    const current = medications.find((item) => item.id === id);

    if (!current || current.taken) {
      return;
    }

    const result = await backendService.markMedicationTaken(
      current.slot
    );

    if (!result) {
      setAlertMessage(
        'Không thể xác nhận uống thuốc. Vui lòng kiểm tra kết nối Backend.'
      );
      playWarningBeep();
      return;
    }

    const mapped = mapMedicationReminder(result);

    setMedications((prev) =>
      prev.map((item) =>
        item.slot === mapped.slot &&
        item.dateKey === mapped.dateKey
          ? mapped
          : item
      )
    );

    playSuccessChime();
    speakVietnamese(`Đã xác nhận uống ${mapped.name}`);

    setAlertMessage((prev) => {
      if (
        prev?.startsWith('Quá giờ uống thuốc:') ||
        prev?.startsWith('Chưa xác nhận ')
      ) {
        return undefined;
      }

      return prev;
    });

    setLogs((prev) => [
      {
        id: `medication-taken-${mapped.dateKey}-${mapped.slot}`,
        timestamp:
          new Date().toLocaleTimeString('vi-VN') +
          ' - Vừa xong',
        timeAgo: 'Vừa xong',
        type: 'medication',
        title: `Đã uống thuốc lúc ${mapped.time}`,
        detail: `${mapped.name} đã được xác nhận.`,
        level: 'success',
        room: 'Hệ thống',
        resolved: true,
      },
      ...prev,
    ]);
  };

  const handleCallContact = (contact: EmergencyContact) => {
    setActiveCallingContact(contact);
    if (contact.telegramUsername) {
      speakVietnamese(`Đang kết nối cuộc gọi Telegram đến ${contact.name}`);
    } else {
      speakVietnamese(`Đang kết nối cuộc gọi khẩn cấp đến ${contact.name}`);
    }
  };

  const handleResolveLog = (id: string) => {
    const target =
      logs.find((log) => log.id === id);

    if (!target) {
      return;
    }

    const nextLogs =
      logs.map((log) =>
        log.id === id
          ? { ...log, resolved: true }
          : log
      );

    setLogs(nextLogs);

    if (target.type === 'ai_camera') {
      const remainingFallIds =
        nextLogs
          .filter(
            (log) =>
              log.type === 'ai_camera' &&
              log.level === 'danger' &&
              !log.resolved
          )
          .map((log) => log.id);

      activeFallIncidentIdsRef.current =
        new Set(remainingFallIds);

      const stillDanger =
        gasDangerActiveRef.current ||
        remainingFallIds.length > 0;

      setSensors((prev) => ({
        ...prev,
        systemStatus:
          stillDanger ? 'danger' : 'safe',
      }));

      if (remainingFallIds.length > 0) {
        setAlertMessage(
          'Camera AI vẫn còn sự cố té ngã chưa được xử lý.'
        );
      } else if (
        gasDangerActiveRef.current
      ) {
        setAlertMessage(
          sensors.gasRawAdc !== null &&
          sensors.gasRawAdc !== undefined
            ? `Cảnh báo khí Gas tại Nhà Bếp (${sensors.gasRawAdc} raw_adc)!`
            : 'Cảm biến khí Gas tại Nhà Bếp đang ở mức nguy hiểm!'
        );
      } else {
        setAlertMessage((prevMessage) =>
          prevMessage
            ?.toLowerCase()
            .includes('té ngã')
            ? undefined
            : prevMessage
        );
      }
    }

    backendService.updateIncidentStatus(
      id,
      'resolved'
    );

    playSuccessChime();
  };

  const unreadAlertsCount = logs.filter((l) => (l.level === 'warning' || l.level === 'danger') && !l.resolved).length;
  const livingRoomCamera = rooms.find((r) => r.id === 'livingroom') || rooms[0];

  return (
    <div className="min-h-screen bg-[#f3f4f6] text-[#191c1d] flex flex-col font-sans">
      {/* Top Header: "ElderHome AI" & "KHẨN CẤP" */}
      <Header
        onEmergencyClick={() => setIsEmergencyOpen(true)}
        systemStatus={sensors.systemStatus}
        telemetryReady={telemetryReady}
      />

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-md mx-auto px-4 py-4 flex flex-col gap-4">
        {/* TAB 1: TRANG CHỦ (Home Screen matching screenshot exactly) */}
        {activeTab === 'home' && (
          <div className="flex flex-col gap-4 pb-24 animate-fadeIn">
            {/* 1. Status Banner: "Trạng thái: AN TOÀN" */}
            <StatusBanner
              status={sensors.systemStatus}
              alertMessage={alertMessage}
              telemetryReady={telemetryReady}
            />

            {/* Điều khiển 3 đèn thật qua Backend -> MQTT -> ESP32 */}
            <LightControlCard />

            {/* Room selector removed */}
            <div className="hidden" aria-hidden="true" />

            {/* 2. Camera Live Card: Only in livingroom with topic home/livingroom/alert/fall */}
            <CameraLiveCard
              livingRoom={livingRoomCamera}
            />

            {/* 3. Gas Sensor Card: "Khí Gas" */}
            <GasSensorCard
              sensors={sensors}
              selectedRoomId={selectedRoomId}
            />

            {/* 4. Climate Card: "Nhiệt độ & Độ ẩm" */}
            <ClimateCard
              sensors={sensors}
              selectedRoomId={selectedRoomId}
              onSelectRoom={setSelectedRoomId}
            />
          </div>
        )}

        {/* TAB 2: NHẬT KÝ (Activity & Safety History) */}
        {activeTab === 'logs' && (
          <LogScreen
            logs={logs}
            onResolveLog={handleResolveLog}
          />
        )}

        {/* TAB 3: TRỢ GIÚP (Help, Emergency Contacts & Caregiver Hub) */}
        {activeTab === 'help' && (
          <HelpScreen
            contacts={contacts}
            medications={medications}
            medicationLoading={medicationLoading}
            backendConnected={backendConnected}
            sensors={sensors}
            rooms={rooms}
            onToggleMedication={handleToggleMedication}
            onCallContact={handleCallContact}
          />
        )}
      </main>

      {/* Bottom Navigation Bar: "Trang chủ", "Nhật ký", "Trợ giúp" */}
      <BottomNav
        activeTab={activeTab}
        onChangeTab={(tab) => {
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        unreadLogsCount={unreadAlertsCount}
      />

      {/* Emergency Full-screen Modal (Triggered by KHẨN CẤP button) */}
      <EmergencyModal
        isOpen={isEmergencyOpen}
        onClose={() => setIsEmergencyOpen(false)}
        contacts={contacts}
      />

      {/* Telegram / Phone Call Overlay */}
      {activeCallingContact && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-sm text-center flex flex-col items-center gap-4 shadow-2xl border border-slate-200">
            {activeCallingContact.avatar ? (
              <img
                src={activeCallingContact.avatar}
                alt={activeCallingContact.name}
                className={`w-20 h-20 rounded-full object-cover border-4 shadow-md ${
                  activeCallingContact.telegramUsername ? 'border-[#229ED9]' : 'border-emerald-500'
                }`}
              />
            ) : (
              <div
                className={`w-20 h-20 rounded-full font-black text-2xl flex items-center justify-center border-4 shadow-md ${
                  activeCallingContact.telegramUsername
                    ? 'bg-sky-100 text-[#0088cc] border-[#229ED9]'
                    : 'bg-emerald-100 text-emerald-800 border-emerald-500'
                }`}
              >
                {activeCallingContact.name.slice(0, 3)}
              </div>
            )}

            <div>
              <div
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold mb-2 ${
                  activeCallingContact.telegramUsername
                    ? 'bg-sky-100 text-[#0088cc]'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {activeCallingContact.telegramUsername ? (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Cuộc gọi thoại Telegram</span>
                  </>
                ) : (
                  <>
                    <PhoneCall className="w-3.5 h-3.5" />
                    <span>Đang gọi đường dây khẩn cấp</span>
                  </>
                )}
              </div>
              <h3 className="text-xl font-black text-slate-900">
                {activeCallingContact.name}
              </h3>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">
                {activeCallingContact.relation}
              </p>
              {activeCallingContact.telegramUsername && (
                <p className="text-sm font-mono font-bold text-[#0088cc] mt-1.5">
                  @{activeCallingContact.telegramUsername}
                </p>
              )}
              <p className="text-xs font-mono text-slate-400 mt-0.5">{activeCallingContact.phone}</p>
            </div>

            {activeCallingContact.telegramUrl && (
              <a
                href={activeCallingContact.telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-3 px-4 bg-[#229ED9] hover:bg-[#1d8cc4] text-white font-bold rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md"
              >
                <Send className="w-4 h-4" />
                <span>Mở app Telegram gọi ngay</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-80" />
              </a>
            )}

            <button
              onClick={() => setActiveCallingContact(null)}
              className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-2xl active:scale-95 transition-all cursor-pointer shadow-sm"
            >
              Kết thúc cuộc gọi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
