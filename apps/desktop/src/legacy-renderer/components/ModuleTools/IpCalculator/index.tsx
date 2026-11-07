// @ts-nocheck
import { useCallback, useMemo, useState } from 'react';
import styles from './IpCalculator.module.css';
import { ToolButton, ToolInput, ToolSection } from '@@components';
import { VscClose, VscCopy } from 'react-icons/vsc';
import { useI18n, getModuleLocale } from '../../../i18n';
import {
  binaryIPv4,
  formatIPv4,
  ipClass,
  ipv4ToIPv6Mapped,
  maskFromPrefix,
  minimalCoverCidr,
  parseIPv4,
  parseIPv4WithMask,
} from './ipv4';

function CopyBtn({ value }: { value: string }) {
  return (
    <button
      type="button"
      className={styles.copyBtn}
      disabled={!value}
      onClick={() => void navigator.clipboard.writeText(value)}
      aria-label="Copy"
    >
      <VscCopy />
    </button>
  );
}

function Row({ label, value, copy }: { label: string; value: string; copy?: boolean }) {
  return (
    <div className={styles.row}>
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>{value || '-'}</div>
      {copy ? <CopyBtn value={value} /> : <span />}
    </div>
  );
}

export default function IpCalculator() {
  const { locale } = useI18n();
  const localeData = getModuleLocale(locale, 'IpCalculator');
  const t = useCallback((key: string) => localeData?.[key] ?? key, [localeData]);

  const [cidrInput, setCidrInput] = useState('192.168.0.1/24');
  const [ipInput, setIpInput] = useState('192.168.1.1');
  const [rangeStart, setRangeStart] = useState('192.168.1.1');
  const [rangeEnd, setRangeEnd] = useState('192.168.6.255');

  const subnet = useMemo(() => {
    const parsed = parseIPv4WithMask(cidrInput);
    if (!parsed) return { ok: false as const, error: t('invalid') };
    const { ip, prefix } = parsed;
    const mask = maskFromPrefix(prefix);
    const network = (ip & mask) >>> 0;
    const broadcast = (network | (~mask >>> 0)) >>> 0;
    const wildcard = (~mask >>> 0) >>> 0;
    const size = prefix === 32 ? 1 : 2 ** (32 - prefix);
    const first = prefix >= 31 ? network : (network + 1) >>> 0;
    const last = prefix >= 31 ? broadcast : (broadcast - 1) >>> 0;
    return {
      ok: true as const,
      network,
      prefix,
      mask,
      wildcard,
      size,
      first,
      last,
      broadcast,
      className: ipClass(ip),
    };
  }, [cidrInput, t]);

  const converted = useMemo(() => {
    const ip = parseIPv4(ipInput);
    if (ip === null) return { ok: false as const, error: t('invalid') };
    const dec = BigInt(ip >>> 0).toString(10);
    const hex = (ip >>> 0).toString(16).toUpperCase().padStart(8, '0');
    const bin = binaryIPv4(ip, false);
    const v6 = ipv4ToIPv6Mapped(ip);
    return {
      ok: true as const,
      dec,
      hex,
      bin,
      ipv6: v6.full,
      ipv6Short: v6.short,
    };
  }, [ipInput, t]);

  const range = useMemo(() => {
    const s = parseIPv4(rangeStart);
    const e = parseIPv4(rangeEnd);
    if (s === null || e === null) return { ok: false as const, error: t('invalid') };
    const start = s >>> 0;
    const end = e >>> 0;
    if (start > end) return { ok: false as const, error: t('invalid') };
    const oldCount = BigInt(end - start + 1);
    const cover = minimalCoverCidr(start, end);
    const newCount = BigInt(cover.prefix === 32 ? 1 : 2 ** (32 - cover.prefix));
    return {
      ok: true as const,
      oldStart: start,
      oldEnd: end,
      oldCount,
      newStart: cover.network,
      newEnd: cover.broadcast,
      newCount,
      cidr: `${formatIPv4(cover.network)}/${cover.prefix}`,
    };
  }, [rangeEnd, rangeStart, t]);

  return (
    <div className={styles.wrap}>
      <div className={styles.col}>
        <ToolSection title={t('subnetTitle')}>
          <div className={styles.block}>
            <div className={styles.hint}>{t('subnetHint')}</div>
            <div className={styles.inputRow}>
              <div className={styles.inputWrap}>
                <ToolInput
                  className={`${styles.input}`}
                  value={cidrInput}
                  onChange={(e) => setCidrInput(e.target.value)}
                  spellCheck={false}
                />
                {cidrInput ? (
                  <button type="button" className={styles.clearBtn} onClick={() => setCidrInput('')}>
                    <VscClose />
                  </button>
                ) : null}
              </div>
            </div>
            {!subnet.ok ? <div className={styles.error}>{subnet.error}</div> : null}
            {subnet.ok ? (
              <div className={styles.table}>
                <Row label={t('netmask')} value={`${formatIPv4(subnet.network)}/${subnet.prefix}`} />
                <Row label={t('networkAddress')} value={formatIPv4(subnet.network)} />
                <Row label={t('networkMask')} value={formatIPv4(subnet.mask)} />
                <Row label={t('networkMaskBinary')} value={binaryIPv4(subnet.mask, true)} />
                <Row label={t('cidrNotation')} value={`/${subnet.prefix}`} />
                <Row label={t('wildcardMask')} value={formatIPv4(subnet.wildcard)} />
                <Row label={t('networkSize')} value={String(subnet.size)} />
                <Row label={t('firstAddress')} value={formatIPv4(subnet.first)} />
                <Row label={t('lastAddress')} value={formatIPv4(subnet.last)} />
                <Row label={t('broadcastAddress')} value={formatIPv4(subnet.broadcast)} />
                <Row label={t('ipClass')} value={subnet.className} />
              </div>
            ) : null}
          </div>
        </ToolSection>
      </div>

      <div className={styles.col}>
        <ToolSection title={t('converterTitle')}>
          <div className={styles.block}>
            <div className={styles.hint}>{t('converterHint')}</div>
            <div className={styles.inputRow}>
              <div className={styles.inputWrap}>
                <ToolInput
                  className={styles.input}
                  value={ipInput}
                  onChange={(e) => setIpInput(e.target.value)}
                  spellCheck={false}
                />
                {ipInput ? (
                  <button type="button" className={styles.clearBtn} onClick={() => setIpInput('')}>
                    <VscClose />
                  </button>
                ) : null}
              </div>
            </div>
            {!converted.ok ? <div className={styles.error}>{converted.error}</div> : null}
            {converted.ok ? (
              <div className={styles.table}>
                <Row label={t('decimal')} value={converted.dec} copy />
                <Row label={t('hexadecimal')} value={converted.hex} copy />
                <Row label={t('binary')} value={converted.bin} copy />
                <Row label={t('ipv6')} value={converted.ipv6} copy />
                <Row label={t('ipv6Short')} value={converted.ipv6Short} copy />
              </div>
            ) : null}
          </div>
        </ToolSection>
      </div>

      <div className={styles.col}>
        <ToolSection title={t('rangeTitle')}>
          <div className={styles.block}>
            <div className={styles.hint}>{t('rangeHint')}</div>
            <div className={styles.inputRow}>
              <div className={styles.inputWrap}>
                <ToolInput
                  className={styles.input}
                  value={rangeStart}
                  onChange={(e) => setRangeStart(e.target.value)}
                  spellCheck={false}
                />
                {rangeStart ? (
                  <button type="button" className={styles.clearBtn} onClick={() => setRangeStart('')}>
                    <VscClose />
                  </button>
                ) : null}
              </div>
              <div className={styles.inputWrap}>
                <ToolInput
                  className={styles.input}
                  value={rangeEnd}
                  onChange={(e) => setRangeEnd(e.target.value)}
                  spellCheck={false}
                />
                {rangeEnd ? (
                  <button type="button" className={styles.clearBtn} onClick={() => setRangeEnd('')}>
                    <VscClose />
                  </button>
                ) : null}
              </div>
            </div>
            {!range.ok ? <div className={styles.error}>{range.error}</div> : null}
            {range.ok ? (
              <div className={`${styles.table} ${styles.rangeTable}`}>
                <div className={`${styles.row} ${styles.rangeHead}`}>
                  <div className={styles.label} />
                  <div className={styles.label}>{t('oldValue')}</div>
                  <div className={styles.label}>{t('newValue')}</div>
                </div>
                <div className={styles.row}>
                  <div className={styles.label}>{t('startAddress')}</div>
                  <div className={styles.rangeCell}>{formatIPv4(range.oldStart)}</div>
                  <div className={styles.rangeCell}>{formatIPv4(range.newStart)}</div>
                </div>
                <div className={styles.row}>
                  <div className={styles.label}>{t('endAddress')}</div>
                  <div className={styles.rangeCell}>{formatIPv4(range.oldEnd)}</div>
                  <div className={styles.rangeCell}>{formatIPv4(range.newEnd)}</div>
                </div>
                <div className={styles.row}>
                  <div className={styles.label}>{t('addressesInRange')}</div>
                  <div className={styles.rangeCell}>{range.oldCount.toString()}</div>
                  <div className={styles.rangeCell}>{range.newCount.toString()}</div>
                </div>
                <div className={styles.row}>
                  <div className={styles.label}>{t('cidr')}</div>
                  <div className={styles.rangeCell} />
                  <div className={styles.rangeCell}>
                    <div className={styles.cidrInline}>
                      <span>{range.cidr}</span>
                      <ToolButton onClick={() => void navigator.clipboard.writeText(range.cidr)}>
                        <VscCopy />
                        {t('copy')}
                      </ToolButton>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </ToolSection>
      </div>
    </div>
  );
}
