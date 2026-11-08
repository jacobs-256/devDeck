// @ts-nocheck
import { useState } from 'react';
import styles from './WebSocketTester.module.css';
import { useI18n } from '../../../i18n';
import ClientPanel from './ClientPanel';
import ServerPanel from './ServerPanel';

type ViewMode = 'both' | 'server' | 'client';

const MODES: Array<{ id: ViewMode; label: string; zh: string }> = [
  { id: 'both', label: 'Both', zh: '双端' },
  { id: 'server', label: 'Server', zh: '服务端' },
  { id: 'client', label: 'Client', zh: '客户端' },
];

function initialMode(): ViewMode {
  if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1300px)').matches) {
    return 'server';
  }
  return 'both';
}

export default function WebSocketTester() {
  const { locale } = useI18n();
  const tr = (en: string, zh: string) => (locale === 'zh-CN' ? zh : en);
  const [view, setView] = useState<ViewMode>(initialMode);

  const hint =
    view === 'both'
      ? tr('Server and client side by side', '服务端与客户端并排显示')
      : view === 'server'
        ? tr('Accept incoming WebSocket connections', '接受传入的 WebSocket 连接')
        : tr('Connect to a WebSocket endpoint', '连接到 WebSocket 端点');

  return (
    <div className={styles.container}>
      <div className={styles.workspaceBar}>
        <div
          className={styles.modeTabs}
          role="tablist"
          aria-label={tr('WebSocket workspace view', 'WebSocket 工作区视图')}
        >
          {MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              role="tab"
              aria-selected={view === mode.id}
              className={`${styles.modeTab}${view === mode.id ? ` ${styles.modeTabActive}` : ''}`}
              onClick={() => setView(mode.id)}
            >
              {locale === 'zh-CN' ? mode.zh : mode.label}
            </button>
          ))}
        </div>
        <span className={styles.workspaceHint}>{hint}</span>
      </div>

      <div className={styles.split} data-view={view}>
        <div className={`${styles.pane}${view === 'client' ? ` ${styles.paneHidden}` : ''}`}>
          <div className={styles.paneHeader}>
            <div className={styles.paneTitle}>{tr('Server', '服务端')}</div>
            <span className={styles.paneRole}>{tr('Inbound', '入站')}</span>
          </div>
          <div className={styles.paneBody}>
            <ServerPanel />
          </div>
        </div>

        <div className={`${styles.pane}${view === 'server' ? ` ${styles.paneHidden}` : ''}`}>
          <div className={styles.paneHeader}>
            <div className={styles.paneTitle}>{tr('Client', '客户端')}</div>
            <span className={styles.paneRole}>{tr('Outbound', '出站')}</span>
          </div>
          <div className={styles.paneBody}>
            <ClientPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
