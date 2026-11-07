import { useEffect, useMemo, useRef, useState } from 'react';
import { sdk } from './sdk';

type Row = { k: string; v: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function toText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return JSON.stringify(v);
}

type ProviderId = 'auto' | 'ip2location' | 'ipinfo' | 'ipapi';

type IpLookupKeys = {
  ip2location?: string;
  ipinfo?: string;
  ipapi?: string;
};

type UnifiedResult = {
  provider: Exclude<ProviderId, 'auto'>;
  fetchedAt: string;
  ip?: string;
  countryCode?: string;
  countryName?: string;
  regionName?: string;
  cityName?: string;
  zipCode?: string;
  latitude?: number;
  longitude?: number;
  timeZone?: string;
  asn?: string;
  asName?: string;
  isp?: string;
  org?: string;
  domain?: string;
  usageType?: string;
  addressType?: string;
  isProxy?: boolean;
  fraudScore?: number;
  raw: unknown;
};

type Ip2LocationIoError = { error_code?: number | string; error_message?: string };
type Ip2LocationIoResponse = {
  ip?: string;
  country_code?: string;
  country_name?: string;
  region_name?: string;
  city_name?: string;
  latitude?: number;
  longitude?: number;
  zip_code?: string;
  time_zone?: string;
  asn?: string;
  as?: string;
  isp?: string;
  domain?: string;
  usage_type?: string;
  address_type?: string;
  is_proxy?: boolean;
  fraud_score?: number;
  error?: Ip2LocationIoError;
};

type IpInfoResponse = {
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
  postal?: string;
  loc?: string;
  org?: string;
  timezone?: string;
  hostname?: string;
  anycast?: boolean;
  bogon?: boolean;
  error?: { title?: string; message?: string };
};

type IpApiResponse = {
  ip?: string;
  city?: string;
  region?: string;
  region_code?: string;
  country_name?: string;
  country_code?: string;
  postal?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  utc_offset?: string;
  org?: string;
  asn?: string;
  network?: string;
  error?: boolean;
  reason?: string;
};

const providerLabel: Record<ProviderId, string> = {
  auto: 'Auto',
  ip2location: 'IP2Location.io',
  ipinfo: 'ipinfo.io',
  ipapi: 'ipapi.co',
};

function normalizeIpInput(v: string): string {
  return v.trim();
}

function buildRows(data: UnifiedResult | null): Row[] {
  if (!data) return [];
  const rows: Row[] = [];

  const push = (k: string, v: unknown) => {
    const t = toText(v);
    if (!t) return;
    rows.push({ k, v: t });
  };

  push('Source', providerLabel[data.provider]);
  push('IP', data.ip);
  push('Country', data.countryName);
  push('Country code', data.countryCode);
  push('Region', data.regionName);
  push('City', data.cityName);
  push('ZIP', data.zipCode);
  push('Latitude', data.latitude);
  push('Longitude', data.longitude);
  push('Time zone', data.timeZone);
  push('ASN', data.asn);
  push('AS', data.asName);
  push('ISP', data.isp);
  push('Org', data.org);
  push('Domain', data.domain);
  push('Usage type', data.usageType);
  push('Address type', data.addressType);
  push('Is proxy', data.isProxy);
  push('Fraud score', data.fraudScore);

  return rows;
}

async function requestJson<T = unknown>(url: string): Promise<{ status: number; data: T }> {
  const res = await sdk.http.request<T>({ url, responseType: 'json', timeoutMs: 20000 });
  if (!res.ok) throw new Error(res.error.message);
  const status = res.data?.status ?? 0;
  const data = res.data?.data;
  if (data === undefined) throw new Error('Empty response');
  return { status, data };
}

async function queryIp2Location(ip: string, apiKey: string): Promise<UnifiedResult> {
  const u = new URL('https://api.ip2location.io/');
  u.searchParams.set('format', 'json');
  if (ip) u.searchParams.set('ip', ip);
  if (apiKey.trim()) u.searchParams.set('key', apiKey.trim());

  const { status, data } = await requestJson<Ip2LocationIoResponse>(u.toString());
  if (!data || typeof data !== 'object') throw new Error('Invalid response');
  if (data.error) {
    const code = toText(data.error.error_code);
    const msg = data.error.error_message || 'Lookup failed';
    throw new Error(status ? `${msg} (HTTP ${status}${code ? `, ${code}` : ''})` : code ? `${msg} (${code})` : msg);
  }

  return {
    provider: 'ip2location',
    fetchedAt: new Date().toISOString(),
    ip: data.ip,
    countryCode: data.country_code,
    countryName: data.country_name,
    regionName: data.region_name,
    cityName: data.city_name,
    zipCode: data.zip_code,
    latitude: data.latitude,
    longitude: data.longitude,
    timeZone: data.time_zone,
    asn: data.asn,
    asName: data.as,
    isp: data.isp,
    domain: data.domain,
    usageType: data.usage_type,
    addressType: data.address_type,
    isProxy: data.is_proxy,
    fraudScore: data.fraud_score,
    raw: data,
  };
}

async function queryIpInfo(ip: string, token: string): Promise<UnifiedResult> {
  const u = new URL(ip ? `https://ipinfo.io/${encodeURIComponent(ip)}/json` : 'https://ipinfo.io/json');
  if (token.trim()) u.searchParams.set('token', token.trim());

  const { status, data } = await requestJson<IpInfoResponse>(u.toString());
  if (!data || typeof data !== 'object') throw new Error('Invalid response');
  if (data.error) throw new Error(data.error.message || data.error.title || `Lookup failed (HTTP ${status})`);

  const loc = String(data.loc || '').split(',');
  const lat = loc.length === 2 ? Number(loc[0]) : NaN;
  const lng = loc.length === 2 ? Number(loc[1]) : NaN;

  return {
    provider: 'ipinfo',
    fetchedAt: new Date().toISOString(),
    ip: data.ip,
    countryCode: data.country,
    countryName: undefined,
    regionName: data.region,
    cityName: data.city,
    zipCode: data.postal,
    latitude: Number.isFinite(lat) ? lat : undefined,
    longitude: Number.isFinite(lng) ? lng : undefined,
    timeZone: data.timezone,
    org: data.org,
    domain: data.hostname,
    raw: data,
  };
}

async function queryIpApi(ip: string): Promise<UnifiedResult> {
  const url = ip ? `https://ipapi.co/${encodeURIComponent(ip)}/json/` : 'https://ipapi.co/json/';
  const { status, data } = await requestJson<IpApiResponse>(url);
  if (!data || typeof data !== 'object') throw new Error('Invalid response');
  if (data.error) throw new Error(data.reason || `Lookup failed (HTTP ${status})`);

  return {
    provider: 'ipapi',
    fetchedAt: new Date().toISOString(),
    ip: data.ip,
    countryCode: data.country_code,
    countryName: data.country_name,
    regionName: data.region,
    cityName: data.city,
    zipCode: data.postal,
    latitude: data.latitude,
    longitude: data.longitude,
    timeZone: data.timezone,
    asn: data.asn,
    org: data.org,
    raw: data,
  };
}

function isRetryableMessage(msg: string): boolean {
  const t = msg.toLowerCase();
  return (
    t.includes('rate') ||
    t.includes('limit') ||
    t.includes('too many') ||
    t.includes('quota') ||
    t.includes('temporarily') ||
    t.includes('timeout') ||
    t.includes('network')
  );
}

async function getCache(ip: string): Promise<UnifiedResult | null> {
  const k = `ip.lookup.cache.${ip || 'me'}`;
  const res = await sdk.storage.get(k);
  if (!res.ok) return null;
  const v = res.data?.value;
  if (!isRecord(v)) return null;
  const fetchedAt = typeof v.fetchedAt === 'string' ? v.fetchedAt : '';
  if (!fetchedAt) return null;
  const ts = Date.parse(fetchedAt);
  if (!Number.isFinite(ts)) return null;
  if (Date.now() - ts > 24 * 60 * 60 * 1000) return null;
  return v as unknown as UnifiedResult;
}

async function setCache(ip: string, value: UnifiedResult): Promise<void> {
  const k = `ip.lookup.cache.${ip || 'me'}`;
  await sdk.storage.set(k, value);
}

export default function App() {
  const [mode, setMode] = useState<ProviderId>('auto');
  const [keys, setKeys] = useState<IpLookupKeys>({});
  const [ip, setIp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<UnifiedResult | null>(null);
  const [lastUpdated, setLastUpdated] = useState('');
  const saveTimerRef = useRef<number | null>(null);

  const rows = useMemo(() => buildRows(result), [result]);

  useEffect(() => {
    void (async () => {
      const res = await sdk.storage.get('ip.lookup.settings');
      if (!res.ok) return;
      const v = res.data?.value;
      if (!isRecord(v)) return;
      const m = v.mode;
      const k = v.keys;
      if (m === 'auto' || m === 'ip2location' || m === 'ipinfo' || m === 'ipapi') setMode(m);
      if (isRecord(k)) {
        setKeys({
          ip2location: typeof k.ip2location === 'string' ? k.ip2location : '',
          ipinfo: typeof k.ipinfo === 'string' ? k.ipinfo : '',
          ipapi: typeof k.ipapi === 'string' ? k.ipapi : '',
        });
      }
    })();
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void sdk.storage.set('ip.lookup.settings', {
        mode,
        keys: {
          ip2location: String(keys.ip2location || '').trim(),
          ipinfo: String(keys.ipinfo || '').trim(),
          ipapi: String(keys.ipapi || '').trim(),
        },
      });
    }, 250);
  }, [mode, keys]);

  const lookup = async (targetIp: string) => {
    setError('');
    setLoading(true);
    try {
      const q = normalizeIpInput(targetIp);
      const cached = await getCache(q);
      if (cached) {
        setResult(cached);
        setLastUpdated(cached.fetchedAt);
        setLoading(false);
        return;
      }

      const tried: { provider: ProviderId; error: string }[] = [];
      const tryProvider = async (p: Exclude<ProviderId, 'auto'>): Promise<UnifiedResult> => {
        if (p === 'ip2location') return queryIp2Location(q, String(keys.ip2location || ''));
        if (p === 'ipinfo') return queryIpInfo(q, String(keys.ipinfo || ''));
        return queryIpApi(q);
      };

      const order: Exclude<ProviderId, 'auto'>[] = mode === 'auto' ? ['ip2location', 'ipinfo', 'ipapi'] : [mode];
      let out: UnifiedResult | null = null;

      for (const p of order) {
        try {
          out = await tryProvider(p);
          break;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          tried.push({ provider: p, error: msg });
          if (mode !== 'auto') break;
          if (!isRetryableMessage(msg)) break;
        }
      }

      if (!out) {
        const summary = tried.map((t) => `${providerLabel[t.provider]}: ${t.error}`).join(' | ');
        throw new Error(summary || 'Lookup failed');
      }

      setResult(out);
      setLastUpdated(out.fetchedAt);
      const cacheKey = out.ip || q;
      if (cacheKey) await setCache(cacheKey, out);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setResult(null);
      void sdk.log.error('IP lookup failed', { ip: targetIp, message: msg });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <div className="top">
        <div>
          <div className="title">IP Lookup</div>
          <div className="sub">
            Source: {providerLabel[result?.provider ?? mode]}{lastUpdated ? ` · updated: ${lastUpdated}` : ''}
          </div>
        </div>
        <div className="actions">
          <button disabled={loading} onClick={() => void lookup(ip)}>
            {loading ? 'Looking up…' : 'Lookup'}
          </button>
          <button disabled={loading} onClick={() => void lookup('')}>
            My IP
          </button>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="grid">
        <div className="card">
          <div className="cardTitle">Query</div>

          <div className="formRow">
            <div className="label">Mode</div>
            <select value={mode} onChange={(e) => setMode(e.target.value as ProviderId)}>
              <option value="auto">{providerLabel.auto}</option>
              <option value="ip2location">{providerLabel.ip2location}</option>
              <option value="ipinfo">{providerLabel.ipinfo}</option>
              <option value="ipapi">{providerLabel.ipapi}</option>
            </select>
          </div>

          <div className="formRow">
            <div className="label">IP2Location key</div>
            <input
              value={String(keys.ip2location || '')}
              onChange={(e) => setKeys((k) => ({ ...k, ip2location: e.target.value }))}
              placeholder="Optional (stored locally)"
            />
          </div>

          <div className="formRow">
            <div className="label">ipinfo token</div>
            <input
              value={String(keys.ipinfo || '')}
              onChange={(e) => setKeys((k) => ({ ...k, ipinfo: e.target.value }))}
              placeholder="Optional (stored locally)"
            />
          </div>

          <div className="formRow">
            <div className="label">IP</div>
            <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="e.g. 8.8.8.8 / 2001:4860:4860::8888" />
          </div>

          <div className="foot">
            <div className="hint">Tips:</div>
            <div className="hint">- Leave empty and click “My IP” to query current public IP</div>
            <div className="hint">- Supports IPv4 / IPv6</div>
            <div className="hint">- Auto mode will fallback when rate-limited</div>
            <div className="hint">- Results are cached for 24h per IP (local only)</div>
          </div>
        </div>

        <div className="card">
          <div className="cardTitle">Result</div>
          {rows.length === 0 ? (
            <div className="empty">No data</div>
          ) : (
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.k}>
                      <td className="k">{r.k}</td>
                      <td className={`v ${r.k === 'IP' ? 'mono' : ''}`}>{r.v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result ? <pre className="raw">{JSON.stringify(result.raw, null, 2)}</pre> : null}
          <div className="foot">
            Notes: This tool uses a third-party public API. For compliance or high accuracy requirements, verify with your own data source.
          </div>
        </div>
      </div>
    </div>
  );
}
