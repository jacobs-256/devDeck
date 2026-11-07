// @ts-nocheck
type EventMessage = { type: 'devtoolbox:sdk:event'; event: string; data?: unknown };
type Listener<T = unknown> = (data: T) => void;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function asEventMessage(v: unknown): EventMessage | null {
  if (!isRecord(v)) return null;
  if (v.type !== 'devtoolbox:sdk:event') return null;
  if (typeof v.event !== 'string') return null;
  return v as EventMessage;
}

const listeners = new Map<string, Set<Listener>>();
let mqttHandler: unknown;

function emit(event: string, data: unknown): void {
  const set = listeners.get(event);
  if (!set) return;
  set.forEach((fn) => fn(data));
}

function ensureMqttBridge(): void {
  if (mqttHandler) return;
  const api = window.electronAPI;
  if (!api?.onMqttEvent) return;
  mqttHandler = api.onMqttEvent((id, ev, data) => {
    if (ev === 'connected') emit('mqtt.connected', { id });
    else if (ev === 'reconnect') emit('mqtt.reconnect', { id });
    else if (ev === 'close') emit('mqtt.close', { id });
    else if (ev === 'offline') emit('mqtt.offline', { id });
    else if (ev === 'error') {
      const d = isRecord(data) ? data : {};
      const msg = String(d['message'] ?? data ?? '');
      const code = String(d['code'] ?? '');
      emit('mqtt.error', { id, message: code ? `${msg} (${code})` : msg });
    } else if (ev === 'message') {
      const d = isRecord(data) ? data : {};
      emit('mqtt.message', {
        id,
        topic: String(d['topic'] ?? ''),
        payload: String(d['payload'] ?? ''),
        qos: Number(d['qos'] ?? 0),
        retain: Boolean(d['retain'] ?? false),
      });
    }
  });
}

export function onSdkEvent<T = unknown>(name: string, fn: Listener<T>): () => void {
  ensureMqttBridge();
  const set = listeners.get(name) ?? new Set();
  const wrapped: Listener = (data) => fn(data as T);
  set.add(wrapped);
  listeners.set(name, set);
  return () => {
    const s = listeners.get(name);
    if (!s) return;
    s.delete(wrapped);
    if (!s.size) listeners.delete(name);
  };
}

export async function mqttConnect(params: unknown): Promise<void> {
  ensureMqttBridge();
  const api = window.electronAPI;
  if (!api?.mqttConnect) return;
  const res = await api.mqttConnect(params);
  if (res?.ok) return;
  const msg = String(res?.error?.message ?? 'MQTT connect failed');
  const id = isRecord(params) && typeof params.id === 'string' ? params.id : 'default';
  emit('mqtt.error', { id, message: msg });
  emit('mqtt.close', { id });
}

export async function mqttDisconnect(id: string): Promise<void> {
  const api = window.electronAPI;
  if (!api?.mqttDisconnect) return;
  await api.mqttDisconnect(id);
}

export async function mqttSubscribe(id: string, topic: string, qos: number): Promise<void> {
  const api = window.electronAPI;
  if (!api?.mqttSubscribe) return;
  await api.mqttSubscribe(id, topic, qos);
}

export async function mqttUnsubscribe(id: string, topic: string): Promise<void> {
  const api = window.electronAPI;
  if (!api?.mqttUnsubscribe) return;
  await api.mqttUnsubscribe(id, topic);
}

export async function mqttPublish(
  id: string,
  topic: string,
  payload: string,
  qos: number,
  retain: boolean,
): Promise<void> {
  const api = window.electronAPI;
  if (!api?.mqttPublish) return;
  await api.mqttPublish(id, topic, payload, qos, retain);
}

export async function openFileBase64(
  filters?: { name: string; extensions: string[] }[],
): Promise<{ name: string; contentB64: string } | null> {
  const api = window.electronAPI;
  if (!api?.openFile) return null;
  const res = await api.openFile(filters, 'base64');
  if (!res) return null;
  const name =
    String(res.filePath ?? '')
      .split(/[\\/]/)
      .pop() ?? '';
  return { name, contentB64: String(res.content ?? '') };
}

export function bindSdkEvents(): void {
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window) return;
    const ev = asEventMessage(event.data);
    if (!ev) return;
    emit(ev.event, ev.data);
  });
}
