// @ts-nocheck
import { useState, useMemo, useCallback, useEffect, useRef, type ChangeEvent } from 'react';
import { useI18n, getModuleLocale } from '../../../i18n';
import styles from './JwtTool.module.css';
import { ToolButton, ToolField, ToolInput, ToolSection, ToolSelect, ToolTextarea } from '@@components';
import { VscCopy, VscKey, VscSearch, VscShield } from 'react-icons/vsc';
function b64d(s: string) {
  let r = s.replace(/-/g, '+').replace(/_/g, '/');
  while (r.length % 4) r += '=';
  return atob(r);
}
function b64e(s: string) {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64uToBytes(s: string) {
  let r = s.replace(/-/g, '+').replace(/_/g, '/');
  while (r.length % 4) r += '=';
  const bin = atob(r);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hl(t: string) {
  return t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/("(?:\\.|[^"\\])*")(\s*:)/g, '<span class="json-key">$1</span>$2')
    .replace(/:\s*("(?:\\.|[^"\\])*")(?=\s*[,\n\r\]}])/g, (match: string, str: string) =>
      match.replace(str, `<span class="json-str">${str}</span>`),
    )
    .replace(/:\s*(-?\d+\.?\d*(?:[eE][+-]?\d+)?)(?=\s*[,\n\r\]}])/g, (match: string, num: string) =>
      match.replace(num, `<span class="json-num">${num}</span>`),
    )
    .replace(/:\s*(true|false)(?=\s*[,\n\r\]}])/g, (match: string, val: string) =>
      match.replace(val, `<span class="json-bool">${val}</span>`),
    )
    .replace(/:\s*(null)(?=\s*[,\n\r\]}])/g, (match: string, val: string) =>
      match.replace(val, `<span class="json-null">${val}</span>`),
    );
}
async function sign(alg: string, sec: string, data: string) {
  const h: Record<string, string> = { HS256: 'SHA-256', HS384: 'SHA-384', HS512: 'SHA-512' };
  const e = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', e.encode(sec), { name: 'HMAC', hash: h[alg] }, false, [
    'sign',
  ]);
  const s = await crypto.subtle.sign('HMAC', k, e.encode(data));
  return b64e(String.fromCharCode(...new Uint8Array(s)));
}

function encodeDerLen(len: number): Uint8Array {
  if (len < 0x80) return new Uint8Array([len]);
  const bytes: number[] = [];
  let n = len;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function trimLeadingZeros(buf: Uint8Array): Uint8Array {
  let i = 0;
  while (i < buf.length - 1 && buf[i] === 0) i += 1;
  return buf.slice(i);
}

function derInteger(raw: Uint8Array): Uint8Array {
  const v0 = trimLeadingZeros(raw);
  const needsPad = v0.length > 0 && (v0[0] & 0x80) !== 0;
  const v = needsPad ? new Uint8Array([0x00, ...Array.from(v0)]) : v0;
  return new Uint8Array([0x02, ...Array.from(encodeDerLen(v.length)), ...Array.from(v)]);
}

function joseEcdsaSigToDer(sig: Uint8Array): Uint8Array | null {
  if (sig.length % 2 !== 0) return null;
  const n = sig.length / 2;
  const r = sig.slice(0, n);
  const s = sig.slice(n);
  const rDer = derInteger(r);
  const sDer = derInteger(s);
  const seqLen = rDer.length + sDer.length;
  const lenEnc = encodeDerLen(seqLen);
  return new Uint8Array([0x30, ...Array.from(lenEnc), ...Array.from(rDer), ...Array.from(sDer)]);
}

function parseAudInput(v: string): string[] {
  return v
    .split(/[,\n\r]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

function normalizeAudClaim(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  return [];
}

async function importVerifyKeyFromJwk(alg: string, jwk: JsonWebKey): Promise<CryptoKey> {
  if (alg === 'RS256') {
    return crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, [
      'verify',
    ]);
  }
  if (alg === 'RS384') {
    return crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-384' }, false, [
      'verify',
    ]);
  }
  if (alg === 'RS512') {
    return crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' }, false, [
      'verify',
    ]);
  }
  if (alg === 'ES256') {
    return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  }
  if (alg === 'ES384') {
    return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-384' }, false, ['verify']);
  }
  if (alg === 'ES512') {
    return crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-521' }, false, ['verify']);
  }
  throw new Error(`Unsupported alg: ${alg}`);
}

async function verifyWithKey(
  alg: string,
  key: CryptoKey,
  data: Uint8Array,
  sig: Uint8Array,
): Promise<boolean> {
  if (alg.startsWith('RS')) {
    const hash = alg === 'RS256' ? 'SHA-256' : alg === 'RS384' ? 'SHA-384' : 'SHA-512';
    return crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5', hash },
      key,
      sig as unknown as BufferSource,
      data as unknown as BufferSource,
    );
  }
  if (alg.startsWith('ES')) {
    const hash = alg === 'ES256' ? 'SHA-256' : alg === 'ES384' ? 'SHA-384' : 'SHA-512';
    const der = joseEcdsaSigToDer(sig);
    if (!der) return false;
    return crypto.subtle.verify(
      { name: 'ECDSA', hash },
      key,
      der as unknown as BufferSource,
      data as unknown as BufferSource,
    );
  }
  return false;
}
function Blk({
  title,
  copyLabel,
  onCopy,
  children,
}: {
  title: string;
  copyLabel: string;
  onCopy?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.blk}>
      <div className={styles.blkH}>
        <span>{title}</span>
        {onCopy && (
          <ToolButton className={styles.cpBtn} onClick={onCopy}>
            <VscCopy />
            {copyLabel}
          </ToolButton>
        )}
      </div>
      <div className={styles.blkB}>{children}</div>
    </div>
  );
}

function JsonArea({
  value,
  onChange,
  rows,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  rows: number;
  label: string;
}) {
  const [editing, setEditing] = useState(false);
  const isValid = useMemo(() => {
    try {
      JSON.parse(value);
      return true;
    } catch {
      return false;
    }
  }, [value]);
  if (editing || !isValid) {
    return (
      <ToolField label={label}>
        <ToolTextarea
          mono
          value={value}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
          onBlur={() => setEditing(false)}
          spellCheck={false}
          rows={rows}
          autoFocus={editing}
        />
      </ToolField>
    );
  }
  const formatted = JSON.stringify(JSON.parse(value), null, 2);
  return (
    <ToolField label={label}>
      <div className={styles.jsonPreview} onClick={() => setEditing(true)}>
        <pre className={styles.hl} dangerouslySetInnerHTML={{ __html: hl(formatted) }} />
      </div>
    </ToolField>
  );
}

export default function JwtTool() {
  const { locale } = useI18n();
  const loc = getModuleLocale(locale, 'JwtTool');
  const mt = useCallback((k: string) => loc?.[k] ?? k, [loc]);
  const [tab, setTab] = useState<'decode' | 'hmac' | 'oidc' | 'generate'>('decode');
  const [token, setToken] = useState('');
  const [hToken, setHToken] = useState('');
  const [hSecret, setHSecret] = useState('');
  const [hResult, setHResult] = useState<{ type: 'success' | 'error' | 'warning'; msg: string }[]>([]);

  const [oToken, setOToken] = useState('');
  const [oidcResult, setOidcResult] = useState<{ type: 'success' | 'error' | 'warning'; msg: string }[]>([]);
  const [oidcAuto, setOidcAuto] = useState(true);
  const [oidcAllowHttp, setOidcAllowHttp] = useState(false);
  const [oidcAud, setOidcAud] = useState('');
  const [oidcSkew, setOidcSkew] = useState('120');
  const [oidcBusy, setOidcBusy] = useState(false);
  const oidcBusyRef = useRef(false);
  const [oidcInfo, setOidcInfo] = useState<{ issuer?: string; jwksUri?: string } | null>(null);
  const [oidcDecoded, setOidcDecoded] = useState<{
    header: string;
    payload: string;
    signature: string;
  } | null>(null);
  const [oidcJwksKid, setOidcJwksKid] = useState('');
  const [oidcJwksKey, setOidcJwksKey] = useState<string | null>(null);
  const cacheRef = useRef(new Map<string, { ts: number; data: unknown }>());
  const [gAlg, setGAlg] = useState('HS256');
  const [gSecret, setGSecret] = useState('');
  const [gHeader, setGHeader] = useState('{\n  "alg": "HS256",\n  "typ": "JWT"\n}');
  const [gPayload, setGPayload] = useState(
    '{\n  "sub": "1234567890",\n  "name": "Test",\n  "iat": ' + Math.floor(Date.now() / 1000) + '\n}',
  );
  const [gOutput, setGOutput] = useState('');
  const [gError, setGError] = useState('');
  const decoded = useMemo(() => {
    const t = token.trim();
    if (!t) return null;
    const p = t.split('.');
    if (p.length !== 3) return { error: mt('decodeError') };
    try {
      return {
        header: JSON.stringify(JSON.parse(b64d(p[0])) as unknown, null, 2),
        payload: JSON.stringify(JSON.parse(b64d(p[1])) as unknown, null, 2),
        signature: p[2],
      };
    } catch {
      return { error: mt('decodeError') };
    }
  }, [token, mt]);

  const sdk = useMemo(() => {
    const request = async (params: {
      url: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      timeoutMs?: number;
      responseType?: 'text' | 'json' | 'arrayBuffer';
      allowHttp?: boolean;
    }) => {
      const api = window.electronAPI;
      if (!api?.httpRequest)
        return { ok: false as const, error: { code: 'not_supported', message: 'httpRequest not available' } };
      const r = (await api.httpRequest(params)) as unknown;
      const rec = isRecord(r) ? r : {};
      if (rec.ok === true) return { ok: true as const, data: rec.data };
      const err = isRecord(rec.error) ? rec.error : {};
      const code = typeof err.code === 'string' ? err.code : 'network_error';
      const message = typeof err.message === 'string' ? err.message : 'Network error';
      return { ok: false as const, error: { code, message } };
    };
    return { http: { request } };
  }, []);

  const fetchJson = useCallback(
    async (url: string) => {
      const now = Date.now();
      const cached = cacheRef.current.get(url);
      if (cached && now - cached.ts < 10 * 60 * 1000) return { ok: true as const, data: cached.data };
      const r = (await sdk.http.request({
        url,
        method: 'GET',
        responseType: 'json',
        allowHttp: oidcAllowHttp,
        timeoutMs: 15000,
      })) as {
        ok: boolean;
        data?: unknown;
        error?: { code: string; message: string };
      };
      if (r.ok) {
        const dataRec = isRecord(r.data) ? r.data : {};
        const d = dataRec.data;
        cacheRef.current.set(url, { ts: now, data: d });
        return { ok: true as const, data: d };
      }
      return { ok: false as const, error: r.error ?? { code: 'network_error', message: 'Network error' } };
    },
    [oidcAllowHttp, sdk],
  );

  const handleOidcVerify = useCallback(async () => {
    if (oidcBusyRef.current) return;
    setOidcResult([]);
    setOidcInfo(null);
    setOidcDecoded(null);
    setOidcJwksKid('');
    setOidcJwksKey(null);
    const t = oToken.trim();
    if (!t) return;
    const parts = t.split('.');
    if (parts.length !== 3) {
      setOidcResult([{ type: 'error', msg: mt('decodeError') }]);
      return;
    }
    let hdr: Record<string, unknown> = {};
    let pl: Record<string, unknown> = {};
    let hdrRaw: unknown;
    let plRaw: unknown;
    try {
      hdrRaw = JSON.parse(b64d(parts[0])) as unknown;
      plRaw = JSON.parse(b64d(parts[1])) as unknown;
      hdr = isRecord(hdrRaw) ? hdrRaw : {};
      pl = isRecord(plRaw) ? plRaw : {};
    } catch {
      setOidcResult([{ type: 'error', msg: mt('decodeError') }]);
      return;
    }

    setOidcDecoded({
      header: JSON.stringify(hdrRaw, null, 2),
      payload: JSON.stringify(plRaw, null, 2),
      signature: parts[2],
    });

    const alg = typeof hdr.alg === 'string' ? hdr.alg : '';
    const iss = typeof pl.iss === 'string' ? pl.iss : '';
    const kid = typeof hdr.kid === 'string' ? hdr.kid : '';
    if (!iss) {
      setOidcResult([{ type: 'error', msg: mt('oidcMissingIss') }]);
      return;
    }
    if (!alg || alg.startsWith('HS')) {
      setOidcResult([{ type: 'warning', msg: mt('oidcHmacNotSupported') }]);
      return;
    }
    if (!alg.startsWith('RS') && !alg.startsWith('ES')) {
      setOidcResult([{ type: 'warning', msg: `${mt('oidcUnsupportedAlg')}: ${alg}` }]);
      return;
    }

    const r: Array<{ type: 'success' | 'error' | 'warning'; msg: string }> = [];
    oidcBusyRef.current = true;
    setOidcBusy(true);
    try {
      r.push({ type: 'success', msg: mt('oidcStart') });
      const issuer = iss.replace(/\/+$/g, '');
      const wellKnown = `${issuer}/.well-known/openid-configuration`;
      const d = await fetchJson(wellKnown);
      if (!d.ok || !isRecord(d.data)) {
        r.push({ type: 'error', msg: mt('oidcDiscoveryFailed') });
        setOidcResult(r);
        return;
      }
      const issuerFromConfig = typeof d.data.issuer === 'string' ? d.data.issuer : '';
      const jwksUri = typeof d.data.jwks_uri === 'string' ? d.data.jwks_uri : '';
      if (!issuerFromConfig || !jwksUri) {
        r.push({ type: 'error', msg: mt('oidcInvalidDiscovery') });
        setOidcResult(r);
        return;
      }
      if (issuerFromConfig !== issuer) {
        r.push({ type: 'error', msg: mt('oidcIssuerMismatch') });
        setOidcResult(r);
        return;
      }
      setOidcInfo({ issuer: issuerFromConfig, jwksUri });
      r.push({ type: 'success', msg: mt('oidcDiscoveryOk') });

      const jwksRes = await fetchJson(jwksUri);
      if (!jwksRes.ok || !isRecord(jwksRes.data)) {
        r.push({ type: 'error', msg: mt('jwksFetchFailed') });
        setOidcResult(r);
        return;
      }
      const keysUnknown = jwksRes.data.keys;
      const keys = Array.isArray(keysUnknown)
        ? keysUnknown.filter((k): k is Record<string, unknown> => isRecord(k))
        : [];
      if (!keys.length) {
        r.push({ type: 'error', msg: mt('jwksNoKeys') });
        setOidcResult(r);
        return;
      }
      r.push({ type: 'success', msg: mt('jwksFetchOk') });

      const candidates = keys.filter((k) => {
        const use = typeof k.use === 'string' ? k.use : '';
        if (use && use !== 'sig') return false;
        const kty = typeof k.kty === 'string' ? k.kty : '';
        if (alg.startsWith('RS') && kty !== 'RSA') return false;
        if (alg.startsWith('ES') && kty !== 'EC') return false;
        return true;
      });
      const byKid = kid
        ? candidates.filter((k) => (typeof k.kid === 'string' ? k.kid : '') === kid)
        : candidates;
      if (!byKid.length) {
        r.push({ type: 'error', msg: mt('jwksKidNotFound') });
        setOidcResult(r);
        return;
      }

      const data = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
      const sigRaw = b64uToBytes(parts[2]);

      let sigOk = false;
      let matched: Record<string, unknown> | null = null;
      for (const k of byKid) {
        try {
          const jwk = k as unknown as JsonWebKey;
          const key = await importVerifyKeyFromJwk(alg, jwk);
          const ok = await verifyWithKey(alg, key, data, sigRaw);
          if (ok) {
            sigOk = true;
            matched = k;
            break;
          }
        } catch {
          continue;
        }
      }
      setOidcJwksKid(kid);
      setOidcJwksKey(JSON.stringify((matched ?? byKid[0]) as unknown, null, 2));
      r.push({ type: sigOk ? 'success' : 'error', msg: sigOk ? mt('verifyValid') : mt('verifyInvalid') });
      if (!sigOk) {
        setOidcResult(r);
        return;
      }

      const skew = Math.max(0, Math.min(3600, Number(oidcSkew) || 0));
      const now = Math.floor(Date.now() / 1000);
      const exp = typeof pl.exp === 'number' ? pl.exp : undefined;
      const nbf = typeof pl.nbf === 'number' ? pl.nbf : undefined;
      const audClaim = normalizeAudClaim(pl.aud);
      const expectedAud = parseAudInput(oidcAud);

      if (exp == null) r.push({ type: 'warning', msg: mt('claimsMissingExp') });
      else if (now > exp + skew) r.push({ type: 'error', msg: mt('verifyExpired') });
      else r.push({ type: 'success', msg: mt('claimsExpOk') });

      if (nbf != null && now + skew < nbf) r.push({ type: 'error', msg: mt('verifyNotBefore') });
      else if (nbf != null) r.push({ type: 'success', msg: mt('claimsNbfOk') });

      if (!audClaim.length) r.push({ type: 'warning', msg: mt('claimsMissingAud') });
      else if (expectedAud.length) {
        const ok = expectedAud.some((a) => audClaim.includes(a));
        r.push({ type: ok ? 'success' : 'error', msg: ok ? mt('claimsAudOk') : mt('claimsAudBad') });
      } else {
        r.push({ type: 'success', msg: mt('claimsAudOk') });
      }

      if (issuerFromConfig === iss) r.push({ type: 'success', msg: mt('claimsIssOk') });
      else r.push({ type: 'error', msg: mt('claimsIssBad') });

      setOidcResult(r);
    } finally {
      oidcBusyRef.current = false;
      setOidcBusy(false);
    }
  }, [fetchJson, mt, oidcAud, oidcSkew, oToken]);

  useEffect(() => {
    if (!oidcAuto) return;
    if (!oToken.trim()) return;
    const t = window.setTimeout(() => {
      void handleOidcVerify();
    }, 600);
    return () => window.clearTimeout(t);
  }, [handleOidcVerify, oidcAuto, oToken]);

  const handleVerify = useCallback(async () => {
    setHResult([]);
    const p = hToken.trim().split('.');
    if (p.length !== 3) {
      setHResult([{ type: 'error', msg: mt('decodeError') }]);
      return;
    }
    try {
      const hdrUnknown = JSON.parse(b64d(p[0])) as unknown;
      const plUnknown = JSON.parse(b64d(p[1])) as unknown;
      const hdr = isRecord(hdrUnknown) ? hdrUnknown : {};
      const pl = isRecord(plUnknown) ? plUnknown : {};
      const alg = typeof hdr.alg === 'string' ? hdr.alg : '';

      const r: Array<{ type: 'success' | 'error' | 'warning'; msg: string }> = [];
      if (alg.startsWith('HS')) {
        const sig = await sign(alg, hSecret, `${p[0]}.${p[1]}`);
        const ok = sig === p[2];
        r.push({ type: ok ? 'success' : 'error', msg: ok ? mt('verifyValid') : mt('verifyInvalid') });
      } else {
        r.push({ type: 'warning', msg: `${alg}: HMAC only` });
      }

      const now = Math.floor(Date.now() / 1000);
      const exp = typeof pl.exp === 'number' ? pl.exp : undefined;
      const nbf = typeof pl.nbf === 'number' ? pl.nbf : undefined;
      if (exp != null && now > exp) r.push({ type: 'warning', msg: mt('verifyExpired') });
      if (nbf != null && now < nbf) r.push({ type: 'warning', msg: mt('verifyNotBefore') });
      setHResult(r);
    } catch {
      setHResult([{ type: 'error', msg: mt('decodeError') }]);
    }
  }, [hToken, hSecret, mt]);

  const handleGen = useCallback(async () => {
    setGError('');
    setGOutput('');
    try {
      const hUnknown = JSON.parse(gHeader) as unknown;
      const h = isRecord(hUnknown) ? hUnknown : {};
      h.alg = gAlg;
      if (typeof h.typ !== 'string' || !h.typ) h.typ = 'JWT';
      const hB = b64e(JSON.stringify(h));
      const pB = b64e(JSON.stringify(JSON.parse(gPayload) as unknown));
      const d = `${hB}.${pB}`;
      if (gAlg.startsWith('HS')) setGOutput(`${d}.${await sign(gAlg, gSecret, d)}`);
      else setGError(`${gAlg}: HMAC only`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : mt('generateError');
      setGError(msg);
    }
  }, [gAlg, gHeader, gPayload, gSecret, mt]);

  const cp = useCallback((t: string) => {
    void navigator.clipboard.writeText(t);
  }, []);
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'decode' ? styles.tabActive : ''}`}
            onClick={() => setTab('decode')}
          >
            {mt('tabDecode')}
          </button>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'hmac' ? styles.tabActive : ''}`}
            onClick={() => setTab('hmac')}
          >
            {mt('tabVerifyHmac')}
          </button>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'oidc' ? styles.tabActive : ''}`}
            onClick={() => setTab('oidc')}
          >
            {mt('tabVerifyOidc')}
          </button>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'generate' ? styles.tabActive : ''}`}
            onClick={() => setTab('generate')}
          >
            {mt('tabGenerate')}
          </button>
        </div>
      </div>

      <div className={styles.body}>
        {tab === 'decode' && (
          <ToolSection title={mt('tabDecode')} icon={<VscSearch />} accentColor="#8e44ad">
            <ToolTextarea
              mono
              value={token}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setToken(e.target.value)}
              placeholder={mt('inputPlaceholder')}
              spellCheck={false}
              rows={3}
            />
            {decoded && 'error' in decoded && <div className={styles.err}>{decoded.error}</div>}
            {decoded && 'header' in decoded && (
              <div className={styles.grid}>
                <Blk title={mt('header')} copyLabel={mt('copy')} onCopy={() => cp(decoded.header!)}>
                  <pre className={styles.hl} dangerouslySetInnerHTML={{ __html: hl(decoded.header!) }} />
                </Blk>
                <Blk title={mt('payload')} copyLabel={mt('copy')} onCopy={() => cp(decoded.payload!)}>
                  <pre className={styles.hl} dangerouslySetInnerHTML={{ __html: hl(decoded.payload!) }} />
                </Blk>
              </div>
            )}
            {decoded && 'signature' in decoded && (
              <Blk title={mt('signature')} copyLabel={mt('copy')} onCopy={() => cp(decoded.signature!)}>
                <code className={styles.sig}>{decoded.signature}</code>
              </Blk>
            )}
          </ToolSection>
        )}

        {tab === 'hmac' && (
          <ToolSection
            title={mt('tabVerifyHmac')}
            icon={<VscShield />}
            accentColor="#27ae60"
            actions={
              <ToolButton variant="primary" onClick={handleVerify} disabled={!hToken.trim()}>
                {mt('verifyBtn')}
              </ToolButton>
            }
          >
            <ToolTextarea
              mono
              value={hToken}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setHToken(e.target.value)}
              placeholder={mt('inputPlaceholder')}
              spellCheck={false}
              rows={2}
            />
            <ToolField label={mt('verifySecret')}>
              <ToolInput
                value={hSecret}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setHSecret(e.target.value)}
                placeholder={mt('verifySecretPlaceholder')}
                spellCheck={false}
              />
            </ToolField>
            {hResult.length > 0 && (
              <div className={styles.verifyRow}>
                {hResult.map((r, i) => (
                  <span key={i} className={`${styles.badge} ${styles[`b_${r.type}`]}`}>
                    {r.msg}
                  </span>
                ))}
              </div>
            )}
          </ToolSection>
        )}

        {tab === 'oidc' && (
          <ToolSection
            title={mt('tabVerifyOidc')}
            icon={<VscShield />}
            accentColor="#3498db"
            actions={
              <ToolButton variant="primary" onClick={handleOidcVerify} disabled={!oToken.trim() || oidcBusy}>
                {oidcBusy ? mt('oidcVerifying') : mt('oidcVerifyBtn')}
              </ToolButton>
            }
          >
            <ToolTextarea
              mono
              value={oToken}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setOToken(e.target.value)}
              placeholder={mt('inputPlaceholder')}
              spellCheck={false}
              rows={2}
            />
            <div className={styles.optionsRow}>
              <label className={styles.checkLabel}>
                <input type="checkbox" checked={oidcAuto} onChange={(e) => setOidcAuto(e.target.checked)} />
                {mt('oidcAuto')}
              </label>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={oidcAllowHttp}
                  onChange={(e) => setOidcAllowHttp(e.target.checked)}
                />
                {mt('oidcAllowHttp')}
              </label>
            </div>
            <div className={styles.row}>
              <ToolField label={mt('oidcAud')}>
                <ToolInput
                  value={oidcAud}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setOidcAud(e.target.value)}
                  placeholder={mt('oidcAudPlaceholder')}
                  spellCheck={false}
                />
              </ToolField>
              <ToolField label={mt('oidcSkew')}>
                <ToolInput
                  value={oidcSkew}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setOidcSkew(e.target.value)}
                  placeholder="120"
                  spellCheck={false}
                />
              </ToolField>
            </div>
            {oidcInfo?.issuer && (
              <div className={styles.oidcMeta}>
                <div>{mt('oidcIssuer') + ': ' + oidcInfo.issuer}</div>
                {oidcInfo.jwksUri && <div>{mt('oidcJwksUri') + ': ' + oidcInfo.jwksUri}</div>}
              </div>
            )}
            {oidcResult.length > 0 && (
              <div className={styles.verifyRow}>
                {oidcResult.map((r, i) => (
                  <span key={i} className={`${styles.badge} ${styles[`b_${r.type}`]}`}>
                    {r.msg}
                  </span>
                ))}
              </div>
            )}
            {oidcDecoded && (
              <div className={styles.grid}>
                <Blk title={mt('header')} copyLabel={mt('copy')} onCopy={() => cp(oidcDecoded.header)}>
                  <pre className={styles.hl} dangerouslySetInnerHTML={{ __html: hl(oidcDecoded.header) }} />
                </Blk>
                <Blk title={mt('payload')} copyLabel={mt('copy')} onCopy={() => cp(oidcDecoded.payload)}>
                  <pre className={styles.hl} dangerouslySetInnerHTML={{ __html: hl(oidcDecoded.payload) }} />
                </Blk>
              </div>
            )}
            {oidcDecoded && (
              <Blk title={mt('signature')} copyLabel={mt('copy')} onCopy={() => cp(oidcDecoded.signature)}>
                <code className={styles.sig}>{oidcDecoded.signature}</code>
              </Blk>
            )}
            {oidcJwksKey && (
              <Blk
                title={`${mt('jwksKey')}${oidcJwksKid ? ` (${oidcJwksKid})` : ''}`}
                copyLabel={mt('copy')}
                onCopy={() => cp(oidcJwksKey)}
              >
                <pre className={styles.hl} dangerouslySetInnerHTML={{ __html: hl(oidcJwksKey) }} />
              </Blk>
            )}
          </ToolSection>
        )}

        {tab === 'generate' && (
          <ToolSection
            title={mt('tabGenerate')}
            icon={<VscKey />}
            accentColor="#f39c12"
            actions={
              <ToolButton variant="primary" onClick={handleGen}>
                {mt('generateBtn')}
              </ToolButton>
            }
          >
            <div className={styles.row}>
              <ToolField label={mt('algorithm')}>
                <ToolSelect
                  value={gAlg}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => setGAlg(e.target.value)}
                >
                  <option>HS256</option>
                  <option>HS384</option>
                  <option>HS512</option>
                </ToolSelect>
              </ToolField>
              <ToolField label={mt('secret')}>
                <ToolInput
                  value={gSecret}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setGSecret(e.target.value)}
                  placeholder={mt('secretPlaceholder')}
                  spellCheck={false}
                />
              </ToolField>
            </div>
            <JsonArea label={mt('headerInput')} value={gHeader} onChange={setGHeader} rows={4} />
            <JsonArea label={mt('payloadInput')} value={gPayload} onChange={setGPayload} rows={6} />
            {gError && <div className={styles.err}>{gError}</div>}
            {gOutput && (
              <Blk title={mt('generatedToken')} copyLabel={mt('copy')} onCopy={() => cp(gOutput)}>
                <code className={styles.tok}>{gOutput}</code>
              </Blk>
            )}
          </ToolSection>
        )}
      </div>
    </div>
  );
}
