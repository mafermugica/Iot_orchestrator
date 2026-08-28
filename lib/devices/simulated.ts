// "Cuerpo" simulado del laboratorio: implementa DeviceAdapter sin hablar con
// ningún hardware. Toda la persistencia pasa por el StateStore inyectado —
// esta clase no sabe si ese store es memoria, un archivo o Vercel KV.
//
// Sigue siendo 100% simulación (sin hardware real), pero coherente: la
// telemetría "camina" en pasos pequeños en vez de saltar random, un
// dispositivo apagado deja de inventar lecturas, y los cambios de estado
// (offline, calibración, rutinas) quedan registrados como eventos.

import { randomUUID } from 'node:crypto';
import type { DeviceRecord, StateStore } from './stateStore';
import type {
  DeviceAdapter,
  DeviceInfo,
  DeviceKind,
  EventLogEntry,
  EventSeverity,
  RelayResult,
  RoutineEffectResult,
  SystemStatus,
  TelemetryReading,
} from './types';

const KNOWN_KINDS: Record<string, { kind: DeviceKind; deviceType: string }> = {
  'esp32-sensor-1': { kind: 'esp32', deviceType: 'ESP32 Sensor Node' },
  'raspberry-pi-hub': { kind: 'raspberrypi', deviceType: 'Raspberry Pi 5 - Central Hub' },
  'ender-3-v3-ke': { kind: 'printer', deviceType: 'Creality Ender-3 V3 KE' },
};
const KNOWN_DEVICE_IDS = Object.keys(KNOWN_KINDS);

const WATTS_BY_KIND: Record<DeviceKind, number> = {
  esp32: 2,
  raspberrypi: 7,
  printer: 150,
  generic: 5,
};

const CALIBRATION_MS = 12_000;
const ALERT_WINDOW_MS = 15 * 60_000;
const ESP32_HIGH_TEMP_THRESHOLD = 26;
const MAX_ALERT_SCAN = 50;

function normalizeId(id: string): string {
  return id.trim().toLowerCase();
}

function baseFields(kind: DeviceKind): Record<string, number> {
  switch (kind) {
    case 'esp32':
      return { cpuTemp: 44, ambientTemp: 23, humidity: 58, wifiSignal: -48, batteryLevel: 92 };
    case 'raspberrypi':
      return { cpuTemp: 55, ramUsagePct: 48, diskUsagePct: 26, cpuLoadPct: 22, networkMbps: 92, connectedDevices: 5 };
    case 'printer':
      return { nozzleTemp: 205, bedTemp: 61, chamberTemp: 29, printProgressPct: 0, printSpeed: 180, filamentRemainingPct: 82 };
    case 'generic':
    default:
      return { cpuTemp: 40, memoryUsagePct: 40, networkLatencyMs: 20 };
  }
}

function createRecord(id: string): DeviceRecord {
  const known = KNOWN_KINDS[id];
  const kind = known?.kind ?? 'generic';
  const now = Date.now();
  return {
    deviceId: id,
    deviceType: known?.deviceType ?? 'Unknown Device',
    kind,
    relayOn: true,
    calibrating: false,
    calibratingUntil: null,
    lastCalibration: kind === 'esp32' ? '2026-04-28T10:00:00Z' : null,
    lastUpdate: now,
    startedAt: now,
    fields: baseFields(kind),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// paso aleatorio pequeño y acotado — la telemetría "camina" en vez de saltar
function step(value: number, delta: number, min: number, max: number): number {
  return clamp(value + (Math.random() - 0.5) * delta, min, max);
}

function formatUptime(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}

// true si la caminata cruzó a "temperatura elevada" en esta llamada (para no
// repetir la alerta en cada lectura mientras se mantenga arriba del umbral)
function walkFields(record: DeviceRecord): { crossedHighTemp: boolean } {
  const f = record.fields;
  let crossedHighTemp = false;

  switch (record.kind) {
    case 'esp32': {
      const tempBefore = f.ambientTemp;
      const wasHigh = tempBefore > ESP32_HIGH_TEMP_THRESHOLD;
      f.cpuTemp = Math.round(step(f.cpuTemp, 3, 38, 55));
      f.ambientTemp = Math.round(step(f.ambientTemp, 1.5, 20, 28));
      const tempDelta = f.ambientTemp - tempBefore;
      // correlación simple: si sube la temperatura, la humedad tiende a bajar
      f.humidity = Math.round(clamp(f.humidity - tempDelta * 1.5 + (Math.random() - 0.5) * 3, 40, 80));
      f.wifiSignal = Math.round(step(f.wifiSignal, 4, -75, -35));
      f.batteryLevel = Math.round(clamp(f.batteryLevel - Math.random() * 0.3, 5, 100));
      crossedHighTemp = !wasHigh && f.ambientTemp > ESP32_HIGH_TEMP_THRESHOLD;
      break;
    }
    case 'raspberrypi': {
      f.cpuTemp = Math.round(step(f.cpuTemp, 3, 45, 70));
      f.ramUsagePct = Math.round(step(f.ramUsagePct, 5, 30, 90));
      f.diskUsagePct = Math.round(clamp(f.diskUsagePct + Math.random() * 0.3, 20, 95));
      f.cpuLoadPct = Math.round(step(f.cpuLoadPct, 10, 10, 95));
      f.networkMbps = Math.round(step(f.networkMbps, 5, 60, 100));
      break;
    }
    case 'printer': {
      f.nozzleTemp = Math.round(step(f.nozzleTemp, 2, 195, 225));
      f.bedTemp = Math.round(step(f.bedTemp, 1, 55, 68));
      f.chamberTemp = Math.round(step(f.chamberTemp, 1, 25, 34));
      if (f.printProgressPct < 100) {
        f.printProgressPct = Math.round(clamp(f.printProgressPct + Math.random() * 4, 0, 100));
        f.filamentRemainingPct = Math.round(clamp(f.filamentRemainingPct - Math.random() * 0.5, 0, 100));
      }
      break;
    }
    case 'generic': {
      f.cpuTemp = Math.round(step(f.cpuTemp, 4, 30, 75));
      f.memoryUsagePct = Math.round(step(f.memoryUsagePct, 5, 15, 90));
      f.networkLatencyMs = Math.round(step(f.networkLatencyMs, 8, 3, 90));
      break;
    }
  }
  record.lastUpdate = Date.now();
  return { crossedHighTemp };
}

const ROUTINE_RELAY_EFFECTS: Record<string, Array<{ node: string; on: boolean }>> = {
  'Preparar Área de Trabajo': [
    { node: 'iluminacion-zona-a', on: true },
    { node: 'ventilacion-extractora', on: true },
    { node: 'esp32-sensor-1', on: true },
    { node: 'raspberry-pi-hub', on: true },
    { node: 'ender-3-v3-ke', on: true },
  ],
  'Modo Ahorro de Energía': [
    { node: 'iluminacion-zona-a', on: false },
    { node: 'ender-3-v3-ke', on: false },
    { node: 'sensor-aux-1', on: false },
    { node: 'sensor-aux-2', on: false },
    { node: 'sensor-aux-3', on: false },
  ],
  'Modo Emergencia': [
    { node: 'iluminacion-zona-a', on: false },
    { node: 'ventilacion-extractora', on: false },
    { node: 'ender-3-v3-ke', on: false },
    { node: 'esp32-sensor-1', on: false },
  ],
};

export class SimulatedDeviceAdapter implements DeviceAdapter {
  constructor(private readonly store: StateStore) {}

  private async getOrCreate(rawId: string): Promise<DeviceRecord> {
    const id = normalizeId(rawId);
    const existing = await this.store.getOne(id);
    if (existing) return existing;
    const created = createRecord(id);
    await this.store.save(created);
    return created;
  }

  private async logEvent(message: string, severity: EventSeverity, deviceId?: string): Promise<void> {
    const event: EventLogEntry = {
      id: randomUUID(),
      deviceId,
      message,
      severity,
      timestamp: new Date().toISOString(),
    };
    await this.store.appendEvent(event);
  }

  private resolveCalibration(record: DeviceRecord): boolean {
    if (record.calibrating && record.calibratingUntil !== null && Date.now() >= record.calibratingUntil) {
      record.calibrating = false;
      record.calibratingUntil = null;
      record.lastCalibration = new Date().toISOString();
      return true; // acaba de terminar
    }
    return false;
  }

  private async applyRelay(rawId: string, on: boolean): Promise<DeviceRecord> {
    const record = await this.getOrCreate(rawId);
    const wasOnline = record.relayOn;
    record.relayOn = on;

    if (on && !wasOnline) {
      // "reboot": arranca de nuevo el uptime y, si es la impresora, el trabajo actual
      record.startedAt = Date.now();
      record.lastUpdate = Date.now();
      if (record.kind === 'printer') {
        record.fields.printProgressPct = 0;
      }
    }

    await this.store.save(record);

    if (wasOnline && !on) {
      await this.logEvent(`${record.deviceId} pasó a offline (relé cortado)`, 'warning', record.deviceId);
    } else if (!wasOnline && on) {
      await this.logEvent(`${record.deviceId} volvió a online`, 'info', record.deviceId);
    }

    return record;
  }

  async getTelemetry(deviceId: string): Promise<TelemetryReading> {
    try {
      const record = await this.getOrCreate(deviceId);
      const justCalibrated = this.resolveCalibration(record);
      if (justCalibrated) {
        await this.store.save(record);
        await this.logEvent(`Calibración completada en ${record.deviceId}`, 'info', record.deviceId);
      }

      if (!record.relayOn) {
        const minutesAgo = Math.max(0, Math.round((Date.now() - record.lastUpdate) / 60_000));
        return {
          deviceId: record.deviceId,
          deviceType: record.deviceType,
          status: 'offline',
          message:
            minutesAgo === 0
              ? 'Dispositivo apagado — sin lecturas nuevas (relé cortado).'
              : `Dispositivo apagado — última lectura hace ${minutesAgo} min.`,
          lastKnownReading: { ...record.fields },
        };
      }

      const { crossedHighTemp } = walkFields(record);
      await this.store.save(record);

      if (crossedHighTemp) {
        await this.logEvent(`Temperatura ambiente elevada en ${record.deviceId}`, 'warning', record.deviceId);
      }

      if (record.calibrating) {
        return {
          deviceId: record.deviceId,
          deviceType: record.deviceType,
          status: 'calibrating',
          message: 'Calibración en curso — lecturas no confiables temporalmente.',
          ...record.fields,
        };
      }

      const status = record.kind === 'printer' ? (record.fields.printProgressPct < 100 ? 'printing' : 'idle') : 'online';

      return {
        deviceId: record.deviceId,
        deviceType: record.deviceType,
        status,
        uptime: formatUptime(Date.now() - record.startedAt),
        lastCalibration: record.lastCalibration,
        ...(record.kind === 'printer' ? { currentJob: 'bracket_v2.gcode' } : {}),
        ...record.fields,
      };
    } catch (err) {
      return {
        deviceId,
        deviceType: 'Unknown Device',
        status: 'error',
        message: err instanceof Error ? err.message : 'Error leyendo el estado del dispositivo.',
      };
    }
  }

  async setRelay(targetNode: string, state: 'on' | 'off'): Promise<RelayResult> {
    try {
      const record = await this.applyRelay(targetNode, state === 'on');
      return { deviceId: record.deviceId, relayOn: record.relayOn, status: record.relayOn ? 'online' : 'offline' };
    } catch {
      return {
        deviceId: normalizeId(targetNode),
        relayOn: false,
        status: 'error',
      };
    }
  }

  async listDevices(): Promise<DeviceInfo[]> {
    for (const id of KNOWN_DEVICE_IDS) {
      await this.getOrCreate(id);
    }
    const all = await this.store.getAll();
    return Object.values(all)
      .sort((a, b) => a.deviceId.localeCompare(b.deviceId))
      .map((record) => {
        this.resolveCalibration(record);
        const status: DeviceInfo['status'] = !record.relayOn
          ? 'offline'
          : record.calibrating
            ? 'calibrating'
            : record.kind === 'printer'
              ? record.fields.printProgressPct < 100
                ? 'printing'
                : 'idle'
              : 'online';
        return {
          deviceId: record.deviceId,
          deviceType: record.deviceType,
          kind: record.kind,
          status,
          relayOn: record.relayOn,
          lastUpdate: new Date(record.lastUpdate).toISOString(),
        };
      });
  }

  async executeRoutine(routineName: string): Promise<RoutineEffectResult> {
    if (routineName === 'Calibración de Sensores') {
      const record = await this.getOrCreate('esp32-sensor-1');
      record.calibrating = true;
      record.calibratingUntil = Date.now() + CALIBRATION_MS;
      await this.store.save(record);
      await this.logEvent('Calibración iniciada en esp32-sensor-1', 'info', 'esp32-sensor-1');
      return { routineName, affectedDevices: ['esp32-sensor-1'] };
    }

    const effects = ROUTINE_RELAY_EFFECTS[routineName];
    if (!effects) {
      return { routineName, affectedDevices: [] };
    }

    for (const effect of effects) {
      await this.applyRelay(effect.node, effect.on);
    }

    const severity: EventSeverity = routineName === 'Modo Emergencia' ? 'critical' : 'info';
    const affectedDevices = effects.map((e) => e.node);
    await this.logEvent(`Rutina "${routineName}" ejecutada — ${affectedDevices.length} nodo(s) afectados`, severity);

    return { routineName, affectedDevices };
  }

  async getSystemStatus(): Promise<SystemStatus> {
    const devices = await this.listDevices();
    const onlineDevices = devices.filter((d) => d.status !== 'offline').length;
    const estimatedConsumptionWatts = devices
      .filter((d) => d.relayOn)
      .reduce((sum, d) => sum + WATTS_BY_KIND[d.kind], 0);

    const recentEvents = await this.store.listEvents(MAX_ALERT_SCAN);
    const cutoff = Date.now() - ALERT_WINDOW_MS;
    const activeAlerts = recentEvents.filter(
      (e) => (e.severity === 'warning' || e.severity === 'critical') && new Date(e.timestamp).getTime() >= cutoff
    ).length;

    return {
      totalDevices: devices.length,
      onlineDevices,
      offlineDevices: devices.length - onlineDevices,
      activeAlerts,
      estimatedConsumptionWatts,
      generatedAt: new Date().toISOString(),
    };
  }

  async getRecentEvents(limit = 10): Promise<EventLogEntry[]> {
    return this.store.listEvents(limit);
  }
}
