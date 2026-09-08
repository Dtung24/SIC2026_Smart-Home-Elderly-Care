export type TabType = 'home' | 'logs' | 'help';

export type SystemStatusType = 'safe' | 'warning' | 'danger';

export type RoomId = 'livingroom' | 'kitchen' | 'bedroom';

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
  gasLevelPpm: number;
  airQuality: 'clean' | 'moderate' | 'poor';
  aqi: number;
  pm25: number;
  temperature: number; // °C
  humidity: number; // %
  lastUpdated: string;
  systemStatus: SystemStatusType;
  // Per-room real-time telemetry state
  rooms: {
    livingroom: RoomSensorData;
    kitchen: RoomSensorData;
    bedroom: RoomSensorData;
  };
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  timeAgo: string;
  type: 'ai_camera' | 'gas' | 'air' | 'climate' | 'sos' | 'medication' | 'system';
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

export interface MedicationReminder {
  id: string;
  time: string;
  name: string;
  dosage: string;
  taken: boolean;
  note: string;
}

// Backend Contract Types (http://192.168.1.8:3000)
export interface BackendTelemetryLatest {
  livingroom: {
    temperature: number | null;
    humidity: number | null;
    motion: boolean | null;
    gas: number | null;
  };
  kitchen: {
    temperature: number | null;
    humidity: number | null;
    motion: boolean | null;
    gas: number | null;
  };
  bedroom: {
    temperature: number | null;
    humidity: number | null;
    motion: boolean | null;
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

export interface BackendDeviceStatus {
  deviceId: string;
  status: 'online' | 'offline' | 'warning';
  lastSeen: string;
  ip?: string;
}
