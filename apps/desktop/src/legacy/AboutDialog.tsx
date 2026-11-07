import { useEffect } from 'react';
import { VscClose, VscGithub, VscGlobe, VscSparkle } from 'react-icons/vsc';
import styles from './AboutDialog.module.css';
import brandMark from '../assets/brand-mark.svg';

export default function AboutDialog({
  isOpen,
  version,
  onClose,
}: {
  isOpen: boolean;
  version: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      <div className={`${styles.backdrop} fade-in`} onClick={onClose} />
      <div className={`${styles.dialog} slide-up`} role="dialog" aria-modal="true" aria-label="About">
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.headerBadge}>
              <img className={styles.appIconSmall} src={brandMark} alt="" />
            </div>
            <h2 className={styles.headerTitle}>About DevToolBox</h2>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <VscClose size={14} />
          </button>
        </div>

        <div className={styles.content}>
          <div className={styles.hero}>
            <div className={styles.heroIcon}>
              <img className={styles.appIconLarge} src={brandMark} alt="" />
            </div>
            <div className={styles.heroTitle}>DevToolBox</div>
            <div className={styles.heroSub}>Developer Productivity Suite</div>
            <div className={styles.heroMeta}>Version {version}</div>
          </div>

          <div className={styles.links}>
            <a
              className={styles.linkBtn}
              href="https://github.com/XthingsJacobs/devToolBox"
              target="_blank"
              rel="noreferrer"
            >
              <VscGithub />
              GitHub
            </a>
            <a
              className={styles.linkBtn}
              href="https://github.com/XthingsJacobs/devToolBox"
              target="_blank"
              rel="noreferrer"
            >
              <VscGlobe />
              Documentation
            </a>
          </div>

          <div className={styles.footer}>
            <span className={styles.footerText}>Built with Rust, React, and Tauri 2</span>
            <VscSparkle />
          </div>
        </div>
      </div>
    </>
  );
}
