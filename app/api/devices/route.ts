import { deviceAdapter } from '@/lib/devices';

// Endpoint de solo lectura para que el dashboard haga polling del estado del
// laboratorio sin pasar por el LLM. Comparte el mismo deviceAdapter que las
// tools del chat, así que siempre refleja el mismo estado.
export async function GET() {
  try {
    const [devices, systemStatus, recentEvents] = await Promise.all([
      deviceAdapter.listDevices(),
      deviceAdapter.getSystemStatus(),
      deviceAdapter.getRecentEvents(15),
    ]);

    return Response.json({ devices, systemStatus, recentEvents });
  } catch (error) {
    console.error('[IoT Orchestrator] /api/devices error:', error);
    return Response.json({ error: 'No se pudo obtener el estado del laboratorio.' }, { status: 500 });
  }
}
