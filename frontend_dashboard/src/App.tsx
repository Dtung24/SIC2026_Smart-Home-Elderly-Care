import { useState, useEffect } from 'react';
import { TabType, RoomId, EmergencyContact, BackendTelemetryLatest, BackendTelemetryUpdate, BackendAlertNew } from './types';
import {
  INITIAL_ROOMS,
  INITIAL_SENSOR_STATE,
  INITIAL_LOGS,
  INITIAL_CONTACTS,
  INITIAL_MEDICATIONS,
} from './data/mockData';
import { Header } from './components/Header';
import { StatusBanner } from './components/StatusBanner';
import { CameraLiveCard } from './components/CameraLiveCard';
import { GasSensorCard } from './components/GasSensorCard';
import { AirQualityCard } from './components/AirQualityCard';
import { ClimateCard } from './components/ClimateCard';
import { BottomNav } from './components/BottomNav';
import { LogScreen } from './components/LogScreen';
import { HelpScreen } from './components/HelpScreen';
import { EmergencyModal } from './components/EmergencyModal';
import { SimulationBar } from './components/SimulationBar';
import { playSuccessChime, playWarningBeep, speakVietnamese } from './utils/audio';
import { backendService } from './services/backendService';
import { Home, Utensils, BedDouble, Send, PhoneCall, ExternalLink } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [rooms, setRooms] = useState(INITIAL_ROOMS);
  const [selectedRoomId, setSelectedRoomId] = useState<RoomId>('livingroom');
  const [sensors, setSensors] = useState(INITIAL_SENSOR_STATE);
  const [logs, setLogs] = useState(INITIAL_LOGS);
  const [contacts] = useState<EmergencyContact[]>(INITIAL_CONTACTS);
  const [medications, setMedications] = useState(INITIAL_MEDICATIONS);
  const [isEmergencyOpen, setIsEmergencyOpen] = useState(false);
  const [alertMessage, setAlertMessage] = useState<string | undefined>();
  const [activeCallingContact, setActiveCallingContact] = useState<EmergencyContact | null>(null);

  const getRoomName = (roomId: string) => {
    switch (roomId) {
      case 'kitchen': return 'Nhà Bếp';
      case 'bedroom': return 'Phòng Ngủ';
      default: return 'Phòng Khách';
    }
  };

  // Backend Socket.IO and REST Integration Lifecycle
  useEffect(() => {
    // 1. Initiate Socket.IO Connection
    backendService.connectSocket();

    // 2. Fetch Initial REST Telemetry & Incidents
    const fetchInitialData = async () => {
      const latestTelemetry = await backendService.fetchLatestTelemetry();
      if (latestTelemetry) {
        handleApplyTelemetryLatest(latestTelemetry);
      }

      const incidents = await backendService.fetchIncidents();
      if (incidents && Array.isArray(incidents) && incidents.length > 0) {
        setLogs((prev) => {
          const newIncidentLogs = incidents.map((inc) => ({
            id: inc.id || `inc-${Date.now()}`,
            timestamp: inc.timestamp ? new Date(inc.timestamp).toLocaleTimeString('vi-VN') + ' - Gần đây' : 'Vừa xong',
            timeAgo: 'Gần đây',
            type: (inc.type === 'fall' ? 'ai_camera' : 'gas') as any,
            title: inc.type === 'fall' ? 'CẢNH BÁO AI: Phát hiện té ngã' : 'CẢNH BÁO: Rò rỉ khí Gas',
            detail: `Sự cố ${inc.type === 'fall' ? 'té ngã' : 'khí gas'} ghi nhận tại ${getRoomName(inc.room)} (Thiết bị: ${inc.deviceId || 'ESP32/Pi'}).`,
            level: 'danger' as const,
            room: getRoomName(inc.room),
            resolved: inc.status === 'resolved',
            snapshotUrl: inc.snapshotPath,
          }));
          // Merge avoiding duplicates
          const existingIds = new Set(prev.map((l) => l.id));
          const toAdd = newIncidentLogs.filter((l) => !existingIds.has(l.id));
          return [...toAdd, ...prev];
        });
      }
    };

    fetchInitialData();

    // 3. Subscribe to Socket.IO event: telemetry:latest
    const unsubLatest = backendService.subscribeTelemetryLatest((data: BackendTelemetryLatest) => {
      handleApplyTelemetryLatest(data);
    });

    // 4. Subscribe to Socket.IO event: telemetry:update
    const unsubUpdate = backendService.subscribeTelemetryUpdate((data: BackendTelemetryUpdate) => {
      const { room, sensorType, value } = data;
      const roomKey = (room === 'kitchen' || room === 'bedroom' ? room : 'livingroom') as RoomId;

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

        if (sensorType === 'temperature' && typeof value === 'number') {
          if (roomKey === 'livingroom') {
            next.temperature = Math.round(value * 10) / 10;
          }
        } else if (sensorType === 'humidity' && typeof value === 'number') {
          if (roomKey === 'livingroom') {
            next.humidity = Math.round(value);
          }
        } else if (sensorType === 'gas' && typeof value === 'number') {
          const gasVal = Math.round(value);
          const maxGas = Math.max(
            roomKey === 'livingroom' ? gasVal : (nextRooms.livingroom?.gas ?? 0),
            roomKey === 'kitchen' ? gasVal : (nextRooms.kitchen?.gas ?? 0),
            roomKey === 'bedroom' ? gasVal : (nextRooms.bedroom?.gas ?? 0)
          );

          next.gasLevelPpm = maxGas;
          next.gasStatus = maxGas >= 50 ? 'danger' : maxGas >= 30 ? 'warning' : 'normal';

          if (gasVal >= 50) {
            next.systemStatus = 'danger';
            setAlertMessage(`Cảnh báo rò rỉ khí Gas (${gasVal} ppm) tại ${getRoomName(roomKey)}!`);
            playWarningBeep();
            speakVietnamese(`Cảnh báo nguy hiểm! Phát hiện rò rỉ khí gas tại ${getRoomName(roomKey)}.`);
          }
        }

        return next;
      });

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
    const unsubAlert = backendService.subscribeAlertNew((alert: BackendAlertNew) => {
      const alertId = alert.id || `alert-${Date.now()}`;
      const alertRoom = alert.room || 'livingroom';
      const isFall = alert.type === 'fall' || alert.topic === 'home/livingroom/alert/fall';

      if (isFall) {
        setRooms((prev) =>
          prev.map((r) =>
            r.id === 'livingroom'
              ? {
                  ...r,
                  aiStatusText: 'AI: Phát hiện té ngã khẩn cấp!',
                  aiStatusLevel: 'danger',
                  activityNote: `Độ tin cậy ${Math.round((alert.confidence || 0.95) * 100)}% - Phòng Khách (home/livingroom/alert/fall)`,
                }
              : r
          )
        );
        setSensors((prev) => ({ ...prev, systemStatus: 'danger' }));
        setAlertMessage('Camera AI phát hiện té ngã tại Phòng Khách (home/livingroom/alert/fall)!');
        playWarningBeep();
        speakVietnamese('Cảnh báo khẩn cấp! Camera AI phát hiện té ngã tại Phòng Khách.');

        setLogs((prev) => [
          {
            id: alertId,
            timestamp: new Date().toLocaleTimeString('vi-VN') + ' - Vừa xong',
            timeAgo: 'Vừa xong',
            type: 'ai_camera',
            title: 'CẢNH BÁO AI: Phát hiện té ngã (home/livingroom/alert/fall)',
            detail: `Camera Phòng Khách nhận diện té ngã (Độ tin cậy ${Math.round((alert.confidence || 0.95) * 100)}%).`,
            level: 'danger',
            room: 'Phòng Khách',
            resolved: false,
            snapshotUrl: alert.snapshotPath,
          },
          ...prev,
        ]);
      } else if (alert.type === 'gas') {
        const roomName = getRoomName(alertRoom);
        setSensors((prev) => ({
          ...prev,
          gasStatus: 'danger',
          gasLevelPpm: 88,
          systemStatus: 'danger',
        }));
        setAlertMessage(`Cảm biến phát hiện rò rỉ khí gas tại ${roomName}!`);
        playWarningBeep();
        speakVietnamese(`Cảnh báo nguy hiểm! Cảm biến phát hiện rò rỉ khí gas tại ${roomName}.`);

        setLogs((prev) => [
          {
            id: alertId,
            timestamp: new Date().toLocaleTimeString('vi-VN') + ' - Vừa xong',
            timeAgo: 'Vừa xong',
            type: 'gas',
            title: `CẢNH BÁO: Rò rỉ khí Gas tại ${roomName}`,
            detail: `Cảm biến nồng độ gas cảnh báo mức nguy hiểm qua MQTT (${alert.topic || `home/${alertRoom}/alert/gas`}). Đã phát chuông báo động và gửi thông báo khẩn cấp.`,
            level: 'danger',
            room: roomName,
            resolved: false,
          },
          ...prev,
        ]);
      }
    });

    return () => {
      unsubLatest();
      unsubUpdate();
      unsubAlert();
    };
  }, []);

  const handleApplyTelemetryLatest = (data: BackendTelemetryLatest) => {
    if (!data) return;
    const lr = data.livingroom;
    const kt = data.kitchen;
    const br = data.bedroom;

    setSensors((prev) => {
      const nextRooms = {
        livingroom: {
          temperature: typeof lr?.temperature === 'number' ? Math.round(lr.temperature * 10) / 10 : prev.rooms?.livingroom?.temperature ?? 26.5,
          humidity: typeof lr?.humidity === 'number' ? Math.round(lr.humidity) : prev.rooms?.livingroom?.humidity ?? 55,
          motion: typeof lr?.motion === 'boolean' ? lr.motion : prev.rooms?.livingroom?.motion ?? true,
          gas: typeof lr?.gas === 'number' ? Math.round(lr.gas) : prev.rooms?.livingroom?.gas ?? 12,
        },
        kitchen: {
          temperature: typeof kt?.temperature === 'number' ? Math.round(kt.temperature * 10) / 10 : prev.rooms?.kitchen?.temperature ?? 28.0,
          humidity: typeof kt?.humidity === 'number' ? Math.round(kt.humidity) : prev.rooms?.kitchen?.humidity ?? 62,
          motion: typeof kt?.motion === 'boolean' ? kt.motion : prev.rooms?.kitchen?.motion ?? false,
          gas: typeof kt?.gas === 'number' ? Math.round(kt.gas) : prev.rooms?.kitchen?.gas ?? 15,
        },
        bedroom: {
          temperature: typeof br?.temperature === 'number' ? Math.round(br.temperature * 10) / 10 : prev.rooms?.bedroom?.temperature ?? 25.2,
          humidity: typeof br?.humidity === 'number' ? Math.round(br.humidity) : prev.rooms?.bedroom?.humidity ?? 50,
          motion: typeof br?.motion === 'boolean' ? br.motion : prev.rooms?.bedroom?.motion ?? false,
          gas: typeof br?.gas === 'number' ? Math.round(br.gas) : prev.rooms?.bedroom?.gas ?? 8,
        },
      };

      const maxGas = Math.max(
        nextRooms.livingroom.gas ?? 0,
        nextRooms.kitchen.gas ?? 0,
        nextRooms.bedroom.gas ?? 0
      );
      const gasStatus = maxGas >= 50 ? 'danger' : maxGas >= 30 ? 'warning' : 'normal';
      const systemStatus = (gasStatus === 'danger' || prev.systemStatus === 'danger') ? 'danger' : gasStatus === 'warning' ? 'warning' : 'safe';

      return {
        ...prev,
        rooms: nextRooms,
        temperature: nextRooms.livingroom.temperature ?? prev.temperature,
        humidity: nextRooms.livingroom.humidity ?? prev.humidity,
        gasLevelPpm: maxGas,
        gasStatus,
        systemStatus,
        lastUpdated: 'Vừa xong (REST & Socket.IO)',
      };
    });

    if (lr && typeof lr.motion === 'boolean') {
      setRooms((prev) =>
        prev.map((r) => {
          if (r.id === 'livingroom') {
            return {
              ...r,
              personDetected: lr.motion!,
              lastMotionTime: lr.motion ? 'Vừa phát hiện' : r.lastMotionTime,
              activityNote: lr.motion ? 'Bà đang sinh hoạt tại phòng khách' : 'Phòng yên tĩnh',
            };
          }
          if (r.id === 'kitchen' && kt && typeof kt.motion === 'boolean') {
            return {
              ...r,
              personDetected: kt.motion,
              lastMotionTime: kt.motion ? 'Vừa phát hiện' : r.lastMotionTime,
            };
          }
          if (r.id === 'bedroom' && br && typeof br.motion === 'boolean') {
            return {
              ...r,
              personDetected: br.motion,
              lastMotionTime: br.motion ? 'Vừa phát hiện' : r.lastMotionTime,
            };
          }
          return r;
        })
      );
    }
  };

  // Simulation handlers
  const handleSetSafe = () => {
    setSensors(INITIAL_SENSOR_STATE);
    setRooms(INITIAL_ROOMS);
    setAlertMessage(undefined);
    playSuccessChime();
    speakVietnamese('Trạng thái cả ba phòng trong ngôi nhà đã trở về an toàn.');
    
    // Add log
    setLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('vi-VN') + ' - Vừa xong',
        timeAgo: 'Vừa xong',
        type: 'system',
        title: 'Hệ thống 3 phòng an toàn',
        detail: 'Tất cả cảm biến tại Phòng Khách, Nhà Bếp, Phòng Ngủ và Camera AI Phòng Khách đều hoạt động ổn định.',
        level: 'success',
        resolved: true,
      },
      ...prev,
    ]);
  };

  const handleSimulateGasLeak = () => {
    setSensors((prev) => ({
      ...prev,
      gasStatus: 'danger',
      gasLevelPpm: 88,
      systemStatus: 'danger',
      rooms: {
        ...prev.rooms,
        kitchen: {
          ...prev.rooms.kitchen,
          gas: 88,
        },
      },
    }));
    setAlertMessage('Phát hiện nồng độ khí Gas vượt ngưỡng ở Nhà Bếp (88 ppm)!');
    playWarningBeep();
    speakVietnamese('Cảnh báo nguy hiểm! Phát hiện khí Gas vượt ngưỡng ở Nhà Bếp.');

    setLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('vi-VN') + ' - Vừa xong',
        timeAgo: 'Vừa xong',
        type: 'gas',
        title: 'CẢNH BÁO: Rò rỉ khí Gas (Nhà Bếp)',
        detail: 'Nồng độ khí gas đo được 88 ppm qua topic home/kitchen/alert/gas (Vượt ngưỡng an toàn 50 ppm). Hệ thống đã phát còi báo động và thông báo đến người thân.',
        level: 'danger',
        room: 'Nhà Bếp',
        resolved: false,
      },
      ...prev,
    ]);
  };

  const handleSimulateFall = () => {
    setRooms((prev) =>
      prev.map((r) =>
        r.id === 'livingroom'
          ? {
              ...r,
              aiStatusText: 'AI: Phát hiện tư thế té ngã!',
              aiStatusLevel: 'danger',
              activityNote: 'Cần kiểm tra bà ngay lập tức tại phòng khách (home/livingroom/alert/fall)',
            }
          : r
      )
    );
    setSensors((prev) => ({
      ...prev,
      systemStatus: 'danger',
    }));
    setAlertMessage('Camera AI phát hiện tư thế té ngã bất thường tại Phòng Khách (home/livingroom/alert/fall)!');
    playWarningBeep();
    speakVietnamese('Cảnh báo khẩn cấp! Camera AI phát hiện tư thế té ngã tại Phòng Khách.');

    setLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('vi-VN') + ' - Vừa xong',
        timeAgo: 'Vừa xong',
        type: 'ai_camera',
        title: 'CẢNH BÁO AI: Phát hiện té ngã (home/livingroom/alert/fall)',
        detail: 'Camera Phòng Khách nhận diện chuyển động rơi ngã bất thường. Đã gửi thông báo khẩn cấp đến người thân.',
        level: 'danger',
        room: 'Phòng Khách',
        resolved: false,
      },
      ...prev,
    ]);
  };

  const handleSimulateHighTemp = () => {
    setSensors((prev) => ({
      ...prev,
      temperature: 38,
      humidity: 42,
      systemStatus: 'warning',
      rooms: {
        ...prev.rooms,
        bedroom: {
          ...prev.rooms.bedroom,
          temperature: 38,
          humidity: 42,
        },
      },
    }));
    setAlertMessage('Nhiệt độ Phòng Ngủ tăng cao (38°C), nguy cơ sốc nhiệt đối với người cao tuổi!');
    playWarningBeep();
    speakVietnamese('Cảnh báo. Nhiệt độ phòng ngủ tăng cao 38 độ C.');

    setLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('vi-VN') + ' - Vừa xong',
        timeAgo: 'Vừa xong',
        type: 'climate',
        title: 'Cảnh báo nhiệt độ cao (Phòng Ngủ)',
        detail: 'Nhiệt độ phòng ngủ lên tới 38°C. Khuyến nghị bật điều hòa làm mát cho bà.',
        level: 'warning',
        room: 'Phòng Ngủ',
        resolved: false,
      },
      ...prev,
    ]);
  };

  const handleSimulateAirPollution = () => {
    setSensors((prev) => ({
      ...prev,
      airQuality: 'moderate',
      aqi: 118,
      pm25: 48,
      systemStatus: 'warning',
    }));
    setAlertMessage('Chất lượng không khí ở mức trung bình, bụi mịn PM2.5 tăng!');
    playWarningBeep();

    setLogs((prev) => [
      {
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('vi-VN') + ' - Vừa xong',
        timeAgo: 'Vừa xong',
        type: 'air',
        title: 'Chỉ số bụi mịn PM2.5 tăng',
        detail: 'AQI 118. Đã tự động tăng công suất máy lọc không khí Phòng Khách.',
        level: 'warning',
        room: 'Phòng Khách',
        resolved: false,
      },
      ...prev,
    ]);
  };

  const handleToggleMedication = (id: string) => {
    setMedications((prev) =>
      prev.map((m) => {
        if (m.id === id) {
          const nextState = !m.taken;
          if (nextState) {
            playSuccessChime();
            speakVietnamese(`Đã xác nhận uống ${m.name}`);
          }
          return {
            ...m,
            taken: nextState,
            note: nextState
              ? `Đã uống lúc ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
              : 'Chưa uống',
          };
        }
        return m;
      })
    );
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
    setLogs((prev) =>
      prev.map((l) => (l.id === id ? { ...l, resolved: true } : l))
    );
    // Call backend REST PATCH /api/incidents/:id/status
    backendService.updateIncidentStatus(id, 'resolved');
    playSuccessChime();
  };

  const unreadAlertsCount = logs.filter((l) => (l.level === 'warning' || l.level === 'danger') && !l.resolved).length;
  const livingRoomCamera = rooms.find((r) => r.id === 'livingroom') || rooms[0];

  return (
    <div className="min-h-screen bg-[#f3f4f6] text-[#191c1d] flex flex-col font-sans">
      {/* Simulation Floating Action Toolbar */}
      <SimulationBar
        currentStatus={sensors.systemStatus}
        onSetSafe={handleSetSafe}
        onSimulateGasLeak={handleSimulateGasLeak}
        onSimulateFall={handleSimulateFall}
        onSimulateHighTemp={handleSimulateHighTemp}
        onSimulateAirPollution={handleSimulateAirPollution}
      />

      {/* Top Header: "ElderHome AI" & "KHẨN CẤP" */}
      <Header
        onEmergencyClick={() => setIsEmergencyOpen(true)}
        systemStatus={sensors.systemStatus}
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
              onResetStatus={handleSetSafe}
            />

            {/* Room Selector Pills for the 3 Rooms */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-2 shadow-xs flex items-center gap-1.5">
              <button
                onClick={() => setSelectedRoomId('livingroom')}
                className={`flex-1 py-2 px-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  selectedRoomId === 'livingroom'
                    ? 'bg-[#003f87] text-white shadow-sm ring-2 ring-[#003f87]/20'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Home className="w-3.5 h-3.5" />
                <span>Phòng Khách</span>
              </button>

              <button
                onClick={() => setSelectedRoomId('kitchen')}
                className={`flex-1 py-2 px-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  selectedRoomId === 'kitchen'
                    ? 'bg-[#003f87] text-white shadow-sm ring-2 ring-[#003f87]/20'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Utensils className="w-3.5 h-3.5" />
                <span>Nhà Bếp</span>
              </button>

              <button
                onClick={() => setSelectedRoomId('bedroom')}
                className={`flex-1 py-2 px-2.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  selectedRoomId === 'bedroom'
                    ? 'bg-[#003f87] text-white shadow-sm ring-2 ring-[#003f87]/20'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <BedDouble className="w-3.5 h-3.5" />
                <span>Phòng Ngủ</span>
              </button>
            </div>

            {/* 2. Camera Live Card: Only in livingroom with topic home/livingroom/alert/fall */}
            <CameraLiveCard
              livingRoom={livingRoomCamera}
              onSimulateFall={handleSimulateFall}
            />

            {/* 3. Gas Sensor Card: "Khí Gas" */}
            <GasSensorCard
              sensors={sensors}
              selectedRoomId={selectedRoomId}
              onSimulateGasAlert={handleSimulateGasLeak}
            />

            {/* 4. Air Quality Card: "Không khí" */}
            <AirQualityCard sensors={sensors} />

            {/* 5. Climate Card: "Nhiệt độ & Độ ẩm" */}
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
