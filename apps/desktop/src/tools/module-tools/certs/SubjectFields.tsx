import { useI18n, type MessageKey } from '../../../i18n';
import type { SubjectInput } from './certs.api';

interface SubjectFieldsProps {
  value: SubjectInput;
  onChange: (next: SubjectInput) => void;
}

const FIELDS: Array<{ key: keyof SubjectInput; label: MessageKey; placeholder: string }> = [
  { key: 'commonName', label: 'certs.subjectCn', placeholder: 'example.com' },
  { key: 'organization', label: 'certs.subjectO', placeholder: 'Example Ltd' },
  { key: 'organizationalUnit', label: 'certs.subjectOu', placeholder: 'Engineering' },
  { key: 'country', label: 'certs.subjectC', placeholder: 'CN' },
  { key: 'state', label: 'certs.subjectSt', placeholder: 'Shanghai' },
  { key: 'locality', label: 'certs.subjectL', placeholder: 'Shanghai' },
];

export function SubjectFields({ value, onChange }: SubjectFieldsProps) {
  const { t } = useI18n();
  return (
    <div className="subject-grid">
      {FIELDS.map((field) => (
        <label className="field" key={field.key}>
          <span className="field-label">{t(field.label)}</span>
          <input
            value={value[field.key]}
            placeholder={field.placeholder}
            onChange={(event) => onChange({ ...value, [field.key]: event.target.value })}
          />
        </label>
      ))}
    </div>
  );
}
