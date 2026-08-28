// Tipos compartidos entre el adaptador de dispositivos y el StateStore.
// DeviceAdapter es el contrato que "el cerebro" (app/api/chat/route.ts) usa
// sin saber si "el cuerpo" del otro lado es simulado o hardware real.

export type DeviceKind = 'esp32' | 'raspberrypi' | 'printer' | 'generic';

export type DeviceStatus = 'online' | 'offline' | 'calibrating' | 'printing' | 'idle';

export interface TelemetryReading {
  deviceId: string;
  deviceType: string;
  status: DeviceStatus | 'error';
  message?: string;
  [key: string]: unknown;
}

export interface RelayResult {
  deviceId: string;
  relayOn: boolean;
  status: DeviceStatus | 'error';
}

export interface DeviceInfo {
  deviceId: string;
  deviceType: string;
  kind: DeviceKind;
  status: DeviceStatus;
  relayOn: boolean;
  lastUpdate: string; // ISO timestamp
}

export interface SystemStatus {
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  activeAlerts: number;
  estimatedConsumptionWatts: number;
  generatedAt: string; // ISO timestamp
}

export type EventSeverity = 'info' | 'warning' | 'critical';

export interface EventLogEntry {
  id: string;
  deviceId?: string;
  message: string;
  severity: EventSeverity;
  timestamp: string; // ISO timestamp
}

export interface RoutineEffectResult {
  routineName: string;
  affectedDevices: string[];
}

// Contrato que implementan SimulatedDeviceAdapter (hoy) y, en el futuro,
// un RealDeviceAdapter que hable HTTP/MQTT con hardware real — ver
// lib/devices/real.stub.ts y lib/devices/README.md.
export interface DeviceAdapter {
  getTelemetry(deviceId: string): Promise<TelemetryReading>;
  setRelay(targetNode: string, state: 'on' | 'off'): Promise<RelayResult>;
  listDevices(): Promise<DeviceInfo[]>;
  executeRoutine(routineName: string): Promise<RoutineEffectResult>;
  getSystemStatus(): Promise<SystemStatus>;
  getRecentEvents(limit?: number): Promise<EventLogEntry[]>;
}
