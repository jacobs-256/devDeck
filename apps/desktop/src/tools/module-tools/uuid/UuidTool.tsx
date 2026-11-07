import { useState } from 'react';
import { useI18n } from '../../../i18n';
import { CopyButton } from '../../components';
import { generateUuids, type UuidKind } from './uuid.model';

export default function UuidTool() {
  const { t } = useI18n();
  const [kind, setKind] = useState<UuidKind>('v4');
  const [count, setCount] = useState(5);
  const [values, setValues] = useState<string[]>(() => generateUuids(5, 'v4'));

  const regenerate = (nextKind: UuidKind = kind, nextCount: number = count) => {
    setValues(generateUuids(nextCount, nextKind));
  };

  return (
    <div className="tool-body">
      <div className="field-row">
        <label className="field compact">
          <span className="field-label">{t('tool.uuid.version')}</span>
          <select
            value={kind}
            onChange={(event) => {
              const next = event.target.value as UuidKind;
              setKind(next);
              regenerate(next, count);
            }}
          >
            <option value="v4">{t('tool.uuid.v4')}</option>
            <option value="v7">{t('tool.uuid.v7')}</option>
          </select>
        </label>

        <label className="field compact">
          <span className="field-label">{t('tool.uuid.count')}</span>
          <input
            type="number"
            min={1}
            max={500}
            value={count}
            onChange={(event) => setCount(Number(event.target.value) || 1)}
          />
        </label>

        <button type="button" className="primary" onClick={() => regenerate()}>
          {t('common.generate')}
        </button>
      </div>

      <div className="field">
        <div className="field-row">
          <span className="field-label">{t('tool.uuid.countLabel', { count: values.length })}</span>
          <CopyButton value={values.join('\n')} label={t('common.copyAll')} />
        </div>
        <textarea
          className="mono result"
          rows={Math.min(16, Math.max(4, values.length + 1))}
          readOnly
          value={values.join('\n')}
        />
      </div>

      <p className="muted small">{t('tool.uuid.explanation')}</p>
    </div>
  );
}
