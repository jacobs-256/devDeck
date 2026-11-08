// @ts-nocheck
import { useMemo } from 'react';
import { marked } from 'marked';
import { useEscapeClose } from '../../../ui/useEscapeClose';
import './Base64Help.css';

import helpEn from './locales/help-en.md?raw';

const HELP_TITLE = 'Base64 Encode/Decode Help';

interface Base64HelpProps {
  onClose: () => void;
}

export default function Base64Help({ onClose }: Base64HelpProps) {
  useEscapeClose(onClose);
  const html = useMemo(() => {
    return marked.parse(helpEn, { breaks: true, gfm: true }) as string;
  }, []);

  return (
    <div className="b64-help-overlay" onClick={onClose}>
      <div
        className="b64-help-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Base64 help"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="b64-help-header">
          <span>{HELP_TITLE}</span>
          <button className="b64-help-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="b64-help-body" dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
