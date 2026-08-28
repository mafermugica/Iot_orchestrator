// Backend de persistencia para el estado simulado de los dispositivos.
//
// Tres implementaciones detrás de la misma interfaz, elegidas en cascada por
// resolveStateStore() sin que el resto del código sepa cuál está activa:
//
//   KvStateStore     — si hay credenciales de Vercel KV / Upstash for Redis
//                       (Marketplace). Sobrevive a cold starts y escala entre
//                       instancias serverless: la opción "real" para producción.
//   FileStateStore   — dev local sin KV configurado. Escribe un JSON en
//                       .data/device-state.json. Sobrevive a reinicios del
//                       servidor de desarrollo, no a un deploy serverless
//                       (el filesystem de una función es efímero).
//   MemoryStateStore — último recurso (producción sin KV conectado). Mismo
//                       comportamiento que el código anterior: coherente
//                       mientras el proceso siga caliente, se resetea en cada
//                       cold start.
//
// Trade-off de KV vs archivo: KV necesita provisionar un store en el
// Marketplace de Vercel (gratis en el free tier, pero es un paso manual).
// Sin esas credenciales el proyecto sigue funcionando out-of-the-box con el
// archivo local — por eso la cascada, no un "elige uno y listo".

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DeviceKind, EventLogEntry } from './types';

export interface DeviceRecord {
  deviceId: string;
  deviceType: string;
  kind: DeviceKind;
  relayOn: boolean;
  calibrating: boolean;
  calibratingUntil: number | null;
  lastCalibration: string | null;
  lastUpdate: number; // epoch ms
  startedAt: number; // epoch ms
  fields: Record<string, number>;
}

export interface StateStore {
  getAll(): Promise<Record<string, DeviceRecord>>;
  getOne(deviceId: string): Promise<DeviceRecord | null>;
  save(record: DeviceRecord): Promise<void>;
  appendEvent(event: EventLogEntry): Promise<void>;
  listEvents(limit?: number): Promise<EventLogEntry[]>;
}

const MAX_EVENTS = 200;

export class MemoryStateStore implements StateStore {
  private devices = new Map<string, DeviceRecord>();
  private events: EventLogEntry[] = [];

  async getAll(): Promise<Record<string, DeviceRecord>> {
    return Object.fromEntries(this.devices);
  }

  async getOne(deviceId: string): Promise<DeviceRecord | null> {
    return this.devices.get(deviceId) ?? null;
  }

  async save(record: DeviceRecord): Promise<void> {
    this.devices.set(record.deviceId, record);
  }

  async appendEvent(event: EventLogEntry): Promise<void> {
    this.events.unshift(event);
    this.events = this.events.slice(0, MAX_EVENTS);
  }

  async listEvents(limit = 20): Promise<EventLogEntry[]> {
    return this.events.slice(0, limit);
  }
}

interface FileShape {
  devices: Record<string, DeviceRecord>;
  events: EventLogEntry[];
}

export class FileStateStore implements StateStore {
  constructor(private readonly filePath: string) {}

  private async read(): Promise<FileShape> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<FileShape>;
      return { devices: parsed.devices ?? {}, events: parsed.events ?? [] };
    } catch {
      return { devices: {}, events: [] };
    }
  }

  private async write(data: FileShape): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  async getAll(): Promise<Record<string, DeviceRecord>> {
    return (await this.read()).devices;
  }

  async getOne(deviceId: string): Promise<DeviceRecord | null> {
    return (await this.read()).devices[deviceId] ?? null;
  }

  async save(record: DeviceRecord): Promise<void> {
    const data = await this.read();
    data.devices[record.deviceId] = record;
    await this.write(data);
  }

  async appendEvent(event: EventLogEntry): Promise<void> {
    const data = await this.read();
    data.events = [event, ...data.events].slice(0, MAX_EVENTS);
    await this.write(data);
  }

  async listEvents(limit = 20): Promise<EventLogEntry[]> {
    return (await this.read()).events.slice(0, limit);
  }
}

const KV_DEVICES_KEY = 'iot-orchestrator:devices';
const KV_EVENTS_KEY = 'iot-orchestrator:events';

export class KvStateStore implements StateStore {
  // El cliente de @vercel/kv se importa dinámicamente: así el paquete solo se
  // toca cuando realmente hay credenciales, y el resto del proyecto puede
  // correr sin que @vercel/kv intente resolver KV_REST_API_URL al importar.
  private async client() {
    const { kv } = await import('@vercel/kv');
    return kv;
  }

  async getAll(): Promise<Record<string, DeviceRecord>> {
    const kv = await this.client();
    return (await kv.get<Record<string, DeviceRecord>>(KV_DEVICES_KEY)) ?? {};
  }

  async getOne(deviceId: string): Promise<DeviceRecord | null> {
    const all = await this.getAll();
    return all[deviceId] ?? null;
  }

  async save(record: DeviceRecord): Promise<void> {
    const kv = await this.client();
    const all = await this.getAll();
    all[record.deviceId] = record;
    // ponytail: read-modify-write, no transacción — suficiente para una demo
    // de un solo laboratorio simulado; con tráfico concurrente real haría
    // falta un WATCH/MULTI o mover cada device a su propia key hash.
    await kv.set(KV_DEVICES_KEY, all);
  }

  async appendEvent(event: EventLogEntry): Promise<void> {
    const kv = await this.client();
    await kv.lpush(KV_EVENTS_KEY, JSON.stringify(event));
    await kv.ltrim(KV_EVENTS_KEY, 0, MAX_EVENTS - 1);
  }

  async listEvents(limit = 20): Promise<EventLogEntry[]> {
    const kv = await this.client();
    const raw = await kv.lrange<string>(KV_EVENTS_KEY, 0, limit - 1);
    return raw.map((entry) => JSON.parse(entry) as EventLogEntry);
  }
}

export function resolveStateStore(env: NodeJS.ProcessEnv = process.env): StateStore {
  if (env.KV_REST_API_URL && env.KV_REST_API_TOKEN) {
    return new KvStateStore();
  }
  if (env.NODE_ENV !== 'production') {
    return new FileStateStore(path.join(process.cwd(), '.data', 'device-state.json'));
  }
  return new MemoryStateStore();
}
