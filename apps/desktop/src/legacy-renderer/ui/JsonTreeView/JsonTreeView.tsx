// @ts-nocheck
import { useState, type ReactNode } from 'react';
import styles from './JsonTreeView.module.css';
import { VscChevronDown, VscChevronRight } from 'react-icons/vsc';

interface JsonTreeViewProps {
  data: unknown;
  defaultCollapsedDepth?: number;
}

function ValueSpan({ value }: { value: unknown }): ReactNode {
  if (value === null) return <span className={styles.valNull}>null</span>;
  if (typeof value === 'boolean') return <span className={styles.valBool}>{String(value)}</span>;
  if (typeof value === 'number') return <span className={styles.valNum}>{String(value)}</span>;
  if (typeof value === 'string') return <span className={styles.valStr}>"{value}"</span>;
  return <span>{String(value)}</span>;
}

interface LineData {
  lineNum: number;
  hasArrow: boolean;
  collapsed: boolean;
  onToggle: () => void;
  content: ReactNode;
}

function collectLines(
  value: unknown,
  depth: number,
  isLast: boolean,
  keyName: string | undefined,
  defaultCollapsedDepth: number,
  startLine: number,
  lines: LineData[],
  stateMap: Map<string, boolean>,
  path: string,
): number {
  const isObject = value !== null && typeof value === 'object' && !Array.isArray(value);
  const isArray = Array.isArray(value);
  const isCollapsible = isObject || isArray;
  const comma = isLast ? '' : ',';
  const keyPrefix =
    keyName !== undefined ? (
      <>
        <span className={styles.key}>"{keyName}"</span>
        <span className={styles.colon}>: </span>
      </>
    ) : null;

  if (!isCollapsible) {
    lines.push({
      lineNum: startLine,
      hasArrow: false,
      collapsed: false,
      onToggle: () => {},
      content: (
        <span style={{ paddingLeft: depth * 16 + 8 }}>
          {keyPrefix}
          <ValueSpan value={value} />
          {comma}
        </span>
      ),
    });
    return 1;
  }

  const entries = isArray
    ? (value as unknown[]).map((v, i) => ({ key: String(i), value: v, showKey: false }))
    : Object.entries(value as Record<string, unknown>).map(([k, v]) => ({ key: k, value: v, showKey: true }));

  const openBracket = isArray ? '[' : '{';
  const closeBracket = isArray ? ']' : '}';

  const stateKey = path;
  const isCollapsed = stateMap.get(stateKey) ?? depth >= defaultCollapsedDepth;

  const toggle = () => {
    stateMap.set(stateKey, !isCollapsed);
  };

  if (isCollapsed) {
    lines.push({
      lineNum: startLine,
      hasArrow: true,
      collapsed: true,
      onToggle: toggle,
      content: (
        <span style={{ paddingLeft: depth * 16 + 8 }}>
          {keyPrefix}
          <span className={styles.bracket}>{openBracket}</span>
          <span className={styles.collapsedLabel}> {entries.length} items </span>
          <span className={styles.bracket}>{closeBracket}</span>
          {comma}
        </span>
      ),
    });
    return 1;
  }

  lines.push({
    lineNum: startLine,
    hasArrow: true,
    collapsed: false,
    onToggle: toggle,
    content: (
      <span style={{ paddingLeft: depth * 16 + 8 }}>
        {keyPrefix}
        <span className={styles.bracket}>{openBracket}</span>
      </span>
    ),
  });

  let usedLines = 1;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const childPath = `${path}.${entry.key}`;
    const childUsed = collectLines(
      entry.value,
      depth + 1,
      i === entries.length - 1,
      entry.showKey ? entry.key : undefined,
      defaultCollapsedDepth,
      startLine + usedLines,
      lines,
      stateMap,
      childPath,
    );
    usedLines += childUsed;
  }

  lines.push({
    lineNum: startLine + usedLines,
    hasArrow: false,
    collapsed: false,
    onToggle: () => {},
    content: (
      <span style={{ paddingLeft: depth * 16 + 8 }}>
        <span className={styles.bracket}>{closeBracket}</span>
        {comma}
      </span>
    ),
  });

  return usedLines + 1;
}

export default function JsonTreeView({ data, defaultCollapsedDepth = 3 }: JsonTreeViewProps) {
  const [, setTick] = useState(0);
  const [stateMap] = useState(() => new Map<string, boolean>());

  const lines: LineData[] = [];
  collectLines(data, 0, true, undefined, defaultCollapsedDepth, 1, lines, stateMap, 'root');

  const handleToggle = (line: LineData) => {
    line.onToggle();
    setTick((t) => t + 1);
  };

  const handleContentClick = (line: LineData) => {
    if (line.hasArrow) {
      line.onToggle();
      setTick((t) => t + 1);
    }
  };

  return (
    <div className={styles.tree}>
      <div className={styles.gutterCol}>
        {lines.map((l, i) => (
          <div key={i} className={styles.gutterRow}>
            <span className={styles.lineNum}>{l.lineNum}</span>
            {l.hasArrow ? (
              <button
                className={styles.arrow}
                onClick={() => handleToggle(l)}
                aria-label={l.collapsed ? 'Expand' : 'Collapse'}
              >
                {l.collapsed ? <VscChevronRight /> : <VscChevronDown />}
              </button>
            ) : (
              <span className={styles.arrowPlaceholder} />
            )}
          </div>
        ))}
      </div>
      <div className={styles.contentCol}>
        {lines.map((l, i) => (
          <div
            key={i}
            className={`${styles.contentRow}${l.hasArrow ? ` ${styles.contentRowClickable}` : ''}`}
            onClick={l.hasArrow ? () => handleContentClick(l) : undefined}
          >
            {l.content}
          </div>
        ))}
      </div>
    </div>
  );
}
