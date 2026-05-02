import { google } from '@ai-sdk/google';
import { streamText, tool, stepCountIs, convertToModelMessages } from 'ai';
import { z } from 'zod';

export const maxDuration = 30;

const TELEMETRY_DATABASE: Record<string, () => Record<string, unknown>> = {
  'esp32-sensor-1': () => ({
    deviceId: 'esp32-sensor-1',
    deviceType: 'ESP32 Sensor Node',
    cpuTemp: 42 + Math.round(Math.random() * 8),
    ambientTemp: 22 + Math.round(Math.random() * 4),
    humidity: 55 + Math.round(Math.random() * 15),
    wifiSignal: -40 - Math.round(Math.random() * 25),
    batteryLevel: 87 + Math.round(Math.random() * 10),
    uptime: `${Math.floor(Math.random() * 72)}h ${Math.floor(Math.random() * 60)}m`,
    lastCalibration: '2026-04-28T10:00:00Z',
    status: 'online',
  }),
  'raspberry-pi-hub': () => ({
    deviceId: 'raspberry-pi-hub',
    deviceType: 'Raspberry Pi 5 - Central Hub',
    cpuTemp: 52 + Math.round(Math.random() * 12),
    ramUsage: `${40 + Math.round(Math.random() * 30)}%`,
    diskUsage: `${23 + Math.round(Math.random() * 10)}%`,
    cpuLoad: `${15 + Math.round(Math.random() * 40)}%`,
    networkMbps: 85 + Math.round(Math.random() * 15),
    connectedDevices: 4 + Math.floor(Math.random() * 3),
    uptime: `${Math.floor(Math.random() * 168)}h ${Math.floor(Math.random() * 60)}m`,
    status: 'online',
  }),
  'ender-3-v3-ke': () => ({
    deviceId: 'ender-3-v3-ke',
    deviceType: 'Creality Ender-3 V3 KE',
    nozzleTemp: 200 + Math.round(Math.random() * 20),
    bedTemp: 60 + Math.round(Math.random() * 5),
    chamberTemp: 28 + Math.round(Math.random() * 4),
    printProgress: `${Math.round(Math.random() * 100)}%`,
    printSpeed: 150 + Math.round(Math.random() * 100),
    filamentRemaining: `${60 + Math.round(Math.random() * 35)}%`,
    estimatedTimeLeft: `${Math.floor(Math.random() * 120)} min`,
    currentJob: 'bracket_v2.gcode',
    status: Math.random() > 0.3 ? 'printing' : 'idle',
  }),
};

function getGenericTelemetry(deviceId: string): Record<string, unknown> {
  return {
    deviceId,
    deviceType: 'Unknown Device',
    cpuTemp: 35 + Math.round(Math.random() * 30),
    memoryUsage: `${30 + Math.round(Math.random() * 50)}%`,
    networkLatency: `${5 + Math.round(Math.random() * 50)}ms`,
    status: Math.random() > 0.15 ? 'online' : 'offline',
    uptime: `${Math.floor(Math.random() * 48)}h ${Math.floor(Math.random() * 60)}m`,
    lastPing: new Date().toISOString(),
  };
}

const AUTOMATION_ROUTINES: Record<string, () => { steps: Array<{ action: string; result: string; status: string }> }> = {
  'Preparar Área de Trabajo': () => ({
    steps: [
      { action: 'Encender iluminación zona A', result: 'Relay RL-01 activado, 480 lumens confirmados', status: 'success' },
      { action: 'Verificar temperatura ambiente (ESP32)', result: '24.2°C / 58% HR - dentro de rango óptimo', status: 'success' },
      { action: 'Precalentar maquinaria (Ender-3 V3 KE)', result: 'Nozzle: 200°C, Bed: 60°C - listo para imprimir', status: 'success' },
      { action: 'Activar ventilación extractora', result: 'Relay RL-03 activado, flujo de aire: 120 CFM', status: 'success' },
      { action: 'Verificar conectividad del hub', result: 'Raspberry Pi 5: online, 6 dispositivos conectados', status: 'success' },
    ],
  }),
  'Modo Ahorro de Energía': () => ({
    steps: [
      { action: 'Desactivar iluminación no esencial', result: 'Relay RL-01 desactivado, ahorro estimado: 45W', status: 'success' },
      { action: 'Poner Ender-3 V3 KE en standby', result: 'Nozzle enfriándose, bed apagado', status: 'success' },
      { action: 'Reducir polling de sensores ESP32', result: 'Intervalo cambiado de 5s a 60s', status: 'success' },
      { action: 'Apagar monitorización secundaria', result: '3 sensores auxiliares desactivados', status: 'success' },
    ],
  }),
  'Calibración de Sensores': () => ({
    steps: [
      { action: 'Iniciar secuencia de calibración ESP32', result: 'Calibrando sensor de humedad: offset -2.3%', status: 'success' },
      { action: 'Verificar precisión de temperatura', result: 'Error: ±0.2°C dentro de tolerancia', status: 'success' },
      { action: 'Test de señal WiFi', result: 'RSSI: -42dBm, packet loss: 0%', status: 'success' },
      { action: 'Actualizar firmware OTA', result: 'No hay actualizaciones pendientes', status: 'success' },
    ],
  }),
};

export async function POST(req: Request) {
  let messages: unknown;

  try {
    const body = await req.json();
    messages = body.messages;
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid request body' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!Array.isArray(messages)) {
    return new Response(
      JSON.stringify({ error: 'Messages must be an array' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const sanitizedMessages = (messages as unknown[]).map((msg: unknown) => {
    const message = msg as Record<string, unknown>;
    if (message.role === 'user' && Array.isArray(message.parts)) {
      message.parts = (message.parts as unknown[]).filter((part: unknown) => {
        const p = part as Record<string, unknown>;
        return p.type === 'text';
      });
    }
    return message;
  });

  const result = await streamText({
    model: google('gemini-2.5-flash'),
    messages: await convertToModelMessages(sanitizedMessages as unknown),
    onError: ({ error }) => {
      console.error('[IoT Orchestrator] AI Error:', error);
    },
    system: `Eres el ORQUESTADOR AUTÓNOMO DE HARDWARE, un agente de IA avanzado que gestiona un laboratorio automatizado de IoT.

TU RESPONSABILIDADES:
1. MONITOREO DE TELEMETRÍA: Consulta en tiempo real el estado de todos los dispositivos conectados (sensores ESP32, hubs Raspberry Pi, impresoras 3D, etc.).
2. GESTIÓN DE ENERGÍA: Controla relés físicos para encender o apagar equipos, gestionar la energía del laboratorio y optimizar el consumo eléctrico.
3. COORDINACIÓN DE EQUIPOS: Ejecuta rutinas de automatización complejas que involucran múltiples dispositivos coordinados.

DISPOSITIVOS DISPONIBLES:
- esp32-sensor-1: Nodo de sensores ambientales (temperatura, humedad, WiFi, batería)
- raspberry-pi-hub: Hub central (CPU, RAM, disco, red, dispositivos conectados)
- ender-3-v3-ke: Impresora 3D Creality (nozzle, bed, progreso de impresión, filamento)

RUTINAS DE AUTOMATIZACIÓN DISPONIBLES:
- "Preparar Área de Trabajo": Iluminación + verificación ambiental + precalentamiento maquinaria
- "Modo Ahorro de Energía": Apagado progresivo de equipos no esenciales
- "Calibración de Sensores": Secuencia de calibración y verificación de todos los sensores

PROTOCOLO DE RESPUESTA:
- Usa las herramientas disponibles para obtener datos reales antes de responder.
- Presenta la información de forma estructurada y clara, usando formato tipo terminal/dashboard.
- Si el usuario pide una rutina que no existe, sugiere las disponibles.
- Mantén un tono profesional y técnico, como un sistema de control industrial.
- Siempre confirma las acciones de cambio de estado (encender/apagar) antes de ejecutarlas si la orden es ambigua.`,

    stopWhen: stepCountIs(5),

    tools: {
      getDeviceTelemetry: tool({
        description:
          'Obtiene la telemetría en tiempo real de un dispositivo IoT específico del laboratorio. Devuelve datos como temperatura del CPU, humedad ambiental, estado de red, temperaturas de impresión, etc.',
        inputSchema: z.object({
          deviceId: z
            .string()
            .describe(
              "El identificador único del dispositivo. Ejemplos válidos: 'esp32-sensor-1', 'raspberry-pi-hub', 'ender-3-v3-ke'"
            ),
        }),
        execute: async ({ deviceId }) => {
          await new Promise((resolve) => setTimeout(resolve, 800));
          const fetcher = TELEMETRY_DATABASE[deviceId];
          if (fetcher) {
            return fetcher();
          }
          return getGenericTelemetry(deviceId);
        },
      }),

      toggleRelayPower: tool({
        description:
          'Envía un pulso a un módulo de relés (conectado a Arduino/ESP32) para cortar o habilitar la energía física de un equipo del laboratorio. Simula el control de relés industriales.',
        inputSchema: z.object({
          targetNode: z
            .string()
            .describe(
              'El nodo de destino al que se enviará el pulso del relé. Ejemplos: "iluminacion-zona-a", "ender-3-v3-ke", "ventilacion-extractora", "sensor-aux-1"'
            ),
          state: z.enum(['on', 'off']).describe('El estado deseado del relé: "on" para encender, "off" para apagar'),
        }),
        execute: async ({ targetNode, state }) => {
          await new Promise((resolve) => setTimeout(resolve, 600));
          const relayId = `RL-${Math.floor(Math.random() * 10)
            .toString()
            .padStart(2, '0')}`;
          const voltage = state === 'on' ? '5.0V' : '0.0V';
          const currentDraw = state === 'on' ? `${(0.5 + Math.random() * 2).toFixed(1)}A` : '0.0A';
          const timestamp = new Date().toISOString();

          return {
            relayId,
            targetNode,
            state,
            voltage,
            currentDraw,
            pulseDuration: '50ms',
            confirmation: 'ACK received from relay module',
            timestamp,
            message:
              state === 'on'
                ? `Relé ${relayId} ACTIVADO -> Energía suministrada a "${targetNode}"`
                : `Relé ${relayId} DESACTIVADO -> Corte de energía a "${targetNode}"`,
          };
        },
      }),

      executeAutomationRoutine: tool({
        description:
          'Ejecuta una rutina de automatización predefinida que coordina múltiples dispositivos y relés del laboratorio de forma secuencial.',
        inputSchema: z.object({
          routineName: z
            .string()
            .describe(
              'El nombre exacto de la rutina a ejecutar. Disponibles: "Preparar Área de Trabajo", "Modo Ahorro de Energía", "Calibración de Sensores"'
            ),
        }),
        execute: async ({ routineName }) => {
          await new Promise((resolve) => setTimeout(resolve, 1200));
          const routine = AUTOMATION_ROUTINES[routineName];

          if (!routine) {
            const available = Object.keys(AUTOMATION_ROUTINES);
            return {
              error: `Rutina "${routineName}" no encontrada`,
              availableRoutines: available,
              message: `La rutina solicitada no existe. Las rutinas disponibles son: ${available.join(', ')}`,
            };
          }

          const routineData = routine();
          const timestamp = new Date().toISOString();
          const duration = `${2 + Math.round(Math.random() * 8)}s`;

          return {
            routineName,
            status: 'completed',
            executionId: `EXEC-${Date.now().toString(36).toUpperCase()}`,
            timestamp,
            duration,
            steps: routineData.steps,
            summary: `${routineData.steps.filter((s) => s.status === 'success').length}/${routineData.steps.length} pasos completados exitosamente`,
          };
        },
      }),
    },
  });

  return result.toUIMessageStreamResponse({
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('quota')) {
        return 'Cuota de IA excedida. Intenta de nuevo en un momento.';
      }
      if (msg.includes('rate limit')) {
        return 'Demasiadas solicitudes. Espera unos segundos.';
      }
      if (msg.includes('API key expired') || msg.includes('API_KEY_INVALID') || msg.includes('invalid api key')) {
        return 'Error de autenticación: La clave de API de Google no es válida o expiró. Contacta al administrador.';
      }
      if (msg.includes('image input') || msg.includes('does not support image')) {
        return 'Este modelo no soporta imágenes. Envía tu comando como texto.';
      }
      return 'Error interno del orquestador. Intenta de nuevo.';
    },
  });
}
