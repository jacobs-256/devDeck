// @ts-nocheck
import { useCallback, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { marked } from 'marked';
import { HelpModal, ToolButton, ToolField, ToolInput, ToolSelect } from '@@components';
import { useI18n, getModuleLocale } from '../../../i18n';
import { VscCopy, VscQuestion, VscSave } from 'react-icons/vsc';
import styles from './UuidGenerator.module.css';
import './UuidHelp.css';

import helpEn from './locales/help-en.md?raw';

type Version = 'nil' | 'v1' | 'v3' | 'v4' | 'v5';
type NsPreset = 'dns' | 'url' | 'oid' | 'x500' | 'custom';

const NS_PRESETS: Record<Exclude<NsPreset, 'custom'>, string> = {
  dns: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
  url: '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
  oid: '6ba7b812-9dad-11d1-80b4-00c04fd430c8',
  x500: '6ba7b814-9dad-11d1-80b4-00c04fd430c8',
};

function hexByte(v: string): number {
  const n = Number.parseInt(v, 16);
  return Number.isFinite(n) ? n & 0xff : 0;
}

function parseUuid(u: string): Uint8Array | null {
  const s = u.trim().toLowerCase();
  const m = s.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  if (!m) return null;
  const hex = s.replace(/-/g, '');
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = hexByte(hex.slice(i * 2, i * 2 + 2));
  return out;
}

function toUuidString(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function randBytes(len: number): Uint8Array {
  const b = new Uint8Array(len);
  crypto.getRandomValues(b);
  return b;
}

function uuidNil(): string {
  return '00000000-0000-0000-0000-000000000000';
}

function uuidV4(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = randBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  return toUuidString(b);
}

type V1State = {
  node: Uint8Array;
  clockSeq: number;
  lastTime: bigint;
};

function makeV1State(): V1State {
  const node = randBytes(6);
  node[0] = node[0] | 0x01;
  const clockSeq = ((randBytes(2)[0] << 8) | randBytes(2)[1]) & 0x3fff;
  return { node, clockSeq, lastTime: 0n };
}

function uuidV1(state: V1State): string {
  const epoch = 12219292800000n;
  const nowMs = BigInt(Date.now());
  let t = (nowMs + epoch) * 10000n;
  if (t <= state.lastTime) {
    state.clockSeq = (state.clockSeq + 1) & 0x3fff;
    t = state.lastTime + 1n;
  }
  state.lastTime = t;

  const timeLow = Number(t & 0xffffffffn) >>> 0;
  const timeMid = Number((t >> 32n) & 0xffffn) & 0xffff;
  const timeHi = Number((t >> 48n) & 0x0fffn) & 0x0fff;
  const timeHiAndVersion = timeHi | 0x1000;
  const clockSeq = state.clockSeq & 0x3fff;
  const clockSeqHi = ((clockSeq >> 8) & 0x3f) | 0x80;
  const clockSeqLow = clockSeq & 0xff;

  const b = new Uint8Array(16);
  b[0] = (timeLow >>> 24) & 0xff;
  b[1] = (timeLow >>> 16) & 0xff;
  b[2] = (timeLow >>> 8) & 0xff;
  b[3] = timeLow & 0xff;
  b[4] = (timeMid >>> 8) & 0xff;
  b[5] = timeMid & 0xff;
  b[6] = (timeHiAndVersion >>> 8) & 0xff;
  b[7] = timeHiAndVersion & 0xff;
  b[8] = clockSeqHi;
  b[9] = clockSeqLow;
  b.set(state.node, 10);
  return toUuidString(b);
}

function add32(a: number, b: number): number {
  return (a + b) >>> 0;
}

function rol(x: number, s: number): number {
  return (x << s) | (x >>> (32 - s));
}

function md5(bytes: Uint8Array): Uint8Array {
  const origLen = bytes.length;
  const withOne = origLen + 1;
  const padLen = (withOne % 64 <= 56 ? 56 : 120) - (withOne % 64);
  const total = withOne + padLen + 8;
  const buf = new Uint8Array(total);
  buf.set(bytes, 0);
  buf[origLen] = 0x80;
  const bitLen = BigInt(origLen) * 8n;
  for (let i = 0; i < 8; i++) buf[total - 8 + i] = Number((bitLen >> BigInt(8 * i)) & 0xffn);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  const k = new Uint32Array(64);
  for (let i = 0; i < 64; i++) k[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0;
  const s = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5,
    9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6,
    10, 15, 21, 6, 10, 15, 21,
  ];

  for (let off = 0; off < total; off += 64) {
    const m = new Uint32Array(16);
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      m[i] = (buf[j] | (buf[j + 1] << 8) | (buf[j + 2] << 16) | (buf[j + 3] << 24)) >>> 0;
    }

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;

    for (let i = 0; i < 64; i++) {
      let f = 0;
      let g = 0;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const tmp = d;
      d = c;
      c = b;
      const x = add32(add32(add32(a, f >>> 0), k[i]), m[g]);
      b = add32(b, rol(x, s[i]));
      a = tmp;
    }

    a0 = add32(a0, a);
    b0 = add32(b0, b);
    c0 = add32(c0, c);
    d0 = add32(d0, d);
  }

  const out = new Uint8Array(16);
  const w = [a0, b0, c0, d0];
  for (let i = 0; i < 4; i++) {
    out[i * 4] = w[i] & 0xff;
    out[i * 4 + 1] = (w[i] >>> 8) & 0xff;
    out[i * 4 + 2] = (w[i] >>> 16) & 0xff;
    out[i * 4 + 3] = (w[i] >>> 24) & 0xff;
  }
  return out;
}

async function sha1(bytes: Uint8Array): Promise<Uint8Array> {
  const ab = await crypto.subtle.digest('SHA-1', bytes as unknown as BufferSource);
  return new Uint8Array(ab);
}

async function uuidNameBased(version: 3 | 5, namespace: Uint8Array, name: string): Promise<string> {
  const nameBytes = new TextEncoder().encode(name);
  const merged = new Uint8Array(namespace.length + nameBytes.length);
  merged.set(namespace, 0);
  merged.set(nameBytes, namespace.length);
  const digest = version === 3 ? md5(merged) : (await sha1(merged)).slice(0, 16);
  const b = digest.slice(0, 16);
  b[6] = (b[6] & 0x0f) | (version === 3 ? 0x30 : 0x50);
  b[8] = (b[8] & 0x3f) | 0x80;
  return toUuidString(b);
}

export default function UuidGenerator() {
  const { locale } = useI18n();
  const loc = getModuleLocale(locale, 'UuidGenerator');
  const mt = useCallback((k: string) => loc?.[k] ?? k, [loc]);

  const [version, setVersion] = useState<Version>('v4');
  const [qty, setQty] = useState('1');
  const [nsPreset, setNsPreset] = useState<NsPreset>('dns');
  const [nsUuid, setNsUuid] = useState(NS_PRESETS.dns);
  const [name, setName] = useState('');
  const [outList, setOutList] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [savedAll, setSavedAll] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const v1Ref = useRef<V1State | null>(null);

  const effectiveQty = useMemo(() => {
    const n = Number(qty);
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(200, Math.floor(n)));
  }, [qty]);

  const outText = useMemo(() => outList.join('\n'), [outList]);

  const handleGenerate = useCallback(async () => {
    setCopiedAll(false);
    setCopiedIdx(null);
    setError('');
    const list: string[] = [];

    if (version === 'nil') {
      for (let i = 0; i < effectiveQty; i++) list.push(uuidNil());
      setOutList(list);
      return;
    }
    if (version === 'v4') {
      for (let i = 0; i < effectiveQty; i++) list.push(uuidV4());
      setOutList(list);
      return;
    }
    if (version === 'v1') {
      if (!v1Ref.current) v1Ref.current = makeV1State();
      for (let i = 0; i < effectiveQty; i++) list.push(uuidV1(v1Ref.current));
      setOutList(list);
      return;
    }

    const nsBytes = parseUuid(nsUuid);
    if (!nsBytes) {
      setError(mt('errorInvalidNamespace'));
      return;
    }
    if (!name.trim()) {
      setError(mt('errorNameRequired'));
      return;
    }
    for (let i = 0; i < effectiveQty; i++) {
      list.push(await uuidNameBased(version === 'v3' ? 3 : 5, nsBytes, name));
    }
    setOutList(list);
  }, [effectiveQty, mt, name, nsUuid, version]);

  const handleCopyAll = useCallback(async () => {
    if (!outText) return;
    await navigator.clipboard.writeText(outText);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1500);
  }, [outText]);

  const handleSaveAll = useCallback(async () => {
    if (!outText) return;
    const api = window.electronAPI;
    if (api?.saveFileAs) {
      const filters = [{ name: 'Text', extensions: ['txt'] }];
      const p = await api.saveFileAs('uuids.txt', outText, filters);
      if (!p) return;
      setSavedAll(true);
      setTimeout(() => setSavedAll(false), 1500);
      return;
    }
    const blob = new Blob([outText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'uuids.txt';
    a.click();
    URL.revokeObjectURL(url);
    setSavedAll(true);
    setTimeout(() => setSavedAll(false), 1500);
  }, [outText]);

  const handleCopyOne = useCallback(async (uuid: string, idx: number) => {
    await navigator.clipboard.writeText(uuid);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx((v) => (v === idx ? null : v)), 1500);
  }, []);

  const showNameBased = version === 'v3' || version === 'v5';
  const helpHtml = useMemo(() => {
    return marked.parse(helpEn, { breaks: true, gfm: true }) as string;
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.configPane}>
        <div className={styles.paneHeader}>
          <span>{mt('config')}</span>
          <div className={styles.actionsRow}>
            <ToolButton variant="primary" onClick={() => void handleGenerate()}>
              {mt('generate')}
            </ToolButton>
            <ToolButton onClick={() => setShowHelp(true)} aria-label={mt('help')}>
              <VscQuestion />
              {mt('help')}
            </ToolButton>
          </div>
        </div>

        <div className={styles.configBody}>
          <ToolField label={mt('version')}>
            <div className={styles.versionRow}>
              {(['nil', 'v1', 'v3', 'v4', 'v5'] as Version[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`${styles.verBtn}${version === v ? ` ${styles.verBtnActive}` : ''}`}
                  onClick={() => setVersion(v)}
                >
                  {v === 'nil' ? 'NIL' : v}
                </button>
              ))}
            </div>
          </ToolField>

          <div className={styles.row}>
            <ToolField label={mt('quantity')}>
              <ToolInput
                value={qty}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setQty(e.target.value)}
                spellCheck={false}
                inputMode="numeric"
              />
            </ToolField>
          </div>

          {showNameBased && (
            <>
              <div className={styles.row}>
                <ToolField label={mt('namespace')}>
                  <ToolSelect
                    value={nsPreset}
                    onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                      const next = e.target.value as NsPreset;
                      setNsPreset(next);
                      if (next !== 'custom') setNsUuid(NS_PRESETS[next]);
                    }}
                  >
                    <option value="dns">DNS</option>
                    <option value="url">URL</option>
                    <option value="oid">OID</option>
                    <option value="x500">X.500</option>
                    <option value="custom">{mt('custom')}</option>
                  </ToolSelect>
                </ToolField>

                <ToolField label={mt('nameInput')}>
                  <ToolInput
                    value={name}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                    spellCheck={false}
                  />
                </ToolField>
              </div>

              <ToolField label={mt('namespaceUuid')}>
                <ToolInput
                  value={nsUuid}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setNsUuid(e.target.value)}
                  spellCheck={false}
                  placeholder={NS_PRESETS.dns}
                />
              </ToolField>
            </>
          )}

          {error && <div className={styles.err}>{error}</div>}
        </div>
      </div>

      <div className={styles.previewPane}>
        <div className={styles.paneHeader}>
          <span>{mt('output')}</span>
          <div className={styles.paneActions}>
            <ToolButton onClick={() => void handleSaveAll()} disabled={!outList.length}>
              <VscSave />
              {savedAll ? mt('saved') : mt('save')}
            </ToolButton>
            <ToolButton onClick={() => void handleCopyAll()} disabled={!outList.length}>
              <VscCopy />
              {copiedAll ? mt('copied') : mt('copy')}
            </ToolButton>
          </div>
        </div>

        <div className={styles.previewBody}>
          {outList.length ? (
            <div className={styles.list}>
              {outList.map((uuid, i) => (
                <div key={`${uuid}_${i}`} className={styles.item}>
                  <span className={styles.itemIdx}>#{i + 1}</span>
                  <code className={styles.itemCode}>{uuid}</code>
                  <ToolButton
                    className={styles.itemBtn}
                    onClick={() => void handleCopyOne(uuid, i)}
                    aria-label={mt('copy')}
                  >
                    <VscCopy />
                    {copiedIdx === i ? mt('copied') : mt('copy')}
                  </ToolButton>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.placeholder}>{mt('placeholder')}</div>
          )}
        </div>
      </div>

      {showHelp && (
        <HelpModal title={mt('helpTitle')} size="md" onClose={() => setShowHelp(false)}>
          <div className="uuid-help" dangerouslySetInnerHTML={{ __html: helpHtml }} />
        </HelpModal>
      )}
    </div>
  );
}
