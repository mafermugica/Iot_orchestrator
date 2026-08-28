// Estado simulado de los dispositivos IoT del laboratorio.
//
// Diseño intencional (no una limitación oculta): esto sigue siendo una
// simulación sin hardware real, pero ahora vive en un Map a nivel de módulo
// que persiste entre llamadas dentro del mismo proceso de Node — así que
// apagar un relé o calibrar un sensor se refleja en la telemetría de las
// siguientes preguntas del chat. No sobrevive a un redeploy/cold start ni
// escala entre instancias; para eso haría falta una base de datos real.

type DeviceKind = 'esp32' | 'raspberrypi' | 'printer' | 'generic';

interface DeviceState {
  deviceId: string;
  deviceType: string;
  kind: DeviceKind;
  relayOn: boolean;
  calibrating: boolean;
  calibratingUntil: number | null;
  lastCalibration: string | null;
  lastUpdate: number;
  startedAt: number;
  fields: Record<string, number>;
}

export interface TelemetryReading {
  deviceId: string;
  deviceType: string;
  status: string;
  [key: string]: unknown;
}

const KNOWN_KINDS: Record<string, { kind: DeviceKind; deviceType: string }> = {
  'esp32-sensor-1': { kind: 'esp32', deviceType: 'ESP32 Sensor Node' },
  'raspberry-pi-hub': { kind: 'raspberrypi', deviceType: 'Raspberry Pi 5 - Central Hub' },
  'ender-3-v3-ke': { kind: 'printer', deviceType: 'Creality Ender-3 V3 KE' },
};

const CALIBRATION_MS = 12_000;

const devices = new Map<string, DeviceState>();

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

function createDevice(id: string): DeviceState {
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

function getOrCreate(rawId: string): DeviceState {
  const id = normalizeId(rawId);
  let device = devices.get(id);
  if (!device) {
    device = createDevice(id);
    devices.set(id, device);
  }
  return device;
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

function walkFields(device: DeviceState): void {
  const f = device.fields;
  switch (device.kind) {
    case 'esp32': {
      const tempBefore = f.ambientTemp;
      f.cpuTemp = Math.round(step(f.cpuTemp, 3, 38, 55));
      f.ambientTemp = Math.round(step(f.ambientTemp, 1.5, 20, 28));
      const tempDelta = f.ambientTemp - tempBefore;
      // correlación simple: si sube la temperatura, la humedad tiende a bajar
      f.humidity = Math.round(clamp(f.humidity - tempDelta * 1.5 + (Math.random() - 0.5) * 3, 40, 80));
      f.wifiSignal = Math.round(step(f.wifiSignal, 4, -75, -35));
      f.batteryLevel = Math.round(clamp(f.batteryLevel - Math.random() * 0.3, 5, 100));
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
  device.lastUpdate = Date.now();
}

function resolveCalibration(device: DeviceState): void {
  if (device.calibrating && device.calibratingUntil !== null && Date.now() >= device.calibratingUntil) {
    device.calibrating = false;
    device.calibratingUntil = null;
    device.lastCalibration = new Date().toISOString();
  }
}

export function setRelay(rawId: string, on: boolean): DeviceState {
  const device = getOrCreate(rawId);
  const wasOff = !device.relayOn;
  device.relayOn = on;
  if (on && wasOff) {
    // "reboot": arranca de nuevo el uptime y, si es la impresora, el trabajo actual
    device.startedAt = Date.now();
    device.lastUpdate = Date.now();
    if (device.kind === 'printer') {
      device.fields.printProgressPct = 0;
    }
  }
  return device;
}

export function startCalibration(rawId: string): void {
  const device = getOrCreate(rawId);
  device.calibrating = true;
  device.calibratingUntil = Date.now() + CALIBRATION_MS;
}

export function readTelemetry(rawId: string): TelemetryReading {
  const device = getOrCreate(rawId);
  resolveCalibration(device);

  if (!device.relayOn) {
    const minutesAgo = Math.max(0, Math.round((Date.now() - device.lastUpdate) / 60_000));
    return {
      deviceId: device.deviceId,
      deviceType: device.deviceType,
      status: 'offline',
      message:
        minutesAgo === 0
          ? 'Dispositivo apagado — sin lecturas nuevas (relé cortado).'
          : `Dispositivo apagado — última lectura hace ${minutesAgo} min.`,
      lastKnownReading: { ...device.fields },
    };
  }

  walkFields(device);

  if (device.calibrating) {
    return {
      deviceId: device.deviceId,
      deviceType: device.deviceType,
      status: 'calibrating',
      message: 'Calibración en curso — lecturas no confiables temporalmente.',
      ...device.fields,
    };
  }

  const status =
    device.kind === 'printer' ? (device.fields.printProgressPct < 100 ? 'printing' : 'idle') : 'online';

  return {
    deviceId: device.deviceId,
    deviceType: device.deviceType,
    status,
    uptime: formatUptime(Date.now() - device.startedAt),
    lastCalibration: device.lastCalibration,
    ...(device.kind === 'printer' ? { currentJob: 'bracket_v2.gcode' } : {}),
    ...device.fields,
  };
}

// Efectos de las rutinas de automatización predefinidas sobre el estado real.
export function applyRoutineEffects(routineName: string): void {
  switch (routineName) {
    case 'Preparar Área de Trabajo':
      setRelay('iluminacion-zona-a', true);
      setRelay('ventilacion-extractora', true);
      setRelay('esp32-sensor-1', true);
      setRelay('raspberry-pi-hub', true);
      setRelay('ender-3-v3-ke', true);
      break;
    case 'Modo Ahorro de Energía':
      setRelay('iluminacion-zona-a', false);
      setRelay('ender-3-v3-ke', false);
      setRelay('sensor-aux-1', false);
      setRelay('sensor-aux-2', false);
      setRelay('sensor-aux-3', false);
      break;
    case 'Calibración de Sensores':
      startCalibration('esp32-sensor-1');
      break;
    case 'Modo Emergencia':
      setRelay('iluminacion-zona-a', false);
      setRelay('ventilacion-extractora', false);
      setRelay('ender-3-v3-ke', false);
      setRelay('esp32-sensor-1', false);
      break;
    default:
      break;
  }
}
