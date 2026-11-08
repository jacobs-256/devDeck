// @ts-nocheck
import type { MqttConfig, MqttGroup } from './mqttTypes';

const CONFIGS_KEY = 'devdeck.mqttTool.configs.v1';
const GROUPS_KEY = 'devdeck.mqttTool.groups.v1';

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json) as unknown;
  } catch {
    return undefined;
  }
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function loadMqttConfigs(): Promise<MqttConfig[]> {
  const raw = localStorage.getItem(CONFIGS_KEY);
  const parsed = raw ? safeParse(raw) : undefined;
  const out = asArray(parsed).map((v): MqttConfig => {
    const r = isRecord(v) ? v : {};
    const protocol = typeof r['protocol'] === 'string' ? String(r['protocol']) : 'mqtts://';
    const path = typeof r['path'] === 'string' ? String(r['path']) : '/mqtt';
    return { ...r, protocol, path } as unknown as MqttConfig;
  });
  return Promise.resolve(out);
}

export function saveMqttConfigs(configs: MqttConfig[]): Promise<void> {
  localStorage.setItem(CONFIGS_KEY, JSON.stringify(configs));
  return Promise.resolve();
}

export function loadMqttGroups(): Promise<MqttGroup[]> {
  const raw = localStorage.getItem(GROUPS_KEY);
  const parsed = raw ? safeParse(raw) : undefined;
  const out = asArray(parsed)
    .map((v): MqttGroup | null => {
      const r = isRecord(v) ? v : {};
      const id = String(r['id'] ?? '').trim();
      const name = String(r['name'] ?? '').trim();
      if (!id || !name) return null;
      return { id, name };
    })
    .filter((x): x is MqttGroup => Boolean(x));
  return Promise.resolve(out);
}

export function saveMqttGroups(groups: MqttGroup[]): Promise<void> {
  localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
  return Promise.resolve();
}

export function loadSubs(connId: string): Promise<{ topic: string; qos: 0 | 1 | 2; enabled: boolean }[]> {
  const raw = localStorage.getItem(`devdeck.mqttTool.subs.${connId}.v1`);
  const parsed = raw ? safeParse(raw) : undefined;
  const out = asArray(parsed)
    .map((v) => {
      const r = isRecord(v) ? v : {};
      const topic = String(r['topic'] ?? '').trim();
      const qos = Number(r['qos'] ?? 0);
      const enabled = Boolean(r['enabled']);
      if (!topic) return null;
      const q = qos === 1 ? 1 : qos === 2 ? 2 : 0;
      return { topic, qos: q, enabled };
    })
    .filter((x): x is { topic: string; qos: 0 | 1 | 2; enabled: boolean } => Boolean(x));
  return Promise.resolve(out);
}

export function saveSubs(
  connId: string,
  subs: { topic: string; qos: 0 | 1 | 2; enabled: boolean }[],
): Promise<void> {
  localStorage.setItem(`devdeck.mqttTool.subs.${connId}.v1`, JSON.stringify(subs));
  return Promise.resolve();
}
