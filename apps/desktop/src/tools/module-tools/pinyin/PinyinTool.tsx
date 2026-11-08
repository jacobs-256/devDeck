import { useMemo, useState } from 'react';
import { useI18n } from '../../../i18n';
import { CopyButton } from '../../components';
import { toInitials, toPinyin, type ToneStyle } from './pinyin.model';

export default function PinyinTool() {
  const { t } = useI18n();
  const [input, setInput] = useState('你好，欢迎使用 DevDeck');
  const [tone, setTone] = useState<ToneStyle>('symbol');
  const [separator, setSeparator] = useState(' ');

  const converted = useMemo(() => toPinyin(input, tone, separator), [input, tone, separator]);
  const initials = useMemo(() => toInitials(input), [input]);

  return (
    <div className="tool-body">
      <label className="field">
        <span className="field-label">{t('tool.pinyin.label')}</span>
        <textarea
          rows={5}
          value={input}
          spellCheck={false}
          onChange={(event) => setInput(event.target.value)}
        />
      </label>

      <div className="field-row">
        <label className="field compact">
          <span className="field-label">{t('tool.pinyin.tone')}</span>
          <select value={tone} onChange={(event) => setTone(event.target.value as ToneStyle)}>
            <option value="symbol">{t('tool.pinyin.marks')}</option>
            <option value="num">{t('tool.pinyin.numbers')}</option>
            <option value="none">{t('tool.pinyin.none')}</option>
          </select>
        </label>
        <label className="field compact">
          <span className="field-label">{t('tool.pinyin.separator')}</span>
          <input value={separator} maxLength={3} onChange={(event) => setSeparator(event.target.value)} />
        </label>
      </div>

      <div className="field">
        <div className="field-row">
          <span className="field-label">{t('tool.pinyin.pinyin')}</span>
          <CopyButton value={converted} />
        </div>
        <pre className="result mono">{converted || '—'}</pre>
      </div>

      <div className="field">
        <div className="field-row">
          <span className="field-label">{t('tool.pinyin.initials')}</span>
          <CopyButton value={initials} />
        </div>
        <pre className="result mono">{initials || '—'}</pre>
      </div>

      <p className="muted small">{t('tool.pinyin.note')}</p>
    </div>
  );
}
