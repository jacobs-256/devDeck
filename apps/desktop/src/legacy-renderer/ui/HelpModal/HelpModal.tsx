// @ts-nocheck
import type { ReactNode } from 'react';
import { useEscapeClose } from '../useEscapeClose';
import styles from './HelpModal.module.css';
import { VscChromeClose } from 'react-icons/vsc';

interface HelpModalProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Shared help modal component.
 *
 * Usage:
 * ```tsx
 * {showHelp && (
 *   <HelpModal title="URL Encoder/Decoder" onClose={() => setShowHelp(false)}>
 *     <h2>Title</h2>
 *     <p>Content...</p>
 *   </HelpModal>
 * )}
 * ```
 */
export default function HelpModal({ title, children, onClose, size = 'md' }: HelpModalProps) {
  useEscapeClose(onClose);

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={`${styles.modal}${size === 'sm' ? ` ${styles.modalSm}` : size === 'lg' ? ` ${styles.modalLg}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <span>{title}</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <VscChromeClose />
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}
