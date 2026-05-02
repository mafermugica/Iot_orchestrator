# 🤖 IoT Orchestrator | Zero to Agent Hackathon

Centro de Comando IoT - Un agente de IA orquestador capaz de gestionar un laboratorio automatizado, monitorear telemetría en tiempo real, controlar relés de energía y ejecutar rutinas complejas.

## 🚀 Features

- **📡 Telemetría en Tiempo Real:** Monitoreo simulado de sensores ESP32, hubs Raspberry Pi e impresoras 3D (temperatura, humedad, red, etc).
- **⚡ Control de Energía:** Gestión de módulos de relés para encender/apagar equipos del laboratorio.
- **🔄 Rutinas Automatizadas:** Macros complejos como "Preparar Área de Trabajo", "Modo Ahorro de Energía" y "Calibración de Sensores".
- **🌐 UI Interactiva:** Dashboard tipo panel industrial con chat streaming y visualización en vivo de herramientas en ejecución.
- **🛡️ Seguridad:** Headers de seguridad (CSP, X-Frame-Options), sanitización de errores y validación de inputs.

## 🛠️ Tech Stack

- **Framework:** Next.js 16 (App Router)
- **IA SDK:** Vercel AI SDK v6 (`ai`, `@ai-sdk/react`, `@ai-sdk/google`)
- **Modelo:** Google Gemini 2.5 Flash Lite
- **Estilos:** Tailwind CSS 4
- **Lenguaje:** TypeScript
- **Deploy:** Vercel + GitHub CI/CD

## 📋 Prerequisites

- Node.js 18+
- Google AI API Key ([Generative AI API Key](https://aistudio.google.com/app/apikey))

## 🏁 Local Development

1. **Clona el repositorio:**
   ```bash
   git clone https://github.com/mafermugica/Iot_orchestrator.git
   cd Iot_orchestrator
   ```

2. **Instala dependencias:**
   ```bash
   npm install
   ```

3. **Configura variables de entorno:**
   Crea un archivo `.env.local` y agrega tu API Key:
   ```env
   GOOGLE_GENERATIVE_AI_API_KEY=your_api_key_here
   ```

4. **Inicia el servidor de desarrollo:**
   ```bash
   npm run dev
   ```
   Accede en tu navegador: [http://localhost:3000](http://localhost:3000)
   O desde otro dispositivo en tu red local: `http://[TU-IP-LOCAL]:3000`

## ☁️ Deploy en Vercel

La forma más rápida es usar el dashboard de Vercel:

1. Ve a [vercel.com/new](https://vercel.com/new)
2. Importa tu repositorio de GitHub: `mafermugica/Iot_orchestrator`
3. En **Environment Variables**, agrega:
   - **Key:** `GOOGLE_GENERATIVE_AI_API_KEY`
   - **Value:** Tu clave de Google AI Studio (empieza con `AIzaSy...`)
4. Click en **Deploy**

Vercel configurará automáticamente el CI/CD. Cada `git push` a `main` desencadenará un nuevo despliegue.

## 🧠 Herramientas del Agente (Tools)

| Tool | Descripción | Parámetros |
|------|-------------|------------|
| `getDeviceTelemetry` | Consulta datos en tiempo real de dispositivos IoT. | `deviceId` (ej. `esp32-sensor-1`) |
| `toggleRelayPower` | Envía pulsos a relés para control de energía física. | `targetNode`, `state` (`on`/`off`) |
| `executeAutomationRoutine` | Ejecuta secuencias complejas multi-dispositivo. | `routineName` |

## 📁 Project Structure

```
├── app/
│   ├── api/chat/route.ts    # Backend: AI Orchestrator con 3 tools
│   ├── layout.tsx           # Layout global con metadata
│   ├── page.tsx             # Frontend: Dashboard de chat IoT
│   └── globals.css          # Estilos Tailwind + tema oscuro
├── .env.local               # Variables de entorno (gitignored)
├── next.config.ts           # Configuración de Next.js + Security Headers
└── package.json             # Dependencias y scripts
```

## 🤝 Contributing

1. Fork el proyecto
2. Crea tu rama de feature (`git checkout -b feature/nueva-feature`)
3. Commit tus cambios (`git commit -m 'feat: add nueva feature'`)
4. Push a la rama (`git push origin feature/nueva-feature`)
5. Abre un Pull Request

## 📄 License

MIT License - ver [LICENSE](LICENSE) para más detalles.

---
Creado para el **Vercel Zero to Agent Hackathon** 🚀