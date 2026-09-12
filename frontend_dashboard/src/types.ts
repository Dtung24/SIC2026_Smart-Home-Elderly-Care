export type TabType = 'home' | 'logs' | 'help';

export type SystemStatusType = 'safe' | 'warning' | 'danger';

export type BackendRoomId = 'livingroom' | 'kitchen' | 'staircase';

export type RoomId = BackendRoomId;

export interface RoomCamera {
  id: RoomId;
  name: string;
  location: string;
  imageUrl?: string;
  hasCamera: boolean;
  cameraTopic?: string; // e.g. 'home/livingroom/alert/fall'
  isLive?: boolean;
  aiStatusText: string;
  aiStatusLevel: 'safe' | 'warning' | 'danger';
  personDetected: boolean;
  activityNote: string;
  lastMotionTime: string;
}

export interface RoomSensorData {
  temperature: number | null;
  humidity: number | null;
  motion: boolean | null;
  gas: number | null;
}

export interface SensorState {
  gasStatus: 'normal' | 'warning' | 'danger';
  // MQ-2 hiện chưa hiệu chuẩn theo ppm.
  // Giá trị thật từ ESP32 là ADC thô, ngưỡng cảnh báo 2200.
  gasRawAdc?: number | null;

  temperature: number | null; // °C
  humidity: number | null; // %
  lastUpdated: string;
  systemStatus: SystemStatusType;
  // Per-room real-time telemetry state
  rooms: {
    livingroom: RoomSensorData;
    kitchen: RoomSensorData;
    staircase: RoomSensorData;
  };
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  timeAgo: string;
  type: 'ai_camera' | 'gas' | 'climate' | 'sos' | 'medication' | 'system';
  title: string;
  detail: string;
  level: 'info' | 'success' | 'warning' | 'danger';
  room?: string;
  snapshotUrl?: string;
  resolved?: boolean;
}

export interface EmergencyContact {
  id: string;
  name: string;
  relation: string;
  phone: string;
  telegramUsername?: string;
  telegramUrl?: string;
  avatar: string;
  isPrimary: boolean;
  notes?: string;
}

export type MedicationSlot = 'morning' | 'noon' | 'evening';
export type MedicationStatus = 'pending' | 'overdue' | 'taken';

export interface MedicationReminder {
  id: string;
  dateKey: string;
  slot: MedicationSlot;
  time: string;
  name: string;
  status: MedicationStatus;
  taken: boolean;
  takenAt: string | null;
  note: string;
}

export interface BackendMedicationReminder {
  _id?: string;
  id?: string;
  dateKey: string;
  slot: MedicationSlot;
  label: string;
  scheduledTime: string;
  status: MedicationStatus;
  takenAt: string | null;
  alertSentAt?: string | null;
}

export interface BackendMedicationEvent {
  id?: string;
  dateKey: string;
  slot: MedicationSlot;
  label: string;
  scheduledTime: string;
  status: MedicationStatus;
  takenAt?: string | null;
  timestamp?: string;
}

// Backend Contract Types (http://192.168.1.8:3000)
export interface BackendTelemetryLatest {
  livingroom: {
    temperature: number | null;
    humidity: number | null;
    motion: boolean | number | null;
    gas: number | null;
  };
  kitchen: {
    temperature: number | null;
    humidity: number | null;
    motion: boolean | number | null;
    gas: number | null;
  };
  staircase: {
    temperature: number | null;
    humidity: number | null;
    motion: boolean | number | null;
    gas: number | null;
  };
  updatedAt: string | null;
}

export type SensorDataType = 'temperature' | 'humidity' | 'motion' | 'gas';

export interface BackendTelemetryUpdate {
  room: RoomId;
  sensorType: SensorDataType;
  value: number | boolean;
  unit: string;
  timestamp: string;
}

export interface BackendAlertNew {
  id?: string;
  topic?: string; // e.g. 'home/livingroom/alert/fall'
  room: RoomId | string;
  type: 'fall' | 'gas';
  deviceId?: string;
  detected: boolean;
  severity?: 'critical' | 'warning' | 'info';
  confidence?: number;
  snapshotPath?: string;
  timestamp?: string;
  status?: 'new' | 'acknowledged' | 'resolved';
}

export interface BackendIncident {
  id: string;
  room: string;
  type: 'fall' | 'gas';
  deviceId?: string;
  detected: boolean;
  severity: 'critical' | 'warning' | 'info';
  confidence?: number;
  snapshotPath?: string;
  timestamp: string;
  status: 'new' | 'acknowledged' | 'resolved';
  resolvedAt?: string;
}

export interface AiChatResponse {
  success: boolean;
  answer: string;
  source: 'gemini' | 'local-fallback';
  model: string | null;
  fallbackUsed?: boolean;
  contextUpdatedAt?: string | null;
}

export interface BackendDeviceStatus {
  deviceId: string;
  status: 'online' | 'offline' | 'warning';
  lastSeen: string;
  ip?: string;
}

export type LightRoomId =
  | 'livingroom'
  | 'kitchen'
  | 'staircase';

export type LightAction =
  | 'ON'
  | 'OFF'
  | 'AUTO';

export interface BackendLightState {
  livingroom: boolean;
  kitchen: boolean;
  staircase: boolean;
  staircaseMode: 'AUTO' | 'ON' | 'OFF';
  updatedAt: string | null;
}

export interface BackendLightUpdate {
  room: LightRoomId;
  state?: boolean;
  mode?: 'AUTO' | 'ON' | 'OFF';
  timestamp: string;
}
