// @ts-nocheck
import { useState, useEffect, useCallback } from 'react';
import { useI18n, getModuleLocale } from '../../../i18n';
import styles from './StringEncrypt.module.css';

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}
function toBase64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function toArrayBufferView(buf: Uint8Array): Uint8Array<ArrayBuffer> {
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);
  return new Uint8Array<ArrayBuffer>(ab);
}

async function hash(alg: string, data: string): Promise<string> {
  const buf = await crypto.subtle.digest(alg, new TextEncoder().encode(data));
  return toHex(buf);
}

async function hmac(alg: string, key: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: alg }, false, [
    'sign',
  ]);
  const buf = await crypto.subtle.sign('HMAC', k, enc.encode(data));
  return toHex(buf);
}

async function aesEncrypt(
  data: string,
  keyStr: string,
  ivStr: string,
  mode: string,
): Promise<{ result: string; iv: string }> {
  const enc = new TextEncoder();
  const keyBuf = enc.encode(keyStr);
  if (![16, 24, 32].includes(keyBuf.length)) throw new Error('Key must be 16/24/32 bytes');
  const dataEnc = enc.encode(data);
  if (mode === 'CBC') {
    let ivBuf: Uint8Array;
    if (ivStr) {
      ivBuf = enc.encode(ivStr);
      if (ivBuf.length !== 16) throw new Error('IV must be 16 bytes');
    } else {
      ivBuf = crypto.getRandomValues(new Uint8Array(16));
    }
    const key = await crypto.subtle.importKey('raw', keyBuf, 'AES-CBC', false, ['encrypt']);
    const iv = toArrayBufferView(ivBuf);
    const buf = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, dataEnc);
    return { result: toBase64(buf), iv: toHex(iv.buffer) };
  }
  const iv = toArrayBufferView(crypto.getRandomValues(new Uint8Array(12)));
  const key = await crypto.subtle.importKey('raw', keyBuf, 'AES-GCM', false, ['encrypt']);
  const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, dataEnc);
  return { result: toBase64(buf), iv: toHex(iv.buffer) };
}

interface HashResult {
  alg: string;
  label: string;
  value: string;
}
interface HmacResult {
  alg: string;
  label: string;
  value: string;
}
interface AesResult {
  mode: string;
  result: string;
  iv: string;
  error?: string;
}

function crc32(str: string): string {
  let crc = 0xffffffff;
  const bytes = new TextEncoder().encode(str);
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}

function toHexStr(str: string): string {
  return Array.from(new TextEncoder().encode(str), (b) => b.toString(16).padStart(2, '0')).join(' ');
}

function base32Encode(str: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = new TextEncoder().encode(str);
  let bits = 0,
    value = 0,
    result = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += alphabet[(value >>> bits) & 31];
    }
  }
  if (bits > 0) result += alphabet[(value << (5 - bits)) & 31];
  while (result.length % 8) result += '=';
  return result;
}

function md5(str: string): string {
  function rotl(v: number, s: number) {
    return (v << s) | (v >>> (32 - s));
  }
  function toWords(s: string) {
    const l = s.length,
      w: number[] = [];
    for (let i = 0; i < l; i++) w[i >> 2] |= (s.charCodeAt(i) & 0xff) << ((i % 4) * 8);
    w[l >> 2] |= 0x80 << ((l % 4) * 8);
    w[(((l + 8) >>> 6) << 4) + 14] = l * 8;
    return w;
  }
  const K = [
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
    0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
    0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
    0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
    0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
  ];
  const S = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5,
    9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6,
    10, 15, 21, 6, 10, 15, 21,
  ];
  const w = toWords(unescape(encodeURIComponent(str)));
  let a = 0x67452301,
    b = 0xefcdab89,
    c = 0x98badcfe,
    d = 0x10325476;
  for (let i = 0; i < w.length; i += 16) {
    const aa = a,
      bb = b,
      cc = c,
      dd = d;
    for (let j = 0; j < 64; j++) {
      let f: number, g: number;
      if (j < 16) {
        f = (b & c) | (~b & d);
        g = j;
      } else if (j < 32) {
        f = (d & b) | (~d & c);
        g = (5 * j + 1) % 16;
      } else if (j < 48) {
        f = b ^ c ^ d;
        g = (3 * j + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * j) % 16;
      }
      const tmp = d;
      d = c;
      c = b;
      b = (b + rotl((a + f + K[j] + (w[i + g] | 0)) | 0, S[j])) | 0;
      a = tmp;
    }
    a = (a + aa) | 0;
    b = (b + bb) | 0;
    c = (c + cc) | 0;
    d = (d + dd) | 0;
  }
  return [a, b, c, d]
    .map((v) => {
      let s = '';
      for (let i = 0; i < 4; i++) s += ((v >> (i * 8)) & 0xff).toString(16).padStart(2, '0');
      return s;
    })
    .join('');
}

export default function StringEncrypt() {
  const { locale } = useI18n();
  const loc = getModuleLocale(locale, 'StringEncrypt');
  const mt = (k: string) => loc?.[k] ?? k;
  const [input, setInput] = useState('');
  const [hmacKey, setHmacKey] = useState('');
  const [aesKey, setAesKey] = useState('');
  const [aesIv, setAesIv] = useState('');
  const [aesMode, setAesMode] = useState<'CBC' | 'GCM'>('CBC');
  const [hashes, setHashes] = useState<HashResult[]>([]);
  const [hmacs, setHmacs] = useState<HmacResult[]>([]);
  const [aesResult, setAesResult] = useState<AesResult | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (k: string) => setCollapsed((p) => ({ ...p, [k]: !p[k] }));
  const cp = useCallback((t: string) => {
    void navigator.clipboard.writeText(t);
  }, []);

  useEffect(() => {
    if (!input) {
      setHashes([]);
      setHmacs([]);
      setAesResult(null);
      return;
    }
    const algs: { alg: string; label: string }[] = [
      { alg: 'SHA-1', label: 'SHA-1' },
      { alg: 'SHA-256', label: 'SHA-256' },
      { alg: 'SHA-384', label: 'SHA-384' },
      { alg: 'SHA-512', label: 'SHA-512' },
    ];
    void Promise.all(algs.map(async (a) => ({ alg: a.alg, label: a.label, value: await hash(a.alg, input) })))
      .then((results) => {
        setHashes([
          { alg: 'MD5', label: 'MD5', value: md5(input) },
          ...results,
          { alg: 'CRC32', label: 'CRC32', value: crc32(input) },
        ]);
      })
      .catch(() => {
        setHashes([
          { alg: 'MD5', label: 'MD5', value: md5(input) },
          { alg: 'CRC32', label: 'CRC32', value: crc32(input) },
        ]);
      });
  }, [input]);

  useEffect(() => {
    if (!input || !hmacKey) {
      setHmacs([]);
      return;
    }
    const algs = [
      { alg: 'SHA-1', label: 'HMAC-SHA1' },
      { alg: 'SHA-256', label: 'HMAC-SHA256' },
      { alg: 'SHA-384', label: 'HMAC-SHA384' },
      { alg: 'SHA-512', label: 'HMAC-SHA512' },
    ];
    void Promise.all(
      algs.map(async (a) => ({ alg: a.alg, label: a.label, value: await hmac(a.alg, hmacKey, input) })),
    )
      .then(setHmacs)
      .catch(() => setHmacs([]));
  }, [input, hmacKey]);

  useEffect(() => {
    if (!input || !aesKey) {
      setAesResult(null);
      return;
    }
    void aesEncrypt(input, aesKey, aesIv, aesMode)
      .then((r) => setAesResult({ mode: aesMode, ...r }))
      .catch((e: unknown) =>
        setAesResult({
          mode: aesMode,
          result: '',
          iv: '',
          error: e instanceof Error ? e.message : String(e),
        }),
      );
  }, [input, aesKey, aesIv, aesMode]);

  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className={styles.row}>
      <span className={styles.algName}>{label}</span>
      <span className={styles.value}>{value || '-'}</span>
      {value && (
        <button className={styles.cpBtn} onClick={() => cp(value)}>
          {mt('copy')}
        </button>
      )}
    </div>
  );
  return (
    <div className={styles.wrap}>
      <textarea
        className={styles.inputArea}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={mt('inputPlaceholder')}
        rows={3}
        spellCheck={false}
      />
      <div className={styles.results}>
        <div className={styles.section}>
          <div className={styles.sectionHead} onClick={() => toggle('hash')}>
            <span className={`${styles.sectionArrow} ${!collapsed.hash ? styles.sectionArrowOpen : ''}`}>
              ▶
            </span>
            {mt('hashTitle')}
          </div>
          {!collapsed.hash && (
            <div className={styles.sectionBody}>
              {!input ? (
                <div className={styles.empty}>{mt('inputPlaceholder')}</div>
              ) : (
                hashes.map((h) => <Row key={h.alg} label={h.label} value={h.value} />)
              )}
            </div>
          )}
        </div>
        <div className={styles.section}>
          <div className={styles.sectionHead} onClick={() => toggle('encode')}>
            <span className={`${styles.sectionArrow} ${!collapsed.encode ? styles.sectionArrowOpen : ''}`}>
              ▶
            </span>
            {mt('encodeTitle')}
          </div>
          {!collapsed.encode && (
            <div className={styles.sectionBody}>
              {!input ? (
                <div className={styles.empty}>{mt('inputPlaceholder')}</div>
              ) : (
                <>
                  <Row label="Base64" value={btoa(unescape(encodeURIComponent(input)))} />
                  <Row label="Base32" value={base32Encode(input)} />
                  <Row label="URL Encode" value={encodeURIComponent(input)} />
                  <Row label="Hex" value={toHexStr(input)} />
                  <Row
                    label="Unicode"
                    value={Array.from(input)
                      .map((c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
                      .join('')}
                  />
                  <Row
                    label="HTML Entity"
                    value={input.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`)}
                  />
                </>
              )}
            </div>
          )}
        </div>
        <div className={styles.section}>
          <div className={styles.sectionHead} onClick={() => toggle('hmac')}>
            <span className={`${styles.sectionArrow} ${!collapsed.hmac ? styles.sectionArrowOpen : ''}`}>
              ▶
            </span>
            {mt('hmacTitle')}
          </div>
          {!collapsed.hmac && (
            <div className={styles.sectionBody}>
              <div className={styles.paramRow}>
                <span className={styles.paramLabel}>{mt('hmacKey')}</span>
                <input
                  className={styles.paramInput}
                  value={hmacKey}
                  onChange={(e) => setHmacKey(e.target.value)}
                  placeholder={mt('hmacKeyPlaceholder')}
                />
              </div>
              {!input || !hmacKey ? (
                <div className={styles.empty}>{mt('hmacKeyPlaceholder')}</div>
              ) : (
                hmacs.map((h) => <Row key={h.alg} label={h.label} value={h.value} />)
              )}
            </div>
          )}
        </div>
        <div className={styles.section}>
          <div className={styles.sectionHead} onClick={() => toggle('aes')}>
            <span className={`${styles.sectionArrow} ${!collapsed.aes ? styles.sectionArrowOpen : ''}`}>
              ▶
            </span>
            {mt('aesTitle')}
          </div>
          {!collapsed.aes && (
            <div className={styles.sectionBody}>
              <div className={styles.paramRow}>
                <span className={styles.paramLabel}>{mt('aesKey')}</span>
                <input
                  className={styles.paramInput}
                  value={aesKey}
                  onChange={(e) => setAesKey(e.target.value)}
                  placeholder={mt('aesKeyPlaceholder')}
                />
                <select
                  className={styles.paramSelect}
                  value={aesMode}
                  onChange={(e) => setAesMode(e.target.value as 'CBC' | 'GCM')}
                >
                  <option value="CBC">AES-CBC</option>
                  <option value="GCM">AES-GCM</option>
                </select>
              </div>
              {aesMode === 'CBC' && (
                <div className={styles.paramRow}>
                  <span className={styles.paramLabel}>{mt('aesIv')}</span>
                  <input
                    className={styles.paramInput}
                    value={aesIv}
                    onChange={(e) => setAesIv(e.target.value)}
                    placeholder={mt('aesIvPlaceholder')}
                  />
                </div>
              )}
              {aesResult && aesResult.error && <div className={styles.err}>{aesResult.error}</div>}
              {aesResult && !aesResult.error && (
                <>
                  <Row label="Encrypted" value={aesResult.result} />
                  <Row label="IV" value={aesResult.iv} />
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
