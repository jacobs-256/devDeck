// @ts-nocheck
import { useState } from 'react';
import { useEscapeClose } from '../../../../ui/useEscapeClose';
import type { MqttConfig, MqttGroup } from '../mqttTypes';
import { getDefaultMqttConfig } from '../mqttTypes';
import styles from './MqttConfigDialog.module.css';
import { VscChevronRight, VscChromeClose, VscFolder } from 'react-icons/vsc';
import { openFileBase64 } from '../sdk';
import { t } from './i18n';

interface Props {
  config?: MqttConfig;
  groups?: MqttGroup[];
  onSave: (config: MqttConfig) => void;
  onClose: () => void;
}

export default function MqttConfigDialog({ config, groups = [], onSave, onClose }: Props) {
  useEscapeClose(onClose);
  const [form, setForm] = useState<MqttConfig>(config ?? getDefaultMqttConfig());
  const [error, setError] = useState('');
  const [openSections, setOpenSections] = useState({
    basic: true,
    certs: false,
    advanced: false,
    lastWill: false,
  });

  const set = <K extends keyof MqttConfig>(key: K, val: MqttConfig[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));
  const toggleSection = (s: keyof typeof openSections) =>
    setOpenSections((prev) => ({ ...prev, [s]: !prev[s] }));

  const handleSave = () => {
    if (!form.name.trim()) {
      setError(t('nameRequired'));
      return;
    }
    if (!form.host.trim()) {
      setError(t('hostRequired'));
      return;
    }
    onSave(form);
  };

  const regenClientId = () => set('clientId', `devdeck_${Math.random().toString(16).slice(2, 10)}`);

  const handleFileSelect = async (field: 'caFile' | 'clientCert' | 'clientKey') => {
    const it = await openFileBase64([
      { name: 'Certificates', extensions: ['pem', 'crt', 'key', 'cer', 'ca', '*'] },
    ]);
    if (!it) return;
    if (field === 'caFile') set('caFile', it.name);
    if (field === 'clientCert') set('clientCert', it.name);
    if (field === 'clientKey') set('clientKey', it.name);
    try {
      if (field === 'caFile') set('caDataB64', it.contentB64);
      if (field === 'clientCert') set('clientCertDataB64', it.contentB64);
      if (field === 'clientKey') set('clientKeyDataB64', it.contentB64);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleCertTypeChange = (val: MqttConfig['certType']) => {
    set('certType', val);
    if (val === 'self-signed') setOpenSections((prev) => ({ ...prev, certs: true }));
  };

  const isEdit = !!config;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="MQTT connection"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <span>{isEdit ? t('editClient') : t('addClient')}</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <VscChromeClose />
          </button>
        </div>
        <div className={styles.body}>
          <div className={styles.section}>
            <div className={styles.sectionHeader} onClick={() => toggleSection('basic')}>
              <span className={`${styles.sectionArrow} ${openSections.basic ? styles.sectionArrowOpen : ''}`}>
                <VscChevronRight />
              </span>
              {t('sectionBasic')}
            </div>
            {openSections.basic && (
              <div className={styles.sectionBody}>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label className={styles.label}>
                      <span className={styles.required}>*</span> {t('name')}
                    </label>
                    <input
                      className={styles.input}
                      value={form.name}
                      placeholder={t('namePlaceholder')}
                      onChange={(e) => set('name', e.target.value)}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>{t('group')}</label>
                    <select
                      className={styles.select}
                      value={form.groupId ?? ''}
                      onChange={(e) => set('groupId', e.target.value || undefined)}
                    >
                      <option value="">{t('noGroup')}</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className={styles.row}>
                  <div className={styles.field} style={{ flex: 'none' }}>
                    <label className={styles.label}>
                      <span className={styles.required}>*</span> {t('serverAddr')}
                    </label>
                    <div className={styles.row}>
                      <select
                        className={styles.select}
                        value={form.protocol}
                        onChange={(e) => set('protocol', e.target.value as MqttConfig['protocol'])}
                        style={{ width: 120, flex: 'none' }}
                      >
                        <option value="mqtts://">mqtts://</option>
                        <option value="mqtt://">mqtt://</option>
                        <option value="wss://">wss://</option>
                        <option value="ws://">ws://</option>
                      </select>
                      <input
                        className={styles.input}
                        value={form.host}
                        onChange={(e) => set('host', e.target.value)}
                      />
                      <input
                        className={styles.input}
                        type="number"
                        value={form.port}
                        onChange={(e) => set('port', Number(e.target.value))}
                        style={{ width: 80, flex: 'none' }}
                      />
                      {(form.protocol === 'ws://' || form.protocol === 'wss://') && (
                        <input
                          className={styles.input}
                          value={form.path}
                          onChange={(e) => set('path', e.target.value)}
                          placeholder="/mqtt"
                          style={{ width: 120, flex: 'none' }}
                        />
                      )}
                    </div>
                  </div>
                </div>

                <div className={styles.row}>
                  <div className={styles.field}>
                    <label className={styles.label}>{t('clientId')}</label>
                    <div className={styles.row}>
                      <input
                        className={styles.input}
                        value={form.clientId}
                        onChange={(e) => set('clientId', e.target.value)}
                      />
                      <button
                        className={styles.regenBtn}
                        onClick={regenClientId}
                        type="button"
                        title={t('clientIdRegen')}
                      >
                        ↻
                      </button>
                    </div>
                  </div>
                </div>

                <div className={styles.row}>
                  <div className={styles.field}>
                    <label className={styles.label}>{t('username')}</label>
                    <input
                      className={styles.input}
                      value={form.username}
                      onChange={(e) => set('username', e.target.value)}
                    />
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>{t('password')}</label>
                    <input
                      className={styles.input}
                      type="password"
                      value={form.password}
                      onChange={(e) => set('password', e.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.row}>
                  <div className={styles.field}>
                    <div className={styles.switchRow}>
                      <label className={styles.label}>{t('sslTls')}</label>
                      <label className={styles.switch}>
                        <input
                          type="checkbox"
                          checked={form.sslEnabled}
                          onChange={(e) => set('sslEnabled', e.target.checked)}
                        />
                        <span className={styles.slider} />
                      </label>
                    </div>
                  </div>
                  <div className={styles.field}>
                    <div className={styles.switchRow}>
                      <label className={styles.label}>{t('sslSecure')}</label>
                      <label className={styles.switch}>
                        <input
                          type="checkbox"
                          checked={form.sslSecure}
                          onChange={(e) => set('sslSecure', e.target.checked)}
                        />
                        <span className={styles.slider} />
                      </label>
                    </div>
                  </div>
                </div>

                <div className={styles.row}>
                  <div className={styles.field}>
                    <label className={styles.label}>{t('alpn')}</label>
                    <input
                      className={styles.input}
                      value={form.alpn}
                      onChange={(e) => set('alpn', e.target.value)}
                    />
                  </div>
                </div>

                <div className={styles.row}>
                  <div className={styles.field}>
                    <label className={styles.label}>{t('certType')}</label>
                    <div className={styles.radioGroup}>
                      <label className={styles.radioLabel}>
                        <input
                          type="radio"
                          checked={form.certType === 'ca-signed'}
                          onChange={() => handleCertTypeChange('ca-signed')}
                        />
                        {t('certCaSigned')}
                      </label>
                      <label className={styles.radioLabel}>
                        <input
                          type="radio"
                          checked={form.certType === 'self-signed'}
                          onChange={() => handleCertTypeChange('self-signed')}
                        />
                        {t('certSelfSigned')}
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader} onClick={() => toggleSection('certs')}>
              <span className={`${styles.sectionArrow} ${openSections.certs ? styles.sectionArrowOpen : ''}`}>
                <VscChevronRight />
              </span>
              {t('sectionCerts')}
            </div>
            {openSections.certs && (
              <div className={styles.sectionBody}>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label className={styles.label}>{t('caFile')}</label>
                    <div className={styles.fileInputWrap}>
                      <input className={styles.fileInput} value={form.caFile} readOnly />
                      <button
                        className={styles.fileIconBtn}
                        onClick={() => void handleFileSelect('caFile')}
                        type="button"
                        title={t('selectFile')}
                        aria-label={t('selectFile')}
                      >
                        <VscFolder />
                      </button>
                    </div>
                  </div>
                </div>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label className={styles.label}>{t('clientCert')}</label>
                    <div className={styles.fileInputWrap}>
                      <input className={styles.fileInput} value={form.clientCert} readOnly />
                      <button
                        className={styles.fileIconBtn}
                        onClick={() => void handleFileSelect('clientCert')}
                        type="button"
                        title={t('selectFile')}
                        aria-label={t('selectFile')}
                      >
                        <VscFolder />
                      </button>
                    </div>
                  </div>
                </div>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label className={styles.label}>{t('clientKey')}</label>
                    <div className={styles.fileInputWrap}>
                      <input className={styles.fileInput} value={form.clientKey} readOnly />
                      <button
                        className={styles.fileIconBtn}
                        onClick={() => void handleFileSelect('clientKey')}
                        type="button"
                        title={t('selectFile')}
                        aria-label={t('selectFile')}
                      >
                        <VscFolder />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader} onClick={() => toggleSection('advanced')}>
              <span
                className={`${styles.sectionArrow} ${openSections.advanced ? styles.sectionArrowOpen : ''}`}
              >
                <VscChevronRight />
              </span>
              {t('sectionAdvanced')}
            </div>
            {openSections.advanced && (
              <div className={styles.sectionBody}>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label className={styles.label}>{t('mqttVersion')}</label>
                    <select
                      className={styles.select}
                      value={form.mqttVersion}
                      onChange={(e) => set('mqttVersion', e.target.value as MqttConfig['mqttVersion'])}
                    >
                      <option value="5.0">5.0</option>
                      <option value="3.1.1">3.1.1</option>
                      <option value="3.1">3.1</option>
                    </select>
                  </div>
                </div>

                <div className={styles.row}>
                  <div className={styles.field}>
                    <label className={styles.label}>{t('connectTimeout')}</label>
                    <div className={styles.row}>
                      <input
                        className={styles.input}
                        type="number"
                        value={form.connectTimeout}
                        onChange={(e) => set('connectTimeout', Number(e.target.value))}
                      />
                      <span className={styles.suffix}>{t('seconds')}</span>
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>{t('keepAlive')}</label>
                    <div className={styles.row}>
                      <input
                        className={styles.input}
                        type="number"
                        value={form.keepAlive}
                        onChange={(e) => set('keepAlive', Number(e.target.value))}
                      />
                      <span className={styles.suffix}>{t('seconds')}</span>
                    </div>
                  </div>
                </div>

                <div className={styles.row}>
                  <div className={styles.field}>
                    <div className={styles.switchRow}>
                      <label className={styles.label}>{t('autoReconnect')}</label>
                      <label className={styles.switch}>
                        <input
                          type="checkbox"
                          checked={form.autoReconnect}
                          onChange={(e) => set('autoReconnect', e.target.checked)}
                        />
                        <span className={styles.slider} />
                      </label>
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>{t('reconnectPeriod')}</label>
                    <div className={styles.row}>
                      <input
                        className={styles.input}
                        type="number"
                        value={form.reconnectPeriod}
                        onChange={(e) => set('reconnectPeriod', Number(e.target.value))}
                      />
                      <span className={styles.suffix}>{t('milliseconds')}</span>
                    </div>
                  </div>
                </div>

                <div className={styles.row}>
                  <div className={styles.field}>
                    <div className={styles.switchRow}>
                      <label className={styles.label}>{t('cleanStart')}</label>
                      <label className={styles.switch}>
                        <input
                          type="checkbox"
                          checked={form.cleanStart}
                          onChange={(e) => set('cleanStart', e.target.checked)}
                        />
                        <span className={styles.slider} />
                      </label>
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label}>{t('sessionExpiry')}</label>
                    <div className={styles.row}>
                      <input
                        className={styles.input}
                        type="number"
                        value={form.sessionExpiry}
                        onChange={(e) => set('sessionExpiry', Number(e.target.value))}
                      />
                      <span className={styles.suffix}>{t('seconds')}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader} onClick={() => toggleSection('lastWill')}>
              <span
                className={`${styles.sectionArrow} ${openSections.lastWill ? styles.sectionArrowOpen : ''}`}
              >
                <VscChevronRight />
              </span>
              {t('sectionLastWill')}
            </div>
            {openSections.lastWill && (
              <div className={styles.sectionBody}>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label className={styles.label}>{t('lastWillTopic')}</label>
                    <input
                      className={styles.input}
                      value={form.lastWillTopic}
                      onChange={(e) => set('lastWillTopic', e.target.value)}
                    />
                  </div>
                </div>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label className={styles.label}>{t('lastWillQos')}</label>
                    <select
                      className={styles.select}
                      value={form.lastWillQos}
                      onChange={(e) => set('lastWillQos', Number(e.target.value) as 0 | 1 | 2)}
                    >
                      <option value={0}>QoS 0</option>
                      <option value={1}>QoS 1</option>
                      <option value={2}>QoS 2</option>
                    </select>
                  </div>
                  <div className={styles.field}>
                    <div className={styles.switchRow}>
                      <label className={styles.label}>{t('lastWillRetain')}</label>
                      <label className={styles.switch}>
                        <input
                          type="checkbox"
                          checked={form.lastWillRetain}
                          onChange={(e) => set('lastWillRetain', e.target.checked)}
                        />
                        <span className={styles.slider} />
                      </label>
                    </div>
                  </div>
                </div>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label className={styles.label}>{t('lastWillMessage')}</label>
                    <textarea
                      className={styles.textarea}
                      value={form.lastWillMessage}
                      onChange={(e) => set('lastWillMessage', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {error && <div className={styles.error}>{error}</div>}
        </div>
        <div className={styles.footer}>
          <button className={styles.btn} onClick={onClose}>
            {t('cancel')}
          </button>
          <button className={styles.btnPrimary} onClick={handleSave}>
            {t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}
