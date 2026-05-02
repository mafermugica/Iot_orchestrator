'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useRef, useEffect, useState, useCallback } from 'react';

const STORAGE_KEY_MESSAGES = 'iot-orchestrator-messages';
const STORAGE_KEY_INPUT = 'iot-orchestrator-input';
const STORAGE_KEY_DEVICES = 'iot-orchestrator-devices';
const MAX_HISTORY = 50;

interface LinkedDevice {
  id: string;
  name: string;
  type: string;
  status: 'online' | 'offline' | 'idle';
  linkedAt: string;
}

function loadMessages(): UIMessage[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_MESSAGES);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.slice(-MAX_HISTORY) : [];
  } catch {
    return [];
  }
}

function loadInput(): string {
  try {
    return localStorage.getItem(STORAGE_KEY_INPUT) || '';
  } catch {
    return '';
  }
}

function loadDevices(): LinkedDevice[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_DEVICES);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

interface ToolBadgeProps {
  toolName: string;
  args: Record<string, unknown>;
}

function ToolBadge({ toolName, args }: ToolBadgeProps) {
  const iconMap: Record<string, string> = {
    getDeviceTelemetry: '\u{1F4E1}',
    toggleRelayPower: '\u26A1',
    executeAutomationRoutine: '\u{1F504}',
  };

  const labelMap: Record<string, string> = {
    getDeviceTelemetry: 'Consultando Telemetr\xEDa',
    toggleRelayPower: 'Controlando Rel\xE9',
    executeAutomationRoutine: 'Ejecutando Rutina',
  };

  const icon = iconMap[toolName] || '\u2699\uFE0F';
  const label = labelMap[toolName] || toolName;
  const safeArgs = args ?? {};

  return (
    <div className="my-3 rounded-lg border border-emerald-800/50 bg-emerald-950/40 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-sm">{icon}</span>
        <span className="text-xs font-mono font-semibold uppercase tracking-wider text-emerald-400">
          {label}
        </span>
        <span className="ml-auto inline-flex items-center gap-1">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-xs text-emerald-500/70 font-mono">ejecutando</span>
        </span>
      </div>
      <div className="mt-2 rounded bg-black/40 px-3 py-2 font-mono text-xs text-zinc-400">
        {Object.entries(safeArgs).map(([key, value]) => (
          <div key={key} className="flex gap-2">
            <span className="text-emerald-600">{key}:</span>
            <span className="text-zinc-300">
              {typeof value === 'string' ? `"${value}"` : JSON.stringify(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ToolResult({ toolName, result }: { toolName: string; result: unknown }) {
  const resultStr = JSON.stringify(result, null, 2);
  const resultLines = resultStr.split('\n').slice(0, 8);
  const isTruncated = resultStr.split('\n').length > 8;

  return (
    <div className="my-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-2">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs">\u2705</span>
        <span className="text-xs font-mono text-zinc-500">
          resultado: {toolName}
        </span>
      </div>
      <pre className="overflow-x-auto text-xs font-mono text-zinc-500 leading-relaxed">
        {resultLines.join('\n')}
        {isTruncated && '\n  ...'}
      </pre>
    </div>
  );
}

const DEVICE_TYPES = [
  { value: 'ESP32 Sensor Node', label: 'ESP32 Sensor Node', icon: '\u{1F4E1}' },
  { value: 'Raspberry Pi', label: 'Raspberry Pi Hub', icon: '\u{1F5A5}\uFE0F' },
  { value: 'Impresora 3D', label: 'Impresora 3D', icon: '\u{1F5A8}\uFE0F' },
  { value: 'Arduino', label: 'Arduino Controller', icon: '\u{1F50C}' },
  { value: 'Relay Module', label: 'M\xF3dulo de Rel\xE9', icon: '\u26A1' },
  { value: 'Custom', label: 'Otro dispositivo', icon: '\u2699\uFE0F' },
];

export default function Home() {
  const [input, setInput] = useState(() => loadInput());
  const [initialMessages] = useState<UIMessage[]>(() => loadMessages());
  const [devices, setDevices] = useState<LinkedDevice[]>(() => loadDevices());
  const [showDevices, setShowDevices] = useState(() => loadDevices().length > 0);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [newDeviceType, setNewDeviceType] = useState('ESP32 Sensor Node');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
    messages: initialMessages,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (messages.length === 0) {
      localStorage.removeItem(STORAGE_KEY_MESSAGES);
    } else {
      try {
        localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages.slice(-MAX_HISTORY)));
      } catch {
        // localStorage full — silently ignore
      }
    }
  }, [messages]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_INPUT, input);
    } catch {
      // silently ignore
    }
  }, [input]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_DEVICES, JSON.stringify(devices));
    } catch {
      // silently ignore
    }
  }, [devices]);

  const isStreaming = status === 'submitted' || status === 'streaming';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isStreaming) {
      sendMessage({ text: input }, { body: { linkedDevices: devices } });
      setInput('');
    }
  };

  const handleReset = useCallback(() => {
    setMessages([]);
    setInput('');
    localStorage.removeItem(STORAGE_KEY_MESSAGES);
    localStorage.removeItem(STORAGE_KEY_INPUT);
  }, [setMessages]);

  const handleAddDevice = () => {
    if (!newDeviceName.trim()) return;
    const device: LinkedDevice = {
      id: newDeviceName.toLowerCase().replace(/\s+/g, '-'),
      name: newDeviceName.trim(),
      type: newDeviceType,
      status: 'online',
      linkedAt: new Date().toISOString(),
    };
    setDevices((prev) => [...prev, device]);
    setNewDeviceName('');
    setNewDeviceType('ESP32 Sensor Node');
    setShowAddDevice(false);
  };

  const handleRemoveDevice = (id: string) => {
    setDevices((prev) => prev.filter((d) => d.id !== id));
  };

  const deviceQuickActions = devices.slice(0, 4).map((d) => ({
    label: `${DEVICE_TYPES.find((t) => t.value === d.type)?.icon || '\u2699\uFE0F'} ${d.name}`,
    prompt: `Mu\xE9strame la telemetr\xEDa del dispositivo ${d.id}`,
  }));

  const quickActions = [
    { label: '\u{1F504} Preparar \xC1rea', prompt: 'Ejecuta la rutina "Preparar \xC1rea de Trabajo"' },
    { label: '\u{1F4A1} Modo Ahorro', prompt: 'Ejecuta la rutina "Modo Ahorro de Energ\xEDa"' },
    ...deviceQuickActions,
  ];

  const handleQuickAction = (prompt: string) => {
    sendMessage({ text: prompt }, { body: { linkedDevices: devices } });
  };

  const hasRestoredHistory = initialMessages.length > 0;

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      {/* HEADER */}
      <header className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 px-6 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600/20 border border-emerald-500/30">
            <svg
              className="h-4 w-4 text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.04 12H3m17.96 0H19m-14.96 3.75H3m17.96 3.75h-1.5M8.25 20.25v-1.5m7.5 1.5v-1.5M12 12a3 3 0 100-6 3 3 0 000 6z"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wide text-zinc-100">
              IoT ORCHESTRATOR
            </h1>
            <p className="text-xs text-zinc-500 font-mono">
              Zero to Agent Hackathon
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <span className="text-xs font-mono text-emerald-400">SYSTEM ONLINE</span>
          </div>
          <button
            onClick={() => setShowDevices(!showDevices)}
            className="flex items-center gap-2 text-xs font-mono text-zinc-500 hover:text-emerald-400 transition-colors"
          >
            <span className="rounded bg-zinc-800 px-2 py-0.5">{devices.length}</span>
            <span className="hidden sm:inline">dispositivos</span>
          </button>
          {messages.length > 0 && (
            <button
              onClick={handleReset}
              disabled={isStreaming}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-1.5 text-xs font-mono text-zinc-400 transition-colors hover:border-emerald-700 hover:text-emerald-400 hover:bg-emerald-900/20 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
              </svg>
              <span>Nuevo Chat</span>
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* DEVICE PANEL */}
        {showDevices && (
          <aside className="w-72 border-r border-zinc-800 bg-zinc-900/50 overflow-y-auto flex-shrink-0">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold font-mono text-emerald-400 uppercase tracking-wider">
                  Mis Dispositivos
                </h2>
                <button
                  onClick={() => setShowAddDevice(true)}
                  className="flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/30 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                </button>
              </div>

              {devices.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-xs text-zinc-600 font-mono">Sin dispositivos vinculados</p>
                  <p className="text-xs text-zinc-700 mt-1">Agrega uno con el bot\xF3n +</p>
                </div>
              )}

              <div className="space-y-2">
                {devices.map((device) => (
                  <div
                    key={device.id}
                    className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-3 hover:border-emerald-800/50 transition-colors group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">
                          {DEVICE_TYPES.find((t) => t.value === device.type)?.icon || '\u2699\uFE0F'}
                        </span>
                        <div>
                          <p className="text-sm font-mono text-zinc-200 truncate max-w-[140px]">
                            {device.name}
                          </p>
                          <p className="text-xs text-zinc-600">{device.type}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveDevice(device.id)}
                        className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                        device.status === 'online' ? 'bg-emerald-500' :
                        device.status === 'idle' ? 'bg-yellow-500' : 'bg-red-500'
                      }`} />
                      <span className="text-xs font-mono text-zinc-500 uppercase">{device.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}

        {/* ADD DEVICE MODAL */}
        {showAddDevice && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center px-4">
            <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6">
              <h3 className="text-lg font-bold font-mono text-zinc-100 mb-4">
                Vincular Dispositivo
              </h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-mono text-zinc-500 mb-1.5 uppercase">
                    Nombre del dispositivo
                  </label>
                  <input
                    value={newDeviceName}
                    onChange={(e) => setNewDeviceName(e.target.value)}
                    placeholder="ej: esp32-sensor-2"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-emerald-600 font-mono"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddDevice()}
                  />
                </div>
                <div>
                  <label className="block text-xs font-mono text-zinc-500 mb-1.5 uppercase">
                    Tipo de dispositivo
                  </label>
                  <select
                    value={newDeviceType}
                    onChange={(e) => setNewDeviceType(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-emerald-600 font-mono"
                  >
                    {DEVICE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowAddDevice(false)}
                  className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm font-mono text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddDevice}
                  disabled={!newDeviceName.trim()}
                  className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-mono text-white hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Vincular
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MAIN CHAT AREA */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
            <div className="mx-auto max-w-3xl">
              {messages.length === 0 && !hasRestoredHistory && (
                <div className="flex flex-col items-center justify-center gap-8 py-16">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600/10 border border-emerald-500/20">
                    <svg
                      className="h-8 w-8 text-emerald-400"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25v12M15 3.75a2.25 2.25 0 00-2.25 2.25v3a2.25 2.25 0 002.25 2.25h3A2.25 2.25 0 0021 12V9a2.25 2.25 0 00-2.25-2.25h-3zM9 3.75a2.25 2.25 0 00-2.25 2.25v3A2.25 2.25 0 009 11.25h3A2.25 2.25 0 0014.25 9v-3A2.25 2.25 0 0012 3.75h-3z"
                      />
                    </svg>
                  </div>
                  <div className="text-center">
                    <h2 className="text-xl font-semibold text-zinc-200">
                      Centro de Comando IoT
                    </h2>
                    <p className="mt-2 max-w-sm text-sm text-zinc-500">
                      Orquestador aut\xF3nomo de hardware. Monitorea telemetr\xEDa, gestiona
                      energ\xEDa y coordina equipos del laboratorio.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 w-full max-w-lg">
                    {quickActions.map((action) => (
                      <button
                        key={action.label}
                        onClick={() => handleQuickAction(action.prompt)}
                        disabled={isStreaming}
                        className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-left text-sm text-zinc-400 transition-colors hover:border-emerald-800/50 hover:bg-zinc-900 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((message) => (
                <div key={message.id} className="mb-6">
                  {/* User message */}
                  {message.role === 'user' && (
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-emerald-600/20 border border-emerald-500/20 px-4 py-3">
                        <p className="text-sm text-zinc-200 whitespace-pre-wrap">
                          {message.parts
                            .filter((p) => p.type === 'text')
                            .map((p) => (p as { text: string }).text)
                            .join('')}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Assistant message */}
                  {message.role === 'assistant' && (
                    <div className="flex flex-col">
                      {message.parts.map((part, index) => {
                        if (part.type === 'text') {
                          return (
                            <div key={index}>
                              <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-zinc-900/80 border border-zinc-800 px-4 py-3">
                                <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
                                  {(part as { text: string }).text}
                                </p>
                              </div>
                            </div>
                          );
                        }

                        if (
                          part.type === 'tool-getdevicetelemetry' ||
                          part.type === 'tool-toggerelaypower' ||
                          part.type === 'tool-executeautomationroutine'
                        ) {
                          const toolPart = part as unknown as {
                            toolName: string;
                            input?: Record<string, unknown>;
                            state: string;
                            output?: unknown;
                          };

                          const showBadge =
                            toolPart.state === 'input-streaming' ||
                            toolPart.state === 'input-available';

                          const showResult =
                            toolPart.state === 'output-available' &&
                            toolPart.output !== undefined;

                          return (
                            <div key={index}>
                              {showBadge && (
                                <ToolBadge
                                  toolName={toolPart.toolName}
                                  args={toolPart.input ?? {}}
                                />
                              )}
                              {showResult && (
                                <ToolResult
                                  toolName={toolPart.toolName}
                                  result={toolPart.output as Record<string, unknown>}
                                />
                              )}
                            </div>
                          );
                        }

                        return null;
                      })}
                    </div>
                  )}
                </div>
              ))}

              {isStreaming && messages[messages.length - 1]?.role === 'user' && (
                <div className="flex items-center gap-2 text-zinc-600 text-xs font-mono">
                  <svg
                    className="h-4 w-4 animate-spin text-emerald-500"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  <span>Procesando comando...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* ERROR */}
          {error && (
            <div className="mx-auto max-w-3xl px-6">
              <div className="mb-4 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-xs font-mono text-red-400">
                {error.message}
              </div>
            </div>
          )}

          {/* INPUT */}
          <div className="border-t border-zinc-800 bg-zinc-900/60 backdrop-blur-sm px-4 py-4 sm:px-6">
            <form onSubmit={handleSubmit} className="mx-auto max-w-3xl">
              <div className="flex gap-3">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Escribe un comando para el laboratorio IoT..."
                  className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-colors focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600/30 font-mono"
                  disabled={isStreaming}
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={isStreaming || !input.trim()}
                  className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
                    />
                  </svg>
                </button>
              </div>
              <div className="mt-2 text-center text-xs text-zinc-600 font-mono">
                Powered by Google Gemini 2.5 Flash \xB7 Vercel AI SDK
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
