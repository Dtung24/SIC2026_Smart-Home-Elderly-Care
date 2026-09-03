import { io, Socket } from 'socket.io-client';
import {
  BackendTelemetryLatest,
  BackendTelemetryUpdate,
  BackendAlertNew,
  BackendDeviceStatus,
  BackendIncident,
} from '../types';

// Default base URL from Backend Contract
export const DEFAULT_BACKEND_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_BACKEND_URL) ||
  'http://192.168.1.8:3000';

class BackendService {
  private baseUrl: string = DEFAULT_BACKEND_URL;
  private socket: Socket | null = null;
  private isConnected: boolean = false;
  private connectionStatusListeners: Set<(connected: boolean, url: string) => void> = new Set();
  private telemetryLatestListeners: Set<(data: BackendTelemetryLatest) => void> = new Set();
  private telemetryUpdateListeners: Set<(data: BackendTelemetryUpdate) => void> = new Set();
  private alertListeners: Set<(alert: BackendAlertNew) => void> = new Set();
  private deviceStatusListeners: Set<(status: BackendDeviceStatus) => void> = new Set();

  constructor() {
    // Load persisted custom URL if any
    if (typeof window !== 'undefined') {
      const savedUrl = localStorage.getItem('tam_an_backend_url');
      if (savedUrl) {
        this.baseUrl = savedUrl;
      }
    }
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public setBaseUrl(url: string) {
    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `http://${cleanUrl}`;
    }
    // Remove trailing slash
    cleanUrl = cleanUrl.replace(/\/+$/, '');
    this.baseUrl = cleanUrl;

    if (typeof window !== 'undefined') {
      localStorage.setItem('tam_an_backend_url', cleanUrl);
    }

    // Reconnect socket with new URL
    this.connectSocket();
  }

  public resetToDefaultUrl() {
    this.setBaseUrl(DEFAULT_BACKEND_URL);
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }

  public subscribeConnectionStatus(callback: (connected: boolean, url: string) => void): () => void {
    this.connectionStatusListeners.add(callback);
    callback(this.isConnected, this.baseUrl);
    return () => this.connectionStatusListeners.delete(callback);
  }

  public subscribeTelemetryLatest(callback: (data: BackendTelemetryLatest) => void): () => void {
    this.telemetryLatestListeners.add(callback);
    return () => this.telemetryLatestListeners.delete(callback);
  }

  public subscribeTelemetryUpdate(callback: (data: BackendTelemetryUpdate) => void): () => void {
    this.telemetryUpdateListeners.add(callback);
    return () => this.telemetryUpdateListeners.delete(callback);
  }

  public subscribeAlertNew(callback: (alert: BackendAlertNew) => void): () => void {
    this.alertListeners.add(callback);
    return () => this.alertListeners.delete(callback);
  }

  public subscribeDeviceStatus(callback: (status: BackendDeviceStatus) => void): () => void {
    this.deviceStatusListeners.add(callback);
    return () => this.deviceStatusListeners.delete(callback);
  }

  private notifyConnectionStatus(connected: boolean) {
    this.isConnected = connected;
    this.connectionStatusListeners.forEach((cb) => cb(connected, this.baseUrl));
  }

  public connectSocket() {
    if (this.socket) {
      try {
        this.socket.disconnect();
      } catch (err) {
        console.warn('Socket disconnect error:', err);
      }
      this.socket = null;
    }

    try {
      this.socket = io(this.baseUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
        timeout: 8000,
      });

      this.socket.on('connect', () => {
        console.log(`[Socket.IO] Connected to ${this.baseUrl} (ID: ${this.socket?.id})`);
        this.notifyConnectionStatus(true);
      });

      this.socket.on('disconnect', (reason) => {
        console.warn(`[Socket.IO] Disconnected from ${this.baseUrl}:`, reason);
        this.notifyConnectionStatus(false);
      });

      this.socket.on('connect_error', (error) => {
        console.warn(`[Socket.IO] Connection error to ${this.baseUrl}:`, error.message);
        this.notifyConnectionStatus(false);
      });

      // Contract Event: telemetry:latest
      this.socket.on('telemetry:latest', (data: BackendTelemetryLatest) => {
        console.log('[Socket.IO Event] telemetry:latest received:', data);
        this.telemetryLatestListeners.forEach((cb) => cb(data));
      });

      // Contract Event: telemetry:update
      this.socket.on('telemetry:update', (data: BackendTelemetryUpdate) => {
        console.log('[Socket.IO Event] telemetry:update received:', data);
        this.telemetryUpdateListeners.forEach((cb) => cb(data));
      });

      // Contract Event: alert:new
      this.socket.on('alert:new', (alert: BackendAlertNew) => {
        console.log('[Socket.IO Event] alert:new received:', alert);
        this.alertListeners.forEach((cb) => cb(alert));
      });

      // Contract Event: device:status
      this.socket.on('device:status', (status: BackendDeviceStatus) => {
        console.log('[Socket.IO Event] device:status received:', status);
        this.deviceStatusListeners.forEach((cb) => cb(status));
      });
    } catch (err) {
      console.warn('[Socket.IO] Init failed:', err);
      this.notifyConnectionStatus(false);
    }
  }

  public disconnectSocket() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.notifyConnectionStatus(false);
    }
  }

  // --- REST API Endpoints ---

  /**
   * GET /api/telemetry/latest
   * Lấy data mới nhất khi F5 Dashboard
   */
  public async fetchLatestTelemetry(): Promise<BackendTelemetryLatest | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/telemetry/latest`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
      }
      const data: BackendTelemetryLatest = await res.json();
      return data;
    } catch (err) {
      console.warn(`[REST API] Failed to fetch /api/telemetry/latest from ${this.baseUrl}:`, err);
      return null;
    }
  }

  /**
   * GET /api/telemetry/history
   * Lấy tối đa 50 bản ghi sensor gần nhất
   */
  public async fetchTelemetryHistory(): Promise<BackendTelemetryUpdate[] | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/telemetry/history`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      return Array.isArray(data) ? data : data.history || [];
    } catch (err) {
      console.warn(`[REST API] Failed to fetch /api/telemetry/history from ${this.baseUrl}:`, err);
      return null;
    }
  }

  /**
   * GET /api/incidents
   * Lấy lịch sử fall/gas alert
   */
  public async fetchIncidents(): Promise<BackendIncident[] | null> {
    try {
      const res = await fetch(`${this.baseUrl}/api/incidents`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      return Array.isArray(data) ? data : data.incidents || [];
    } catch (err) {
      console.warn(`[REST API] Failed to fetch /api/incidents from ${this.baseUrl}:`, err);
      return null;
    }
  }

  /**
   * PATCH /api/incidents/:id/status
   * Body: { "status": "acknowledged" } hoặc { "status": "resolved" }
   */
  public async updateIncidentStatus(
    id: string,
    status: 'acknowledged' | 'resolved'
  ): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/incidents/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
      }
      return true;
    } catch (err) {
      console.warn(`[REST API] Failed to patch incident ${id} status:`, err);
      return false;
    }
  }
}

// Singleton backend service instance
export const backendService = new BackendService();
