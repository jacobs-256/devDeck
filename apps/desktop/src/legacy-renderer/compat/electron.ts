// @ts-nocheck
/**
 * Compatibility bridge for the legacy (main-branch) tool components.
 *
 * The original renderer called `window.electronAPI`; those calls now map to the
 * Tauri host commands or browser primitives. Only the methods used by the
 * restored tool pages are implemented.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

type Listener = (...args: any[]) => void;
const channels = new Map<string, Set<Listener>>();

function on(channel: string, cb: Listener): Listener {
  const set = channels.get(channel) ?? new Set();
  set.add(cb);
  channels.set(channel, set);
  return cb;
}

function off(channel: string, cb?: Listener): void {
  if (!cb) {
    channels.delete(channel);
    return;
  }
  channels.get(channel)?.delete(cb);
}

function emit(channel: string, ...args: any[]): void {
  channels.get(channel)?.forEach((cb) => cb(...args));
}

function readFile(file: File, encoding: 'utf8' | 'base64'): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('failed to read file'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        resolve('');
        return;
      }
      resolve(encoding === 'base64' ? (result.split(',')[1] ?? '') : result);
    };
    if (encoding === 'base64') reader.readAsDataURL(file);
    else reader.readAsText(file);
  });
}

function pickFile(filters?: { extensions: string[] }[], encoding: 'utf8' | 'base64' = 'utf8') {
  return new Promise<{ filePath: string; name: string; content: string } | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    const extensions = (filters ?? []).flatMap((filter) => filter.extensions ?? []);
    const accepted = extensions.filter((ext) => ext && ext !== '*');
    if (accepted.length) input.accept = accepted.map((ext) => `.${ext}`).join(',');
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      resolve({
        filePath: file.name,
        name: file.name,
        content: await readFile(file, encoding),
      });
    };
    input.click();
  });
}

function download(name: string, content: string): void {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name || 'download.txt';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function subjectFrom(params: any) {
  return {
    commonName: params.commonName ?? '',
    organization: params.organization ?? '',
    organizationalUnit: params.organizationalUnit ?? '',
    country: params.country ?? '',
    state: params.state ?? '',
    locality: params.locality ?? '',
  };
}

const mqttSessions = new Map<string, string>();
let mqttBridge: Promise<void> | null = null;

function ensureMqttBridge() {
  if (mqttBridge) return mqttBridge;
  mqttBridge = listen<any>('tool-mqtt', (event) => {
    const payload = event.payload ?? {};
    const legacyId = [...mqttSessions.entries()].find(([, sid]) => sid === payload.sessionId)?.[0];
    if (!legacyId) return;
    if (payload.event === 'connected') emit('mqtt', legacyId, 'connected', {});
    else if (payload.event === 'disconnected') emit('mqtt', legacyId, 'close', {});
    else if (payload.event === 'error') emit('mqtt', legacyId, 'error', { message: payload.message });
    else if (payload.event === 'message') {
      emit('mqtt', legacyId, 'message', {
        topic: payload.topic ?? '',
        payload: payload.payload ?? '',
        qos: payload.qos ?? 0,
        retain: Boolean(payload.retain),
      });
    }
  }).then(() => undefined);
  return mqttBridge;
}

async function pingStart(target: string, count = 4) {
  const { host, port } = parseHostPort(target);
  emit('ping:data', `Pinging ${host}:${port} with TCP connect...\n`);
  try {
    const report = await invoke<any>('tcp_ping', { host, port, count });
    for (const sample of report.samples ?? []) {
      if (sample.latencyMs != null) {
        emit(
          'ping:data',
          `Reply from ${report.resolved || host}: seq=${sample.seq} time=${sample.latencyMs.toFixed(1)} ms\n`,
        );
      } else {
        emit('ping:data', `Request for seq=${sample.seq} failed: ${sample.error ?? 'timeout'}\n`);
      }
    }
    emit('ping:data', `\n${report.received}/${report.sent} probes succeeded.\n`);
    emit('ping:done');
  } catch (error) {
    emit('ping:error', error instanceof Error ? error.message : String(error));
    emit('ping:done');
  }
}

async function tracertStart(target: string, maxHops = 30) {
  emit('tracert:data', `Tracing route to ${target}...\n`);
  try {
    const report = await invoke<any>('traceroute', { host: target, maxHops });
    emit('tracert:data', `${report.output ?? ''}\n`);
    emit('tracert:done');
  } catch (error) {
    emit('tracert:error', error instanceof Error ? error.message : String(error));
    emit('tracert:done');
  }
}

const api = {
  openFile: (filters?: any[], encoding: 'utf8' | 'base64' = 'utf8') => pickFile(filters, encoding),
  saveFile: (name: string, content: string) => {
    download(String(name).split(/[\\/]/).pop() ?? 'download.txt', content);
    return Promise.resolve(true);
  },
  saveFileAs: (name: string, content: string) => {
    download(name, content);
    return Promise.resolve(true);
  },
  confirmOverwrite: () => Promise.resolve(true),
  getLocale: async () => ({ setting: 'auto', locale: undefined }),
  setLocale: async () => undefined,
  onLocaleChanged: () => undefined,
  offLocaleChanged: () => undefined,
  getTheme: async () => ({ setting: 'auto', theme: undefined }),
  setTheme: async () => undefined,
  onThemeChanged: () => undefined,
  offThemeChanged: () => undefined,

  generateRSAKeyPair: async (params: any) => {
    try {
      const algorithm = params?.keySize === 4096 ? 'rsa-4096' : 'rsa-2048';
      const material = await invoke<any>('cert_generate_key', { algorithm });
      return {
        success: true,
        privateKey: material.privateKeyPem,
        publicKey: material.publicKeyPem,
        algorithm: material.algorithm,
        keySize: params?.keySize,
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
  generateCA: async (params: any) => {
    try {
      const material = await invoke<any>('cert_generate_ca', {
        subject: subjectFrom(params),
        days: params.validityDays ?? 365,
        algorithm: params.keySize === 4096 ? 'rsa-4096' : 'rsa-2048',
      });
      return { success: true, privateKey: material.privateKeyPem, certificate: material.certificatePem };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
  generateCSR: async (params: any) => {
    try {
      const material = await invoke<any>('cert_generate_csr', {
        subject: subjectFrom(params),
        algorithm: params.keySize === 4096 ? 'rsa-4096' : 'rsa-2048',
      });
      return { success: true, csr: material.csrPem, privateKey: material.privateKeyPem };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
  generateClientCert: async (params: any) => {
    try {
      let csr = params.csrPem;
      let privateKey = '';
      if (!csr) {
        const material = await invoke<any>('cert_generate_csr', {
          subject: subjectFrom(params),
          algorithm: params.keySize === 4096 ? 'rsa-4096' : 'rsa-2048',
        });
        csr = material.csrPem;
        privateKey = material.privateKeyPem;
      }
      const certificate = await invoke<string>('cert_issue', {
        caCertificatePem: params.caCertPem,
        caPrivateKeyPem: params.caKeyPem,
        csrPem: csr,
        days: params.validityDays ?? 365,
        clientAuth: true,
      });
      return { success: true, certificate, privateKey, csr };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
  parseCert: async (pem: string) => {
    try {
      const info = await invoke<any>('cert_parse', { pem });
      return {
        success: true,
        info: {
          subject: info.subject ? { CN: info.subject } : {},
          issuer: info.issuer ? { CN: info.issuer } : {},
          serialNumber: info.serial ?? '',
          validFrom: info.notBefore ? new Date(info.notBefore * 1000).toISOString() : '',
          validTo: info.notAfter ? new Date(info.notAfter * 1000).toISOString() : '',
          publicKey: { algorithm: info.keyAlgorithm ?? 'Unknown', size: 'N/A' },
          fingerprint256: info.fingerprintSha256 ?? '',
          fingerprint: '',
          extensions: [],
          isCA: Boolean(info.isCa),
          raw: pem,
        },
      };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },

  pingStart,
  pingStop: () => emit('ping:done'),
  onPingData: (cb: Listener) => on('ping:data', cb),
  onPingError: (cb: Listener) => on('ping:error', cb),
  onPingDone: (cb: Listener) => on('ping:done', cb),
  offPingListeners: (data?: Listener, error?: Listener, done?: Listener) => {
    off('ping:data', data);
    off('ping:error', error);
    off('ping:done', done);
  },
  tracertStart,
  tracertStop: () => emit('tracert:done'),
  onTracertData: (cb: Listener) => on('tracert:data', cb),
  onTracertError: (cb: Listener) => on('tracert:error', cb),
  onTracertDone: (cb: Listener) => on('tracert:done', cb),
  offTracertListeners: (data?: Listener, error?: Listener, done?: Listener) => {
    off('tracert:data', data);
    off('tracert:error', error);
    off('tracert:done', done);
  },

  mqttConnect: async (params: any) => {
    try {
      void ensureMqttBridge();
      const broker = `${params.protocol ?? 'mqtt://'}${params.host}:${params.port}${params.path && params.path !== '/' ? params.path : ''}`;
      const sessionId = await invoke<string>('mqtt_connect', {
        broker,
        clientId: params.clientId || null,
        username: params.username || null,
        password: params.password || null,
        keepAlive: 60,
      });
      mqttSessions.set(params.id, sessionId);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
    }
  },
  mqttDisconnect: async (id: string) => {
    const sessionId = mqttSessions.get(id);
    if (!sessionId) return { ok: true };
    mqttSessions.delete(id);
    await invoke('mqtt_disconnect', { sessionId });
    return { ok: true };
  },
  mqttSubscribe: async (id: string, topic: string, qos: number) => {
    const sessionId = mqttSessions.get(id);
    if (!sessionId) return { ok: false };
    await invoke('mqtt_subscribe', { sessionId, topic, qos });
    return { ok: true };
  },
  mqttUnsubscribe: async () => ({ ok: true }),
  mqttPublish: async (id: string, topic: string, payload: string, qos: number, retain: boolean) => {
    const sessionId = mqttSessions.get(id);
    if (!sessionId) return { ok: false };
    await invoke('mqtt_publish', { sessionId, topic, payload, qos, retain });
    return { ok: true };
  },
  onMqttEvent: (cb: Listener) => {
    void ensureMqttBridge();
    return on('mqtt', cb);
  },
  offMqttEvent: (cb?: Listener) => off('mqtt', cb),

  httpRequest: async (params: any) => {
    try {
      const response = await fetch(params.url, {
        method: params.method ?? 'GET',
        headers: params.headers,
        body: params.body,
      });
      const data =
        params.responseType === 'json'
          ? await response.json()
          : params.responseType === 'arrayBuffer'
            ? await response.arrayBuffer()
            : await response.text();
      return { ok: true, status: response.status, headers: {}, data };
    } catch (error) {
      return {
        ok: false,
        error: { code: 'network_error', message: error instanceof Error ? error.message : String(error) },
      };
    }
  },

  wsServerStatus: async () => ({ running: false, clients: [], stats: { totalRecv: 0, totalSent: 0 } }),
  wsServerStart: async () => {
    throw new Error('WebSocket server mode is not available in this build');
  },
  wsServerStop: async () => undefined,
  wsServerSend: async () => undefined,
  wsServerKick: async () => undefined,
  wsServerStressStart: async () => undefined,
  wsServerStressStop: async () => undefined,
  onWsServerEvent: (cb: Listener) => on('ws-server', cb),
  offWsServerEvent: (cb?: Listener) => off('ws-server', cb),
};

(window as any).electronAPI = api;
export {};
