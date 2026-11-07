// @ts-nocheck
import { useState, useRef, useMemo, useEffect, useCallback, type ReactNode } from 'react';
import styles from './TextDiff.module.css';
import * as Diff from 'diff';
import ResponsiveActions from '../../ResponsiveActions';
import { useI18n, getModuleLocale } from '../../../i18n';
import { ToolSection } from '@@components';
import { VscDiff, VscFolderOpened, VscOutput, VscTrash } from 'react-icons/vsc';

interface DiffLine {
  num?: number;
  content: ReactNode;
  type: 'equal' | 'removed' | 'added' | 'modified' | 'empty' | 'sep';
}

function highlightWords(oldText: string, newText: string, type: 'added' | 'removed'): ReactNode {
  const wordDiffs = Diff.diffWords(oldText, newText);
  const parts: ReactNode[] = [];
  wordDiffs.forEach((part, i) => {
    if (type === 'removed' && part.removed) {
      parts.push(
        <span key={i} className={styles.wordRemoved}>
          {part.value}
        </span>,
      );
    } else if (type === 'added' && part.added) {
      parts.push(
        <span key={i} className={styles.wordAdded}>
          {part.value}
        </span>,
      );
    } else if (!part.added && !part.removed) {
      parts.push(<span key={i}>{part.value}</span>);
    }
  });
  return <>{parts}</>;
}

function buildDiffPanes(left: string, right: string): { leftLines: DiffLine[]; rightLines: DiffLine[] } {
  const changes = Diff.diffLines(left, right);
  const leftLines: DiffLine[] = [];
  const rightLines: DiffLine[] = [];
  let leftNum = 1;
  let rightNum = 1;

  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    const lines = change.value.replace(/\n$/, '').split('\n');

    if (!change.added && !change.removed) {
      for (const line of lines) {
        leftLines.push({ num: leftNum, content: line, type: 'equal' });
        rightLines.push({ num: rightNum, content: line, type: 'equal' });
        leftNum++;
        rightNum++;
      }
    } else if (change.removed) {
      const next = changes[i + 1];
      if (next && next.added) {
        const addedLines = next.value.replace(/\n$/, '').split('\n');
        const maxLen = Math.max(lines.length, addedLines.length);
        for (let j = 0; j < maxLen; j++) {
          const oldLine = j < lines.length ? lines[j] : undefined;
          const newLine = j < addedLines.length ? addedLines[j] : undefined;
          if (oldLine !== undefined && newLine !== undefined) {
            leftLines.push({
              num: leftNum + j,
              content: highlightWords(oldLine, newLine, 'removed'),
              type: 'modified',
            });
            rightLines.push({
              num: rightNum + j,
              content: highlightWords(oldLine, newLine, 'added'),
              type: 'modified',
            });
          } else if (oldLine !== undefined) {
            leftLines.push({ num: leftNum + j, content: oldLine, type: 'removed' });
            rightLines.push({ type: 'empty', content: '' });
          } else if (newLine !== undefined) {
            leftLines.push({ type: 'empty', content: '' });
            rightLines.push({ num: rightNum + j, content: newLine, type: 'added' });
          }
        }
        leftNum += lines.length;
        rightNum += addedLines.length;
        i++;
      } else {
        for (let j = 0; j < lines.length; j++) {
          leftLines.push({ num: leftNum + j, content: lines[j], type: 'removed' });
          rightLines.push({ type: 'empty', content: '' });
        }
        leftNum += lines.length;
      }
    } else if (change.added) {
      for (let j = 0; j < lines.length; j++) {
        leftLines.push({ type: 'empty', content: '' });
        rightLines.push({ num: rightNum + j, content: lines[j], type: 'added' });
      }
      rightNum += lines.length;
    }
  }
  return { leftLines, rightLines };
}

function DiffPane({ lines, side }: { lines: DiffLine[]; side: 'left' | 'right' }) {
  return (
    <table className={styles.diffTable}>
      <tbody>
        {lines.map((line, i) => {
          let cls = '';
          if (line.type === 'removed') cls = styles.lineRemoved;
          else if (line.type === 'added') cls = styles.lineAdded;
          else if (line.type === 'modified') cls = side === 'left' ? styles.lineRemoved : styles.lineAdded;
          else if (line.type === 'empty') cls = styles.lineEmpty;
          return (
            <tr key={i} className={cls}>
              <td className={styles.lineNum}>{line.num ?? ''}</td>
              <td className={styles.lineContent}>{line.content}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function TextDiff() {
  const { locale } = useI18n();
  const localeData = getModuleLocale(locale, 'TextDiff');
  const mt = (key: string) => localeData?.[key] ?? key;

  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');
  const [leftName, setLeftName] = useState('');
  const [rightName, setRightName] = useState('');
  const leftFileRef = useRef<HTMLInputElement>(null);
  const rightFileRef = useRef<HTMLInputElement>(null);
  const leftPaneRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);

  const hasDiff = left.length > 0 && right.length > 0;

  const { leftLines, rightLines } = useMemo(() => {
    if (!hasDiff) return { leftLines: [], rightLines: [] };
    return buildDiffPanes(left, right);
  }, [left, right, hasDiff]);

  const stats = useMemo(() => {
    let added = 0,
      removed = 0;
    leftLines.forEach((l) => {
      if (l.type === 'removed' || l.type === 'modified') removed++;
    });
    rightLines.forEach((l) => {
      if (l.type === 'added' || l.type === 'modified') added++;
    });
    return { added, removed };
  }, [leftLines, rightLines]);

  const syncing = useRef(false);
  const syncScroll = useCallback((source: 'left' | 'right') => {
    if (syncing.current) return;
    syncing.current = true;
    const from = source === 'left' ? leftPaneRef.current : rightPaneRef.current;
    const to = source === 'left' ? rightPaneRef.current : leftPaneRef.current;
    if (from && to) {
      to.scrollTop = from.scrollTop;
    }
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  }, []);

  useEffect(() => {
    const lEl = leftPaneRef.current;
    const rEl = rightPaneRef.current;
    if (!lEl || !rEl) return;
    const onLeftScroll = () => syncScroll('left');
    const onRightScroll = () => syncScroll('right');
    lEl.addEventListener('scroll', onLeftScroll, { passive: true });
    rEl.addEventListener('scroll', onRightScroll, { passive: true });
    return () => {
      lEl.removeEventListener('scroll', onLeftScroll);
      rEl.removeEventListener('scroll', onRightScroll);
    };
  }, [syncScroll]);

  const loadFile =
    (setter: (v: string) => void, nameSetter: (v: string) => void) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      nameSetter(file.name);
      const reader = new FileReader();
      reader.onload = () => setter(reader.result as string);
      reader.readAsText(file);
      e.target.value = '';
    };

  return (
    <div className={styles.container}>
      <div className={styles.paneArea}>
        <div className={styles.pane}>
          <ToolSection
            fill
            bodyVariant="noPad"
            title={leftName || mt('originalFile')}
            icon={<VscDiff />}
            actions={
              <ResponsiveActions
                actions={[
                  {
                    label: mt('selectFile'),
                    onClick: () => leftFileRef.current?.click(),
                    icon: <VscFolderOpened />,
                  },
                  {
                    label: mt('clear'),
                    onClick: () => {
                      setLeft('');
                      setLeftName('');
                    },
                    icon: <VscTrash />,
                  },
                ]}
              />
            }
          >
            <input
              ref={leftFileRef}
              type="file"
              accept=".txt,.js,.ts,.json,.html,.css,.md,.xml,.csv,*"
              onChange={loadFile(setLeft, setLeftName)}
              style={{ display: 'none' }}
            />
            <div className={styles.paneBody} ref={leftPaneRef}>
              {left ? (
                <DiffPane
                  lines={
                    hasDiff
                      ? leftLines
                      : left.split('\n').map((l, i) => ({ num: i + 1, content: l, type: 'equal' as const }))
                  }
                  side="left"
                />
              ) : (
                <div className={styles.emptyHint}>{mt('selectOriginal')}</div>
              )}
            </div>
          </ToolSection>
        </div>

        <div className={styles.paneDivider} />

        <div className={styles.pane}>
          <ToolSection
            fill
            bodyVariant="noPad"
            title={rightName || mt('modifiedFile')}
            icon={<VscOutput />}
            actions={
              <ResponsiveActions
                actions={[
                  {
                    label: mt('selectFile'),
                    onClick: () => rightFileRef.current?.click(),
                    icon: <VscFolderOpened />,
                  },
                  {
                    label: mt('clear'),
                    onClick: () => {
                      setRight('');
                      setRightName('');
                    },
                    icon: <VscTrash />,
                  },
                ]}
              />
            }
          >
            <input
              ref={rightFileRef}
              type="file"
              accept=".txt,.js,.ts,.json,.html,.css,.md,.xml,.csv,*"
              onChange={loadFile(setRight, setRightName)}
              style={{ display: 'none' }}
            />
            <div className={styles.paneBody} ref={rightPaneRef}>
              {right ? (
                <DiffPane
                  lines={
                    hasDiff
                      ? rightLines
                      : right.split('\n').map((l, i) => ({ num: i + 1, content: l, type: 'equal' as const }))
                  }
                  side="right"
                />
              ) : (
                <div className={styles.emptyHint}>{mt('selectModified')}</div>
              )}
            </div>
          </ToolSection>
        </div>
      </div>

      <div className={styles.statusBar}>
        <span>
          {mt('added')}: {stats.added} {mt('lines')}
        </span>
        <span>
          {mt('deleted')}: {stats.removed} {mt('lines')}
        </span>
      </div>
    </div>
  );
}
