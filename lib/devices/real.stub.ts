/* eslint-disable @typescript-eslint/no-unused-vars -- stub: los parámetros documentan la firma real que tendrá cada método */
// Esqueleto de un adaptador para hardware real. NO está implementado ni
// conectado — es la guía de "qué escribir" el día que haya un ESP32/Raspberry
// Pi de verdad en la red. Implementa la MISMA interfaz DeviceAdapter que
// SimulatedDeviceAdapter, así que activar hardware real es cambiar una línea
// en lib/devices/index.ts — app/api/chat/route.ts no se toca.
//
// Ver también lib/devices/README.md para la guía completa (HTTP vs MQTT).

import type {
  DeviceAdapter,
  DeviceInfo,
  EventLogEntry,
  RelayResult,
  RoutineEffectResult,
  SystemStatus,
  TelemetryReading,
} from './types';

// Config esperada (agregar a .env cuando se implemente):
//   DEVICE_HTTP_BASE_URL=http://192.168.1.50   — si los nodos exponen HTTP/REST
//   MQTT_BROKER_URL=mqtt://192.168.1.10:1883   — si los nodos hablan MQTT

export class RealDeviceAdapter implements DeviceAdapter {
  // Opción HTTP: cada ESP32/Raspberry Pi corre un pequeño servidor
  // (ej. con AsyncWebServer en el firmware) y expone GET /telemetry.
  //   const res = await fetch(`${baseUrl}/${deviceId}/telemetry`);
  //   if (!res.ok) return { deviceId, deviceType: 'unknown', status: 'error', message: ... };
  //   return await res.json();
  //
  // Opción MQTT: el nodo publica su última lectura en un topic
  // (ej. `lab/{deviceId}/telemetry`) de forma periódica; este adaptador
  // se suscribe una vez al boot del proceso y cachea el último mensaje
  // por deviceId (patrón parecido al StateStore actual, pero alimentado
  // por MQTT en vez de random-walk).
  async getTelemetry(_deviceId: string): Promise<TelemetryReading> {
    throw new Error('RealDeviceAdapter.getTelemetry: not implemented');
  }

  // HTTP: POST /{targetNode}/relay { state } contra el controlador del relé
  //   (Arduino/ESP32 con un módulo de relés en un GPIO).
  // MQTT: publish a `lab/{targetNode}/relay/set` con payload "on"/"off", y
  //   idealmente esperar el retained state en `lab/{targetNode}/relay/state`
  //   para confirmar que el pulso llegó antes de resolver la promesa.
  async setRelay(_targetNode: string, _state: 'on' | 'off'): Promise<RelayResult> {
    throw new Error('RealDeviceAdapter.setRelay: not implemented');
  }

  // Devuelve el inventario real: por HTTP, un endpoint /devices en el hub
  // (Raspberry Pi) que conoce a todos los nodos de su red local; por MQTT,
  // los deviceId vistos en los últimos N minutos de mensajes retenidos.
  async listDevices(): Promise<DeviceInfo[]> {
    throw new Error('RealDeviceAdapter.listDevices: not implemented');
  }

  // Las rutinas siguen viviendo como orquestación en app/api/chat/route.ts;
  // este método solo necesita aplicar los setRelay/calibración que le pida
  // esa orquestación sobre hardware real, y devolver qué nodos tocó.
  async executeRoutine(_routineName: string): Promise<RoutineEffectResult> {
    throw new Error('RealDeviceAdapter.executeRoutine: not implemented');
  }

  // Se puede calcular igual que en SimulatedDeviceAdapter (agregando sobre
  // listDevices()), o el hub puede exponer un /status ya resuelto.
  async getSystemStatus(): Promise<SystemStatus> {
    throw new Error('RealDeviceAdapter.getSystemStatus: not implemented');
  }

  // Log de eventos: igual que hoy, pero alimentado por transiciones reales
  // (un nodo que deja de responder ping/heartbeat, no solo un relé apagado
  // desde este servidor).
  async getRecentEvents(_limit?: number): Promise<EventLogEntry[]> {
    throw new Error('RealDeviceAdapter.getRecentEvents: not implemented');
  }
}
