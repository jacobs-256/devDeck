import { useEffect, useState, type FormEvent } from 'react';
import styles from './App.module.css';

export type TextPromptDialogProps = {
  title: string;
  label: string;
  initial: string;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: (value: string) => void | Promise<void>;
};

export type ConfirmDialogProps = {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

function useEscape(onCancel: () => void) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
}

export function TextPromptDialog({
  title,
  label,
  initial,
  confirmLabel = 'Save',
  onCancel,
  onConfirm,
}: TextPromptDialogProps) {
  const [value, setValue] = useState(initial);
  useEffect(() => setValue(initial), [initial]);
  useEscape(onCancel);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next = value.trim();
    if (!next) return;
    void onConfirm(next);
    onCancel();
  };

  return (
    <div
      className={styles.modalBackdrop}
      onMouseDown={(event) => event.target === event.currentTarget && onCancel()}
    >
      <form
        className={`${styles.modal} ${styles.promptModal}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onSubmit={submit}
      >
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalTitle}>{title}</div>
          </div>
          <button type="button" className={styles.modalClose} onClick={onCancel} aria-label="Close">
            ×
          </button>
        </div>
        <div className={styles.promptBody}>
          <label className={styles.formField}>
            <span>{label}</span>
            <input
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              spellCheck={false}
            />
          </label>
        </div>
        <div className={styles.modalFooter}>
          <div className={styles.modalFooterLeft} />
          <div className={styles.modalFooterActions}>
            <button type="button" className={styles.secondaryButton} onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className={styles.primaryButton} disabled={!value.trim()}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  destructive = false,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  useEscape(onCancel);

  const submit = () => {
    void onConfirm();
    onCancel();
  };

  return (
    <div
      className={styles.modalBackdrop}
      onMouseDown={(event) => event.target === event.currentTarget && onCancel()}
    >
      <div
        className={`${styles.modal} ${styles.promptModal}`}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalTitle}>{title}</div>
          </div>
          <button type="button" className={styles.modalClose} onClick={onCancel} aria-label="Close">
            ×
          </button>
        </div>
        <div className={styles.promptBody}>
          <p className={styles.promptMessage}>{message}</p>
        </div>
        <div className={styles.modalFooter}>
          <div className={styles.modalFooterLeft} />
          <div className={styles.modalFooterActions}>
            <button type="button" className={styles.secondaryButton} onClick={onCancel}>
              Cancel
            </button>
            <button
              type="button"
              className={destructive ? styles.dangerButton : styles.primaryButton}
              onClick={submit}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
