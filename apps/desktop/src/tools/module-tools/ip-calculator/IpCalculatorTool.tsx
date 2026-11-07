import { useMemo, useState } from 'react';
import { useI18n } from '../../../i18n';
import { CopyButton } from '../../components';
import { analyzeIPv4 } from './ipv4.model';

export default function IpCalculatorTool() {
  const { t } = useI18n();
  const [input, setInput] = useState('192.168.1.10/24');
  const result = useMemo(() => analyzeIPv4(input), [input]);

  return (
    <div className="tool-body">
      <label className="field">
        <span className="field-label">{t('tool.ip-calculator.label')}</span>
        <input
          className="mono"
          value={input}
          spellCheck={false}
          placeholder={t('tool.ip-calculator.placeholder')}
          onChange={(event) => setInput(event.target.value)}
        />
      </label>

      {!result.ok ? (
        <p className="error-text">{result.error}</p>
      ) : (
        <>
          <dl className="kv">
            <dt>{t('tool.ip-calculator.network')}</dt>
            <dd className="mono">
              {result.value.network}/{result.value.prefix}
            </dd>
            <dt>{t('tool.ip-calculator.netmask')}</dt>
            <dd className="mono">{result.value.netmask}</dd>
            <dt>{t('tool.ip-calculator.wildcard')}</dt>
            <dd className="mono">{result.value.wildcard}</dd>
            <dt>{t('tool.ip-calculator.broadcast')}</dt>
            <dd className="mono">{result.value.broadcast}</dd>
            <dt>{t('tool.ip-calculator.hostRange')}</dt>
            <dd className="mono">
              {result.value.firstHost} – {result.value.lastHost}
            </dd>
            <dt>{t('tool.ip-calculator.usableHosts')}</dt>
            <dd>{result.value.usableHosts.toLocaleString()}</dd>
            <dt>{t('tool.ip-calculator.totalAddresses')}</dt>
            <dd>{result.value.totalAddresses.toLocaleString()}</dd>
            <dt>{t('tool.ip-calculator.class')}</dt>
            <dd>{result.value.classLabel}</dd>
            <dt>{t('tool.ip-calculator.ipv6Mapped')}</dt>
            <dd className="mono">{result.value.ipv6Mapped}</dd>
          </dl>

          <div className="field">
            <div className="field-row">
              <span className="field-label">{t('tool.ip-calculator.binary')}</span>
              <CopyButton value={result.value.binary} />
            </div>
            <pre className="result mono">{result.value.binary}</pre>
          </div>
        </>
      )}
    </div>
  );
}
