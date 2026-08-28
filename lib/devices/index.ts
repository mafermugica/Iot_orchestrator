// Único punto de entrada: app/api/chat/route.ts y app/api/devices/route.ts
// importan SIEMPRE de aquí, nunca de simulated.ts/real.stub.ts directo.
// Swapear a hardware real (cuando exista) es cambiar esta línea nada más.

import { resolveStateStore } from './stateStore';
import { SimulatedDeviceAdapter } from './simulated';
import type { DeviceAdapter } from './types';

const store = resolveStateStore();

export const deviceAdapter: DeviceAdapter = new SimulatedDeviceAdapter(store);

export type {
  DeviceAdapter,
  DeviceInfo,
  DeviceKind,
  DeviceStatus,
  EventLogEntry,
  EventSeverity,
  RelayResult,
  RoutineEffectResult,
  SystemStatus,
  TelemetryReading,
} from './types';
