import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileStateStore, resolveStateStore, MemoryStateStore } from './stateStore';
import type { DeviceRecord } from './stateStore';

function makeRecord(id: string): DeviceRecord {
  return {
    deviceId: id,
    deviceType: 'Test Device',
    kind: 'generic',
    relayOn: true,
    calibrating: false,
    calibratingUntil: null,
    lastCalibration: null,
    lastUpdate: Date.now(),
    startedAt: Date.now(),
    fields: { cpuTemp: 40 },
  };
}

describe('FileStateStore', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'iot-orchestrator-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('hace roundtrip de dispositivos y eventos contra el archivo', async () => {
    const store = new FileStateStore(path.join(dir, 'nested', 'device-state.json'));
    const record = makeRecord('device-a');

    await store.save(record);
    await store.appendEvent({ id: '1', message: 'test event', severity: 'info', timestamp: new Date().toISOString() });

    const all = await store.getAll();
    expect(all['device-a']).toEqual(record);

    const events = await store.listEvents();
    expect(events).toHaveLength(1);
    expect(events[0].message).toBe('test event');
  });

  it('getOne devuelve null si el dispositivo no existe', async () => {
    const store = new FileStateStore(path.join(dir, 'device-state.json'));
    expect(await store.getOne('nope')).toBeNull();
  });
});

describe('resolveStateStore', () => {
  it('usa MemoryStateStore en producción sin KV configurado', () => {
    const store = resolveStateStore({ NODE_ENV: 'production' } as NodeJS.ProcessEnv);
    expect(store).toBeInstanceOf(MemoryStateStore);
  });

  it('usa FileStateStore fuera de producción sin KV configurado', () => {
    const store = resolveStateStore({ NODE_ENV: 'development' } as NodeJS.ProcessEnv);
    expect(store).toBeInstanceOf(FileStateStore);
  });
});
