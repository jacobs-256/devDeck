// @ts-nocheck
import { useMemo, useState } from 'react';
import styles from './WebSocketTester.module.css';
import ClientPanel from './ClientPanel';
import ServerPanel from './ServerPanel';
import { VscChevronLeft, VscChevronRight, VscChromeRestore } from 'react-icons/vsc';

type CollapsedSide = 'none' | 'client' | 'server';

export default function WebSocketTester() {
  const [collapsed, setCollapsed] = useState<CollapsedSide>('none');

  const showClient = collapsed !== 'client';
  const showServer = collapsed !== 'server';

  const toggleClient = () => {
    setCollapsed((cur) => {
      if (cur === 'client') return 'none';
      return 'client';
    });
  };

  const toggleServer = () => {
    setCollapsed((cur) => {
      if (cur === 'server') return 'none';
      return 'server';
    });
  };

  const layoutHint = useMemo(() => {
    if (collapsed === 'client') return 'Client collapsed';
    if (collapsed === 'server') return 'Server collapsed';
    return 'Side-by-side';
  }, [collapsed]);

  return (
    <div className={styles.container}>
      <div className={styles.split}>
        <div className={`${styles.pane} ${styles.paneLeft} ${showServer ? '' : styles.paneCollapsed}`}>
          <div className={styles.paneHeader}>
            <div className={styles.paneTitle}>Server</div>
            <button
              className={styles.paneBtn}
              onClick={toggleServer}
              type="button"
              aria-label={showServer ? 'Collapse server' : 'Expand server'}
              title={showServer ? 'Collapse' : 'Expand'}
            >
              {showServer ? <VscChevronLeft /> : <VscChevronRight />}
            </button>
          </div>
          <div className={styles.paneBody}>
            <ServerPanel />
          </div>
        </div>

        {collapsed === 'none' ? <div className={styles.divider} /> : null}

        <div className={`${styles.pane} ${styles.paneRight} ${showClient ? '' : styles.paneCollapsed}`}>
          <div className={styles.paneHeader}>
            <div className={styles.paneTitle}>Client</div>
            <button
              className={styles.paneBtn}
              onClick={toggleClient}
              type="button"
              aria-label={showClient ? 'Collapse client' : 'Expand client'}
              title={showClient ? 'Collapse' : 'Expand'}
            >
              {showClient ? <VscChevronRight /> : <VscChevronLeft />}
            </button>
          </div>
          <div className={styles.paneBody}>
            <ClientPanel />
          </div>
        </div>
      </div>

      <div className={styles.footerBar}>
        <div className={styles.footerHint}>{layoutHint}</div>
        {collapsed !== 'none' ? (
          <button
            className={styles.footerBtn}
            onClick={() => setCollapsed('none')}
            type="button"
            aria-label="Expand both"
            title="Expand Both"
          >
            <VscChromeRestore />
          </button>
        ) : null}
      </div>
    </div>
  );
}
