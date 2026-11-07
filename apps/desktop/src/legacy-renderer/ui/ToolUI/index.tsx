// @ts-nocheck
import {
  forwardRef,
  type CSSProperties,
  type ReactNode,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import styles from './ToolUI.module.css';

export function ToolSection({
  title,
  icon,
  actions,
  accentColor,
  fill,
  bodyVariant,
  children,
  className,
}: {
  title: string;
  icon?: ReactNode;
  actions?: ReactNode;
  accentColor?: string;
  fill?: boolean;
  bodyVariant?: 'default' | 'noPad';
  children: ReactNode;
  className?: string;
}) {
  const style = accentColor ? ({ '--tool-accent': accentColor } as CSSProperties) : undefined;
  return (
    <div
      className={`${styles.section}${fill ? ` ${styles.fill}` : ''}${className ? ` ${className}` : ''}`}
      style={style}
    >
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          {icon ? <span className={styles.icon}>{icon}</span> : null}
          <span className={styles.title}>{title}</span>
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
      <div className={`${styles.body}${bodyVariant === 'noPad' ? ` ${styles.bodyNoPad}` : ''}`}>
        {children}
      </div>
    </div>
  );
}

export function ToolField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      {children}
    </div>
  );
}

export function ToolInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${styles.input}${className ? ` ${className}` : ''}`} {...props} />;
}

export function ToolSelect({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${styles.select}${className ? ` ${className}` : ''}`} {...props} />;
}

export function ToolTextarea({
  className,
  mono,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { mono?: boolean }) {
  return (
    <textarea
      className={`${styles.textarea}${mono ? ` ${styles.mono}` : ''}${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
}

export const ToolButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'default' }
>(function ToolButton({ variant, className, ...props }, ref) {
  return (
    <button
      ref={ref}
      className={`${styles.btn}${variant === 'primary' ? ` ${styles.btnPrimary}` : ''}${className ? ` ${className}` : ''}`}
      {...props}
    />
  );
});
