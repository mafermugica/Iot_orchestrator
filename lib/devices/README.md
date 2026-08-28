# `lib/devices/` — capa de abstracción de dispositivos

Separa "el cerebro" (el agente y sus tools en `app/api/chat/route.ts`) de
"el cuerpo" (cómo se habla físicamente con cada dispositivo), detrás de una
única interfaz: `DeviceAdapter`.

```
app/api/chat/route.ts ──▶ lib/devices/index.ts ──▶ DeviceAdapter
                                                       │
                                          ┌────────────┴────────────┐
                                          │                         │
                              SimulatedDeviceAdapter        RealDeviceAdapter
                                  (implementado)              (stub, futuro)
                                          │
                                     StateStore
                                          │
                            ┌─────────────┼─────────────┐
                        Memory          File            KV
                     (fallback)    (dev local)   (Vercel KV / Upstash)
```

## El contrato (`types.ts`)

```ts
interface DeviceAdapter {
  getTelemetry(deviceId: string): Promise<TelemetryReading>;
  setRelay(targetNode: string, state: 'on' | 'off'): Promise<RelayResult>;
  listDevices(): Promise<DeviceInfo[]>;
  executeRoutine(routineName: string): Promise<RoutineEffectResult>;
  getSystemStatus(): Promise<SystemStatus>;
  getRecentEvents(limit?: number): Promise<EventLogEntry[]>;
}
```

Las tools de `app/api/chat/route.ts` solo conocen este contrato — nunca
generan datos random ni tocan un `Map`/archivo/KV directamente. Eso es lo
que permite cambiar de simulación a hardware real sin tocar el agente.

## Estado persistente (`stateStore.ts`)

`SimulatedDeviceAdapter` no persiste nada por sí mismo: delega en un
`StateStore`, elegido en cascada por `resolveStateStore()`:

1. **`KvStateStore`** — si `KV_REST_API_URL` y `KV_REST_API_TOKEN` están
   seteadas (vienen de conectar una integración "Vercel KV" o "Upstash for
   Redis" desde el Marketplace de Vercel). Sobrevive a cold starts y a
   múltiples instancias — la opción correcta para producción.
2. **`FileStateStore`** — si no hay KV configurado y `NODE_ENV !== 'production'`.
   Escribe `.data/device-state.json` (gitignored). Sobrevive a reinicios del
   `next dev`, pero no sirve en serverless (filesystem efímero).
3. **`MemoryStateStore`** — último recurso. Mismo comportamiento que la
   versión anterior del proyecto: coherente mientras el proceso siga
   caliente, se resetea en cada cold start.

Así el proyecto corre out-of-the-box sin que nadie tenga que provisionar
nada, y mejora solo con conectar KV.

## Cómo conectar hardware real

1. Copiar `real.stub.ts` a `real.ts` e implementar cada método siguiendo los
   comentarios que ya están ahí (dos caminos posibles, se puede mezclar):

   - **HTTP/REST**: cada ESP32/Raspberry Pi expone un servidor pequeño
     (ej. `AsyncWebServer` en el firmware) con `GET /telemetry` y
     `POST /relay`. El adaptador hace `fetch()` contra
     `DEVICE_HTTP_BASE_URL`.
   - **MQTT**: los nodos publican telemetría en `lab/{deviceId}/telemetry` y
     escuchan comandos en `lab/{deviceId}/relay/set`. El adaptador se
     suscribe una vez al boot del proceso Node y cachea el último mensaje
     por dispositivo (mismo rol que cumple hoy el `StateStore`, pero
     alimentado por MQTT en vez de un random-walk).

2. En `lib/devices/index.ts`, cambiar:
   ```ts
   export const deviceAdapter: DeviceAdapter = new SimulatedDeviceAdapter(store);
   ```
   por:
   ```ts
   export const deviceAdapter: DeviceAdapter = new RealDeviceAdapter(/* config */);
   ```

3. Nada más cambia: `app/api/chat/route.ts`, las tools, el system prompt y
   `app/page.tsx` siguen funcionando igual porque solo conocen `DeviceAdapter`.

## Errores

Ningún método de `SimulatedDeviceAdapter` lanza por un `deviceId` desconocido
(se crea un dispositivo genérico, igual que antes) ni por una falla del
`StateStore` — se captura y se devuelve `status: 'error'` con un mensaje
sanitizado. `RealDeviceAdapter` debería seguir el mismo principio cuando se
implemente: un timeout de red a un ESP32 no debería tirar el chat completo.
