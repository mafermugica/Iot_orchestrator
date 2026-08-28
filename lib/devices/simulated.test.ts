import { describe, expect, it } from 'vitest';
import { MemoryStateStore } from './stateStore';
import { SimulatedDeviceAdapter } from './simulated';

function makeAdapter() {
  return new SimulatedDeviceAdapter(new MemoryStateStore());
}

describe('SimulatedDeviceAdapter', () => {
  it('genera telemetría coherente y variando en pasos pequeños', async () => {
    const adapter = makeAdapter();
    const first = await adapter.getTelemetry('esp32-sensor-1');
    const second = await adapter.getTelemetry('esp32-sensor-1');

    expect(first.status).toBe('online');
    const t1 = first.ambientTemp as number;
    const t2 = second.ambientTemp as number;
    expect(t1).toBeGreaterThanOrEqual(20);
    expect(t1).toBeLessThanOrEqual(28);
    // el paso entre dos lecturas consecutivas debe ser pequeño, no un salto random
    expect(Math.abs(t2 - t1)).toBeLessThanOrEqual(2);
  });

  it('refleja offline sin inventar datos cuando el relé está apagado', async () => {
    const adapter = makeAdapter();
    await adapter.setRelay('esp32-sensor-1', 'off');
    const reading = await adapter.getTelemetry('esp32-sensor-1');

    expect(reading.status).toBe('offline');
    expect(reading.message).toContain('apagado');
    expect(reading.cpuTemp).toBeUndefined();
  });

  it('vuelve a online al reactivar el relé', async () => {
    const adapter = makeAdapter();
    await adapter.setRelay('ender-3-v3-ke', 'off');
    const result = await adapter.setRelay('ender-3-v3-ke', 'on');
    expect(result.status).toBe('online');

    const reading = await adapter.getTelemetry('ender-3-v3-ke');
    expect(reading.status === 'printing' || reading.status === 'idle').toBe(true);
  });

  it('"Modo Emergencia" apaga los relés esperados y genera un evento crítico', async () => {
    const adapter = makeAdapter();
    const effect = await adapter.executeRoutine('Modo Emergencia');

    expect(effect.affectedDevices).toContain('esp32-sensor-1');
    expect(effect.affectedDevices).toContain('ender-3-v3-ke');

    const telemetry = await adapter.getTelemetry('esp32-sensor-1');
    expect(telemetry.status).toBe('offline');

    const events = await adapter.getRecentEvents(5);
    expect(events.some((e) => e.severity === 'critical' && e.message.includes('Modo Emergencia'))).toBe(true);
  });

  it('getSystemStatus cuenta bien online/offline y consumo', async () => {
    const adapter = makeAdapter();
    await adapter.setRelay('esp32-sensor-1', 'off');
    const status = await adapter.getSystemStatus();

    expect(status.totalDevices).toBeGreaterThanOrEqual(3);
    expect(status.offlineDevices).toBeGreaterThanOrEqual(1);
    expect(status.onlineDevices + status.offlineDevices).toBe(status.totalDevices);
    expect(status.estimatedConsumptionWatts).toBeGreaterThan(0);
  });

  it('listDevices incluye los 3 dispositivos conocidos aunque nunca se hayan tocado', async () => {
    const adapter = makeAdapter();
    const devices = await adapter.listDevices();
    const ids = devices.map((d) => d.deviceId);

    expect(ids).toContain('esp32-sensor-1');
    expect(ids).toContain('raspberry-pi-hub');
    expect(ids).toContain('ender-3-v3-ke');
  });

  it('un deviceId desconocido no lanza — crea un dispositivo genérico', async () => {
    const adapter = makeAdapter();
    const reading = await adapter.getTelemetry('nodo-inventado-42');
    expect(reading.status).not.toBe('error');
    expect(reading.deviceId).toBe('nodo-inventado-42');
  });
});
