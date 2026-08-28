import { google } from '@ai-sdk/google';
import { streamText, tool, stepCountIs, convertToModelMessages } from 'ai';
import { z } from 'zod';
import { readTelemetry, setRelay, applyRoutineEffects } from '../../../lib/deviceState';

export const maxDuration = 30;

// La telemetría y los relés ya no generan datos random sueltos aquí: leen y
// escriben el estado simulado persistente de lib/deviceState.ts, para que la
// demo sea coherente entre mensajes del chat (ver comentario en ese archivo).

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
  'Modo Emergencia': () => ({
    steps: [
      { action: 'Cortar energía de todos los relés', result: 'Relés RL-00 a RL-09 desactivados', status: 'success' },
      { action: 'Detener impresión en curso (Ender-3 V3 KE)', result: 'Impresión pausada, nozzle enfriándose', status: 'success' },
      { action: 'Aislar red del hub', result: 'Raspberry Pi 5: modo aislado, solo diagnóstico', status: 'success' },
      { action: 'Enviar alerta de emergencia', result: 'Alerta ALT-EMRG enviada al canal de notificaciones', status: 'success' },
    ],
  }),
};

export async function POST(req: Request) {
  let messages: unknown;
  let linkedDevices: Array<{ id: string; name: string; type: string }> = [];

  try {
    const body = await req.json();
    messages = body.messages;
    linkedDevices = body.linkedDevices ?? [];
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

  const knownDevices = [
    { id: 'esp32-sensor-1', name: 'ESP32 Sensor Node', type: 'ESP32 Sensor Node' },
    { id: 'raspberry-pi-hub', name: 'Raspberry Pi Hub', type: 'Raspberry Pi' },
    { id: 'ender-3-v3-ke', name: 'Creality Ender-3 V3 KE', type: 'Impresora 3D' },
  ];

  const allDevices = [...knownDevices];
  for (const d of linkedDevices) {
    if (!knownDevices.find((k) => k.id === d.id)) {
      allDevices.push(d);
    }
  }

  const deviceListText = allDevices
    .map((d) => {
      const typeDesc: Record<string, string> = {
        'ESP32 Sensor Node': 'Nodo de sensores ambientales (temperatura, humedad, WiFi, batería)',
        'Raspberry Pi': 'Hub central (CPU, RAM, disco, red, dispositivos conectados)',
        'Impresora 3D': 'Impresora 3D Creality (nozzle, bed, progreso de impresión, filamento)',
        'Arduino': 'Controlador Arduino (pines, sensores conectados, firmware)',
        'Módulo de Relé': 'Módulo de relés industriales (estado de canales, voltaje, corriente)',
        'Custom': 'Dispositivo personalizado',
      };
      return `- ${d.id}: ${d.name} — ${typeDesc[d.type] || 'Dispositivo IoT personalizado'}`;
    })
    .join('\n');

  const result = await streamText({
    model: google('gemini-2.5-flash'),
    messages: await convertToModelMessages(messages),
    onError: ({ error }) => {
      console.error('[IoT Orchestrator] AI Error:', error);
    },
    system: `Eres el ORQUESTADOR AUTÓNOMO DE HARDWARE, un agente de IA avanzado que gestiona un laboratorio automatizado de IoT.

TU RESPONSABILIDADES:
1. MONITOREO DE TELEMETRÍA: Consulta en tiempo real el estado de todos los dispositivos conectados (sensores ESP32, hubs Raspberry Pi, impresoras 3D, etc.).
2. GESTIÓN DE ENERGÍA: Controla relés físicos para encender o apagar equipos, gestionar la energía del laboratorio y optimizar el consumo eléctrico.
3. COORDINACIÓN DE EQUIPOS: Ejecuta rutinas de automatización complejas que involucran múltiples dispositivos coordinados.

DISPOSITIVOS DISPONIBLES:
${deviceListText}

RUTINAS DE AUTOMATIZACIÓN DISPONIBLES:
- "Preparar Área de Trabajo": Iluminación + verificación ambiental + precalentamiento maquinaria
- "Modo Ahorro de Energía": Apagado progresivo de equipos no esenciales
- "Calibración de Sensores": Secuencia de calibración y verificación de todos los sensores
- "Modo Emergencia": Corta energía de todos los relés, detiene impresiones y envía una alerta

PROTOCOLO DE RESPUESTA:
- Usa las herramientas disponibles para obtener datos reales antes de responder.
- Presenta la información de forma estructurada y clara, usando formato tipo terminal/dashboard.
- Si el usuario pide una rutina que no existe, sugiere las disponibles.
- Mantén un tono profesional y técnico, como un sistema de control industrial.
- Siempre confirma las acciones de cambio de estado (encender/apagar) antes de ejecutarlas si la orden es ambigua.
- Si un dispositivo está offline, dilo explícitamente en vez de inventar lecturas — la telemetría ya te lo indica en el campo "status".
- Usa scheduleTask cuando el usuario pida programar/diferir una rutina para más adelante en vez de ejecutarla ya.
- Si el usuario pide algo urgente de seguridad (fuego, sobrecalentamiento, fuga), sugiere ejecutar "Modo Emergencia".`,

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
          return readTelemetry(deviceId);
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
          const device = setRelay(targetNode, state === 'on');
          const relayId = `RL-${Math.floor(Math.random() * 10)
            .toString()
            .padStart(2, '0')}`;
          const voltage = state === 'on' ? '5.0V' : '0.0V';
          const currentDraw = state === 'on' ? `${(0.5 + Math.random() * 2).toFixed(1)}A` : '0.0A';
          const timestamp = new Date().toISOString();

          return {
            relayId,
            targetNode: device.deviceId,
            state,
            status: device.relayOn ? 'online' : 'offline',
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

          // aplica la rutina sobre el estado simulado persistente (relés, calibración, etc.)
          applyRoutineEffects(routineName);

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

      scheduleTask: tool({
        description:
          'Programa una rutina de automatización existente para que se ejecute más adelante, en vez de ejecutarla inmediatamente.',
        inputSchema: z.object({
          routineName: z
            .string()
            .describe(
              'El nombre exacto de la rutina a programar. Disponibles: "Preparar Área de Trabajo", "Modo Ahorro de Energía", "Calibración de Sensores", "Modo Emergencia"'
            ),
          delayMinutes: z
            .number()
            .int()
            .min(1)
            .max(1440)
            .describe('Minutos de espera antes de ejecutar la rutina (entre 1 y 1440).'),
        }),
        // ponytail: no hay cron/hardware real — solo confirma la programación, no dispara la rutina más tarde.
        execute: async ({ routineName, delayMinutes }) => {
          await new Promise((resolve) => setTimeout(resolve, 500));

          if (!AUTOMATION_ROUTINES[routineName]) {
            const available = Object.keys(AUTOMATION_ROUTINES);
            return {
              error: `Rutina "${routineName}" no encontrada`,
              availableRoutines: available,
              message: `No se puede programar: la rutina solicitada no existe. Disponibles: ${available.join(', ')}`,
            };
          }

          const scheduledFor = new Date(Date.now() + delayMinutes * 60_000).toISOString();

          return {
            taskId: `SCHED-${Date.now().toString(36).toUpperCase()}`,
            routineName,
            delayMinutes,
            scheduledFor,
            status: 'scheduled',
            timestamp: new Date().toISOString(),
            message: `Rutina "${routineName}" programada para ejecutarse en ${delayMinutes} minuto(s) (${scheduledFor}).`,
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
