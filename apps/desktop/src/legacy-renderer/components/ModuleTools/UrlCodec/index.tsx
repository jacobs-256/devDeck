// @ts-nocheck
import { useState, useMemo } from 'react';
import { marked } from 'marked';
import sp from '@@components/SplitPane/SplitPane.module.css';
import ResponsiveActions from '../../ResponsiveActions';
import { useSplitPane, HelpModal, ToolSection } from '@@components';
import { useI18n, getModuleLocale } from '../../../i18n';
import './UrlHelp.css';
import {
  VscArrowLeft,
  VscArrowRight,
  VscCopy,
  VscEdit,
  VscOutput,
  VscQuestion,
  VscTrash,
} from 'react-icons/vsc';

import helpEn from './locales/help-en.md?raw';

const HELP_TITLE = 'URL Encode/Decode Help';

export default function UrlCodec() {
  const { locale } = useI18n();
  const localeData = getModuleLocale(locale, 'UrlCodec');
  const mt = (key: string) => localeData?.[key] ?? key;

  const helpHtml = useMemo(() => {
    return marked.parse(helpEn, { breaks: true, gfm: true }) as string;
  }, []);

  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const { splitPercent, containerRef, handleMouseDown } = useSplitPane(50);

  const handleEncode = () => {
    if (!input.trim()) return;
    try {
      setOutput(encodeURIComponent(input));
      setError('');
    } catch {
      setError(mt('encodeFailed'));
      setOutput('');
    }
  };

  const handleDecode = () => {
    if (!input.trim()) return;
    try {
      setOutput(decodeURIComponent(input));
      setError('');
    } catch {
      setError(mt('decodeFailed'));
      setOutput('');
    }
  };

  const handleCopy = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleClear = () => {
    setInput('');
    setOutput('');
    setError('');
  };

  return (
    <div className={sp.container} ref={containerRef}>
      <div className={sp.pane} style={{ width: `${splitPercent}%` }}>
        <ToolSection
          fill
          bodyVariant="noPad"
          title={mt('input')}
          icon={<VscEdit />}
          actions={
            <ResponsiveActions
              actions={[
                { label: mt('encode'), onClick: handleEncode, icon: <VscArrowRight /> },
                { label: mt('decode'), onClick: handleDecode, icon: <VscArrowLeft /> },
                { label: mt('clear'), onClick: handleClear, icon: <VscTrash /> },
                { label: mt('help'), onClick: () => setShowHelp(true), icon: <VscQuestion /> },
              ]}
            />
          }
        >
          <textarea
            className={sp.textarea}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={mt('placeholder')}
            spellCheck={false}
          />
        </ToolSection>
      </div>

      <div className={sp.divider} onMouseDown={handleMouseDown} />

      <div className={sp.pane} style={{ width: `${100 - splitPercent}%` }}>
        <ToolSection
          fill
          bodyVariant="noPad"
          title={mt('result')}
          icon={<VscOutput />}
          actions={
            <ResponsiveActions
              actions={[
                { label: copied ? mt('copied') : mt('copy'), onClick: handleCopy, icon: <VscCopy /> },
              ]}
            />
          }
        >
          <div className={sp.outputWrap}>
            {error ? <pre className={sp.error}>{error}</pre> : <pre className={sp.output}>{output}</pre>}
          </div>
        </ToolSection>
      </div>

      {showHelp && (
        <HelpModal title={HELP_TITLE} onClose={() => setShowHelp(false)}>
          <div className="url-help" dangerouslySetInnerHTML={{ __html: helpHtml }} />
        </HelpModal>
      )}
    </div>
  );
}
