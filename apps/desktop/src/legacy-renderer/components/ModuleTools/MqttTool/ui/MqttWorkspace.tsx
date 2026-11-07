// @ts-nocheck
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { MqttConfig } from '../mqttTypes';
import styles from './MqttWorkspace.module.css';
import { mqttConnect, mqttDisconnect, mqttPublish, mqttSubscribe, mqttUnsubscribe, onSdkEvent } from '../sdk';
import { loadSubs, saveSubs } from '../mqttStore';
import { t } from './i18n';

type ConnStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface MqttMessage {
  id: number;
  dir: 'recv' | 'sent';
  topic: string;
  payload: string;
  qos: number;
  retain: boolean;
  time: string;
  format?: 'json' | 'base64' | 'hex' | 'text';
  decoded?: string;
}

interface Sub {
  topic: string;
  qos: 0 | 1 | 2;
  enabled: boolean;
}

interface Props {
  config: MqttConfig;
  status?: 'connected' | 'connecting' | 'disconnected' | 'error';
  onEdit?: (id: string) => void;
  onCopy?: (id: string) => void;
  onDelete?: (id: string) => void;
}

const MAX_MESSAGES = 2000;

function highlightJson(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/("(?:\\.|[^"\\])*")(\s*:)/g, '<span class="json-key">$1</span>$2')
    .replace(/:\s*("(?:\\.|[^"\\])*")(?=\s*[,\n\r\]}])/g, (match, str) =>
      match.replace(str, `<span class="json-str">${str}</span>`),
    )
    .replace(/:\s*(-?\d+\.?\d*(?:[eE][+-]?\d+)?)(?=\s*[,\n\r\]}])/g, (match, num) =>
      match.replace(num, `<span class="json-num">${num}</span>`),
    )
    .replace(/:\s*(true|false)(?=\s*[,\n\r\]}])/g, (match, val) =>
      match.replace(val, `<span class="json-bool">${val}</span>`),
    )
    .replace(/:\s*(null)(?=\s*[,\n\r\]}])/g, (match, val) =>
      match.replace(val, `<span class="json-null">${val}</span>`),
    );
}

function detectPayloadFormat(payload: string): { format: MqttMessage['format']; decoded?: string } {
  const trimmed = payload.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      const obj = JSON.parse(trimmed);
      return { format: 'json', decoded: JSON.stringify(obj, null, 2) };
    } catch {
      void 0;
    }
  }

  const hasBinary = Array.from(payload).some((c) => {
    const code = c.charCodeAt(0);
    return (code >= 0 && code <= 8) || (code >= 14 && code <= 31) || (code >= 127 && code <= 159);
  });
  if (hasBinary) {
    const hex = Array.from(payload, (c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ');
    return { format: 'hex', decoded: hex };
  }

  if (trimmed.length >= 8 && /^[A-Za-z0-9+/]+=*$/.test(trimmed) && trimmed.length % 4 === 0) {
    try {
      const raw = atob(trimmed);
      const printable = /^[\x20-\x7E\t\n\r]*$/.test(raw);
      if (printable && raw.length > 0) return { format: 'base64', decoded: raw };
    } catch {
      void 0;
    }
  }

  return { format: 'text' };
}

let msgIdCounter = 0;

export default function MqttWorkspace({ config, status: externalStatus, onEdit, onCopy, onDelete }: Props) {
  const [status, setStatus] = useState<ConnStatus>('disconnected');
  const [subs, setSubs] = useState<Sub[]>([]);
  const [messages, setMessages] = useState<MqttMessage[]>([]);
  const [subTopic, setSubTopic] = useState('');
  const [subQos, setSubQos] = useState<0 | 1 | 2>(0);
  const [showSubTopicDropdown, setShowSubTopicDropdown] = useState(false);
  const subTopicInputRef = useRef<HTMLInputElement>(null);
  const [pubTopic, setPubTopic] = useState('');
  const [pubPayload, setPubPayload] = useState('');
  const [pubQos, setPubQos] = useState<0 | 1 | 2>(0);
  const [pubRetain, setPubRetain] = useState(false);
  const [pubFormat, setPubFormat] = useState<'json' | 'plaintext' | 'base64' | 'hex'>('json');
  const [pubFormatWarn, setPubFormatWarn] = useState('');
  const [showSubDialog, setShowSubDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [pubHeight, setPubHeight] = useState(180);
  const [leftWidth, setLeftWidth] = useState(280);
  const draggingRef = useRef(false);
  const [hoverSub, setHoverSub] = useState<{ topic: string; top: number; left: number } | null>(null);
  const [msgSearch, setMsgSearch] = useState('');
  const [showMsgSearch, setShowMsgSearch] = useState(false);
  const [searchMatchIdx, setSearchMatchIdx] = useState(0);
  const msgSearchRef = useRef<HTMLInputElement>(null);
  const disconnectingRef = useRef(false);
  const msgListRef = useRef<HTMLDivElement>(null);
  const msgStickToBottomRef = useRef(true);
  const pendingMessagesRef = useRef<MqttMessage[]>([]);
  const flushRafRef = useRef<number | null>(null);
  const scrollAfterFlushRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const subsRef = useRef(subs);
  subsRef.current = subs;

  useEffect(() => {
    const next = externalStatus as ConnStatus | undefined;
    if (next) setStatus(next);
  }, [externalStatus]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const loaded = await loadSubs(config.id);
      if (!alive) return;
      setSubs(loaded);
    })();
    return () => {
      alive = false;
    };
  }, [config.id]);

  useEffect(() => {
    void saveSubs(config.id, subs);
  }, [config.id, subs]);

  const isMsgListAtBottom = useCallback((el: HTMLDivElement) => {
    const threshold = 24;
    return el.scrollHeight - el.clientHeight - el.scrollTop <= threshold;
  }, []);

  const flushPendingMessages = useCallback(() => {
    flushRafRef.current = null;
    const pending = pendingMessagesRef.current;
    if (pending.length === 0) return;
    pendingMessagesRef.current = [];
    setMessages((prev) => {
      const next = [...prev, ...pending];
      if (next.length <= MAX_MESSAGES) return next;
      return next.slice(next.length - MAX_MESSAGES);
    });
  }, []);

  const scheduleFlush = useCallback(() => {
    if (flushRafRef.current !== null) return;
    flushRafRef.current = window.requestAnimationFrame(flushPendingMessages);
  }, [flushPendingMessages]);

  useEffect(() => {
    const el = msgListRef.current;
    if (!el) return;
    const update = () => {
      const bottom = isMsgListAtBottom(el);
      msgStickToBottomRef.current = bottom;
      if (!bottom) scrollAfterFlushRef.current = false;
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    return () => {
      el.removeEventListener('scroll', update);
    };
  }, [isMsgListAtBottom]);

  useEffect(() => {
    return () => {
      if (flushRafRef.current !== null) window.cancelAnimationFrame(flushRafRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (!scrollAfterFlushRef.current) return;
    if (!msgStickToBottomRef.current) {
      scrollAfterFlushRef.current = false;
      return;
    }
    scrollAfterFlushRef.current = false;
    const el = msgListRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const appendMessage = useCallback(
    (msg: MqttMessage) => {
      const el = msgListRef.current;
      const shouldStick = !el || isMsgListAtBottom(el);
      msgStickToBottomRef.current = shouldStick;
      if (shouldStick) scrollAfterFlushRef.current = true;
      pendingMessagesRef.current.push(msg);
      scheduleFlush();
    },
    [isMsgListAtBottom, scheduleFlush],
  );

  useEffect(() => {
    const off1 = onSdkEvent<{ id: string }>('mqtt.connected', (data) => {
      if (data?.id !== config.id) return;
      setStatus('connected');
      disconnectingRef.current = false;
      subsRef.current.forEach((s) => {
        if (s.enabled) void mqttSubscribe(config.id, s.topic, s.qos);
      });
    });
    const off2 = onSdkEvent<{ id: string; topic: string; payload: string; qos: number; retain: boolean }>(
      'mqtt.message',
      (data) => {
        if (data?.id !== config.id) return;
        const detected = detectPayloadFormat(data.payload);
        appendMessage({
          id: ++msgIdCounter,
          dir: 'recv',
          topic: data.topic,
          payload: data.payload,
          qos: data.qos ?? 0,
          retain: Boolean(data.retain),
          time: new Date().toLocaleTimeString(),
          format: detected.format,
          decoded: detected.decoded,
        });
      },
    );
    const off3 = onSdkEvent<{ id: string; message: string }>('mqtt.error', (data) => {
      if (data?.id !== config.id) return;
      setStatus('error');
    });
    const off4 = onSdkEvent<{ id: string }>('mqtt.close', (data) => {
      if (data?.id !== config.id) return;
      if (!disconnectingRef.current) setStatus('disconnected');
    });
    const off5 = onSdkEvent<{ id: string }>('mqtt.reconnect', (data) => {
      if (data?.id !== config.id) return;
      setStatus('connecting');
    });
    return () => {
      off1();
      off2();
      off3();
      off4();
      off5();
    };
  }, [appendMessage, config.id]);

  const subTopicTemplates = useMemo(
    () => [
      '$aws/events/presence/connected/clientId',
      '$aws/events/presence/disconnected/clientId',
      '$aws/events/subscriptions/subscribed/clientId',
      '$aws/events/subscriptions/unsubscribed/clientId',
      'utec/+/+/<UUID>/#',
      'utec/+/+/FF:FF:FF:<UUID>/#',
    ],
    [],
  );

  const filteredTemplates = useMemo(() => {
    if (!subTopic.trim()) return subTopicTemplates;
    const q = subTopic.toLowerCase();
    return subTopicTemplates.filter((x) => x.toLowerCase().includes(q));
  }, [subTopic, subTopicTemplates]);

  const isJsonFormat = pubFormat === 'json';
  const jsonHighlightHtml = useMemo(() => {
    if (!isJsonFormat || !pubPayload) return '';
    try {
      JSON.parse(pubPayload);
      return highlightJson(pubPayload) + '\n';
    } catch {
      return '';
    }
  }, [isJsonFormat, pubPayload]);

  const handleTextareaScroll = useCallback(() => {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop;
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      const startY = e.clientY;
      const startH = pubHeight;
      const onMove = (ev: MouseEvent) => {
        if (!draggingRef.current) return;
        const delta = startY - ev.clientY;
        setPubHeight(Math.max(100, Math.min(500, startH + delta)));
      };
      const onUp = () => {
        draggingRef.current = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [pubHeight],
  );

  const handleHResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startW = leftWidth;
      const onMove = (ev: MouseEvent) => {
        const delta = ev.clientX - startX;
        setLeftWidth(Math.max(160, Math.min(500, startW + delta)));
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [leftWidth],
  );

  const searchMatches = useMemo(() => {
    if (!msgSearch) return [];
    const q = msgSearch.toLowerCase();
    return messages
      .filter(
        (m) =>
          m.topic.toLowerCase().includes(q) ||
          m.payload.toLowerCase().includes(q) ||
          (m.decoded && m.decoded.toLowerCase().includes(q)),
      )
      .map((m) => m.id);
  }, [messages, msgSearch]);

  const scrollToMatch = useCallback(
    (idx: number) => {
      if (!searchMatches.length || !msgListRef.current) return;
      const id = searchMatches[idx];
      const el = msgListRef.current.querySelector(`[data-msgid="${id}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    [searchMatches],
  );

  const handleSearchNext = useCallback(() => {
    if (!searchMatches.length) return;
    const next = (searchMatchIdx + 1) % searchMatches.length;
    setSearchMatchIdx(next);
    scrollToMatch(next);
  }, [searchMatchIdx, searchMatches.length, scrollToMatch]);

  const handleSearchPrev = useCallback(() => {
    if (!searchMatches.length) return;
    const prev = (searchMatchIdx - 1 + searchMatches.length) % searchMatches.length;
    setSearchMatchIdx(prev);
    scrollToMatch(prev);
  }, [searchMatchIdx, searchMatches.length, scrollToMatch]);

  useEffect(() => {
    if (!msgSearch) setSearchMatchIdx(0);
    else setSearchMatchIdx(0);
  }, [msgSearch]);

  const handleConnect = useCallback(async () => {
    disconnectingRef.current = false;
    setStatus('connecting');
    await mqttConnect({
      id: config.id,
      protocol: config.protocol,
      host: config.host,
      port: config.port,
      path: config.path,
      clientId: config.clientId,
      username: config.username,
      password: config.password,
      sslEnabled: config.sslEnabled,
      sslSecure: config.sslSecure,
      alpn: config.alpn,
      certType: config.certType,
      caFile: config.caFile,
      clientCert: config.clientCert,
      clientKey: config.clientKey,
      caPem: config.caPem,
      clientCertPem: config.clientCertPem,
      clientKeyPem: config.clientKeyPem,
      caDataB64: config.caDataB64,
      clientCertDataB64: config.clientCertDataB64,
      clientKeyDataB64: config.clientKeyDataB64,
      mqttVersion: config.mqttVersion,
      connectTimeout: config.connectTimeout,
      keepAlive: config.keepAlive,
      autoReconnect: config.autoReconnect,
      reconnectPeriod: config.reconnectPeriod,
      cleanStart: config.cleanStart,
      sessionExpiry: config.sessionExpiry,
      lastWillTopic: config.lastWillTopic,
      lastWillQos: config.lastWillQos,
      lastWillRetain: config.lastWillRetain,
      lastWillMessage: config.lastWillMessage,
    });
  }, [config]);

  const handleDisconnect = useCallback(async () => {
    disconnectingRef.current = true;
    await mqttDisconnect(config.id);
    setStatus('disconnected');
  }, [config.id]);

  const handleSubscribe = useCallback(async () => {
    const topic = subTopic.trim();
    if (!topic) return;
    if (subs.some((s) => s.topic === topic)) return;
    setSubs((prev) => [...prev, { topic, qos: subQos, enabled: true }]);
    await mqttSubscribe(config.id, topic, subQos);
    setSubTopic('');
  }, [subTopic, subQos, subs, config.id]);

  const handleUnsubscribe = useCallback(
    async (topic: string) => {
      setSubs((prev) => prev.filter((s) => s.topic !== topic));
      await mqttUnsubscribe(config.id, topic);
    },
    [config.id],
  );

  const handleToggleSub = useCallback(
    async (topic: string, enabled: boolean) => {
      setSubs((prev) => prev.map((s) => (s.topic === topic ? { ...s, enabled } : s)));
      if (enabled) {
        const sub = subs.find((s) => s.topic === topic);
        await mqttSubscribe(config.id, topic, sub?.qos ?? 0);
      } else {
        await mqttUnsubscribe(config.id, topic);
      }
    },
    [config.id, subs],
  );

  const handlePublish = useCallback(async () => {
    const topic = pubTopic.trim();
    if (!topic || status !== 'connected') return;
    await mqttPublish(config.id, topic, pubPayload, pubQos, pubRetain);
    appendMessage({
      id: ++msgIdCounter,
      dir: 'sent',
      topic,
      payload: pubPayload,
      qos: pubQos,
      retain: pubRetain,
      time: new Date().toLocaleTimeString(),
    });
  }, [appendMessage, pubTopic, status, config.id, pubPayload, pubQos, pubRetain]);

  const handleFormatChange = useCallback(
    (newFmt: typeof pubFormat) => {
      setPubFormatWarn('');
      const text = pubPayload.trim();
      if (!text) {
        setPubFormat(newFmt);
        return;
      }

      let raw = text;
      try {
        switch (pubFormat) {
          case 'json':
            break;
          case 'base64':
            raw = atob(text);
            break;
          case 'hex':
            raw = text.replace(/\s/g, '').replace(/../g, (h) => String.fromCharCode(parseInt(h, 16)));
            break;
          default:
            break;
        }
      } catch {
        raw = text;
      }

      try {
        switch (newFmt) {
          case 'json':
            try {
              const obj = JSON.parse(raw);
              setPubPayload(JSON.stringify(obj, null, 2));
            } catch {
              setPubPayload(raw);
              setPubFormatWarn(t('jsonInvalid'));
            }
            break;
          case 'base64':
            setPubPayload(btoa(raw));
            break;
          case 'hex':
            setPubPayload(Array.from(raw, (c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' '));
            break;
          default:
            setPubPayload(raw);
        }
      } catch {
        setPubPayload(raw);
        setPubFormatWarn(t('base64Invalid'));
      }

      setPubFormat(newFmt);
    },
    [pubPayload, pubFormat],
  );

  const handleSaveMessages = useCallback(() => {
    const lines = messages.map((m) => {
      const dir = m.dir === 'recv' ? 'RECV' : 'SENT';
      const content = m.decoded ?? m.payload;
      return `[${m.time}] [${dir}] [${m.topic}] QoS:${m.qos}${m.retain ? ' Retain' : ''}${m.format && m.format !== 'text' ? ` (${m.format.toUpperCase()})` : ''}\n${content}`;
    });
    const text = lines.join('\n\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mqtt-messages-${config.name || config.id}-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }, [messages, config.name, config.id]);

  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';
  const busy = isConnected || isConnecting;
  const statusLabel =
    status === 'connected'
      ? t('connected')
      : status === 'connecting'
        ? t('connecting')
        : status === 'error'
          ? t('connError')
          : t('disconnected');
  const orderedMessages = useMemo(() => messages, [messages]);

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <div className={styles.connInfo}>
          <span className={`${styles.statusDot} ${styles[status]}`} />
          {statusLabel} — {config.protocol}
          {config.host}:{config.port}
        </div>
        {onDelete && !busy && (
          <button
            className={`${styles.connBtn} ${styles.deleteBtn}`}
            onClick={() => setShowDeleteConfirm(true)}
          >
            {t('delete')}
          </button>
        )}
        {onCopy && (
          <button className={`${styles.connBtn} ${styles.copyBtn}`} onClick={() => onCopy(config.id)}>
            {t('copy')}
          </button>
        )}
        {onEdit && !busy && (
          <button className={`${styles.connBtn} ${styles.editBtn}`} onClick={() => onEdit(config.id)}>
            {t('edit')}
          </button>
        )}
        {isConnected || isConnecting ? (
          <button
            className={`${styles.connBtn} ${styles.disconnect}`}
            onClick={() => void handleDisconnect()}
          >
            {t('disconnect')}
          </button>
        ) : (
          <button className={`${styles.connBtn} ${styles.connect}`} onClick={() => void handleConnect()}>
            {t('connect')}
          </button>
        )}
      </div>

      <div className={styles.main}>
        <div className={styles.leftPanel} style={{ width: leftWidth, minWidth: leftWidth }}>
          <div className={styles.panelSection}>
            <div className={styles.panelHeader}>
              {t('subscriptions')}
              <button
                className={styles.subAddBtn}
                onClick={() => setShowSubDialog(true)}
                title={t('addSubscription')}
              >
                ＋
              </button>
            </div>
            <div className={styles.panelBody}>
              {subs.length > 0 ? (
                <div className={styles.subList}>
                  {subs.map((s) => (
                    <div
                      key={s.topic}
                      className={`${styles.subItem}${!s.enabled ? ` ${styles.subItemDisabled}` : ''}`}
                      onMouseEnter={(e) => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setHoverSub({ topic: s.topic, top: rect.bottom + 4, left: rect.left });
                      }}
                      onMouseLeave={() => setHoverSub(null)}
                    >
                      <input
                        type="checkbox"
                        className={styles.subCheck}
                        checked={s.enabled}
                        onChange={(e) => void handleToggleSub(s.topic, e.target.checked)}
                      />
                      <span className={styles.subTopic}>{s.topic}</span>
                      <span className={styles.subQos}>QoS {s.qos}</span>
                      <button
                        className={styles.unsubBtn}
                        onClick={() => void handleUnsubscribe(s.topic)}
                        title={t('unsubscribe')}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  {hoverSub && (
                    <div className={styles.subTooltip} style={{ top: hoverSub.top, left: hoverSub.left }}>
                      {hoverSub.topic}
                    </div>
                  )}
                </div>
              ) : (
                <div className={styles.subEmpty}>{t('noSubscriptions')}</div>
              )}
            </div>
          </div>
        </div>

        <div className={styles.hResizeHandle} onMouseDown={handleHResizeStart} />

        <div
          className={styles.rightPanel}
          tabIndex={-1}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
              e.preventDefault();
              setShowMsgSearch(true);
              setTimeout(() => msgSearchRef.current?.focus(), 0);
            }
            if (e.key === 'Escape' && showMsgSearch) {
              setShowMsgSearch(false);
              setMsgSearch('');
            }
          }}
        >
          <div className={styles.msgToolbar}>
            <span className={styles.msgCount}>
              {t('messages')} ({messages.length})
            </span>
            <button className={styles.smallBtn} onClick={handleSaveMessages} disabled={messages.length === 0}>
              {t('saveMessages')}
            </button>
            <button
              className={styles.smallBtn}
              onClick={() => {
                msgStickToBottomRef.current = true;
                scrollAfterFlushRef.current = false;
                pendingMessagesRef.current = [];
                if (flushRafRef.current !== null) {
                  window.cancelAnimationFrame(flushRafRef.current);
                  flushRafRef.current = null;
                }
                setMessages([]);
              }}
              disabled={messages.length === 0}
            >
              {t('clearMessages')}
            </button>
          </div>
          {showMsgSearch && (
            <div className={styles.msgSearchBar}>
              <input
                ref={msgSearchRef}
                className={styles.msgSearchInput}
                value={msgSearch}
                onChange={(e) => setMsgSearch(e.target.value)}
                placeholder={t('searchPlaceholder')}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setShowMsgSearch(false);
                    setMsgSearch('');
                  }
                  if (e.key === 'Enter') {
                    if (e.shiftKey) handleSearchPrev();
                    else handleSearchNext();
                  }
                }}
              />
              {msgSearch && (
                <span className={styles.msgSearchCount}>
                  {searchMatches.length > 0 ? `${searchMatchIdx + 1}/${searchMatches.length}` : `0/0`}
                </span>
              )}
              <button
                className={styles.msgSearchNavBtn}
                onClick={handleSearchPrev}
                disabled={searchMatches.length === 0}
                title={t('searchPrev')}
              >
                ▲
              </button>
              <button
                className={styles.msgSearchNavBtn}
                onClick={handleSearchNext}
                disabled={searchMatches.length === 0}
                title={t('searchNext')}
              >
                ▼
              </button>
              <button
                className={styles.msgSearchClose}
                onClick={() => {
                  setShowMsgSearch(false);
                  setMsgSearch('');
                }}
              >
                ✕
              </button>
            </div>
          )}
          <div className={styles.msgList} ref={msgListRef}>
            {messages.length === 0 ? (
              <div className={styles.emptyMsg}>{t('noMessages')}</div>
            ) : (
              orderedMessages.map((m) => {
                const isMatch = msgSearch && searchMatches.includes(m.id);
                const isCurrent = isMatch && searchMatches[searchMatchIdx] === m.id;
                const isSent = m.dir === 'sent';
                return (
                  <div
                    key={m.id}
                    data-msgid={m.id}
                    className={`${styles.msgRow} ${isSent ? styles.msgRowSent : styles.msgRowRecv}`}
                  >
                    <div
                      className={`${styles.msgBubble} ${isSent ? styles.msgBubbleSent : styles.msgBubbleRecv}${isCurrent ? ` ${styles.msgItemCurrent}` : isMatch ? ` ${styles.msgItemMatch}` : ''}`}
                    >
                      <div className={styles.msgMeta}>
                        <span className={styles.msgTopic}>Topic: {m.topic}</span>
                        <span className={styles.msgQos}>QoS: {m.qos}</span>
                        {m.format && m.format !== 'text' && (
                          <span className={styles.msgFormat}>{m.format.toUpperCase()}</span>
                        )}
                      </div>
                      {m.format === 'json' && m.decoded ? (
                        <div className={`${styles.msgPayload} ${styles.msgPayloadJson}`}>
                          <span
                            className={styles.msgCopyIcon}
                            onClick={() => void navigator.clipboard.writeText(m.decoded ?? '')}
                            title={t('copyPayload')}
                          >
                            <svg viewBox="0 0 24 24">
                              <rect x="9" y="9" width="13" height="13" rx="2" />
                              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                            </svg>
                          </span>
                          <div dangerouslySetInnerHTML={{ __html: highlightJson(m.decoded) }} />
                        </div>
                      ) : m.format === 'base64' && m.decoded ? (
                        <div className={styles.msgPayload}>
                          <span
                            className={styles.msgCopyIcon}
                            onClick={() => void navigator.clipboard.writeText(m.decoded ?? '')}
                            title={t('copyPayload')}
                          >
                            <svg viewBox="0 0 24 24">
                              <rect x="9" y="9" width="13" height="13" rx="2" />
                              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                            </svg>
                          </span>
                          <div>{m.decoded}</div>
                          <div>
                            {t('originalBase64')}: {m.payload}
                          </div>
                        </div>
                      ) : m.format === 'hex' && m.decoded ? (
                        <div className={`${styles.msgPayload} ${styles.msgPayloadHex}`}>
                          <span
                            className={styles.msgCopyIcon}
                            onClick={() => void navigator.clipboard.writeText(m.decoded ?? '')}
                            title={t('copyPayload')}
                          >
                            <svg viewBox="0 0 24 24">
                              <rect x="9" y="9" width="13" height="13" rx="2" />
                              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                            </svg>
                          </span>
                          {m.decoded}
                        </div>
                      ) : (
                        <div className={styles.msgPayload}>
                          <span
                            className={styles.msgCopyIcon}
                            onClick={() => void navigator.clipboard.writeText(m.payload)}
                            title={t('copyPayload')}
                          >
                            <svg viewBox="0 0 24 24">
                              <rect x="9" y="9" width="13" height="13" rx="2" />
                              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                            </svg>
                          </span>
                          {m.payload}
                        </div>
                      )}
                      <span className={styles.msgTime}>{m.time}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className={styles.resizeHandle} onMouseDown={handleResizeStart} />
          <div className={styles.publishBar} style={{ height: pubHeight }}>
            <div className={styles.pubRow}>
              <input
                className={styles.topicInput}
                value={pubTopic}
                onChange={(e) => setPubTopic(e.target.value)}
                placeholder={t('pubTopicPlaceholder')}
              />
              <select
                className={styles.qosSelect}
                value={pubFormat}
                onChange={(e) => handleFormatChange(e.target.value as typeof pubFormat)}
              >
                <option value="json">JSON</option>
                <option value="plaintext">Plaintext</option>
                <option value="base64">Base64</option>
                <option value="hex">Hex</option>
              </select>
              <select
                className={styles.qosSelect}
                value={pubQos}
                onChange={(e) => setPubQos(Number(e.target.value) as 0 | 1 | 2)}
              >
                <option value={0}>QoS 0</option>
                <option value={1}>QoS 1</option>
                <option value={2}>QoS 2</option>
              </select>
              <label className={styles.retainCheck}>
                <input type="checkbox" checked={pubRetain} onChange={(e) => setPubRetain(e.target.checked)} />
                {t('retain')}
              </label>
            </div>
            <div className={styles.pubTextareaWrap}>
              {isJsonFormat && jsonHighlightHtml && (
                <div
                  ref={highlightRef}
                  className={styles.pubHighlight}
                  dangerouslySetInnerHTML={{ __html: jsonHighlightHtml }}
                  aria-hidden="true"
                />
              )}
              <textarea
                ref={textareaRef}
                className={`${styles.pubTextarea}${pubFormatWarn ? ` ${styles.pubTextareaWarn}` : ''}${isJsonFormat && jsonHighlightHtml ? ` ${styles.pubTextareaTransparent}` : ''}`}
                value={pubPayload}
                onChange={(e) => {
                  setPubPayload(e.target.value);
                  setPubFormatWarn('');
                }}
                onScroll={handleTextareaScroll}
                placeholder={t('pubPayloadPlaceholder')}
                rows={3}
                spellCheck={false}
              />
              {pubFormatWarn && <span className={styles.pubWarn}>{pubFormatWarn}</span>}
              <button
                className={`${styles.smallBtn} ${styles.pubSendBtn}`}
                onClick={() => void handlePublish()}
                disabled={!isConnected || !pubTopic.trim()}
              >
                {t('publish')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {showSubDialog && (
        <div className={styles.subDialogOverlay} onClick={() => setShowSubDialog(false)}>
          <div className={styles.subDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.subDialogTitle}>{t('addSubscription')}</div>
            <div className={styles.subDialogField}>
              <label className={styles.subDialogLabel}>{t('subTopic')}</label>
              <div className={styles.comboboxWrap}>
                <input
                  ref={subTopicInputRef}
                  className={styles.subDialogInput}
                  value={subTopic}
                  onChange={(e) => {
                    setSubTopic(e.target.value);
                    setShowSubTopicDropdown(e.target.value.trim().length > 0);
                  }}
                  onBlur={() => setTimeout(() => setShowSubTopicDropdown(false), 150)}
                  placeholder={t('subTopicPlaceholder')}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && subTopic.trim()) {
                      void handleSubscribe();
                      setShowSubDialog(false);
                    }
                    if (e.key === 'Escape') setShowSubTopicDropdown(false);
                  }}
                />
                <button
                  className={styles.comboboxToggle}
                  tabIndex={-1}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setShowSubTopicDropdown((v) => !v);
                    subTopicInputRef.current?.focus();
                  }}
                  aria-label={t('selectTemplate')}
                >
                  ▾
                </button>
                {showSubTopicDropdown && filteredTemplates.length > 0 && (
                  <div className={styles.comboboxDropdown}>
                    <div className={styles.comboboxDropdownLabel}>{t('topicTemplates')}</div>
                    {filteredTemplates.map((tpl) => (
                      <div
                        key={tpl}
                        className={styles.comboboxOption}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSubTopic(tpl);
                          setShowSubTopicDropdown(false);
                        }}
                      >
                        {tpl}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className={styles.subDialogField}>
              <label className={styles.subDialogLabel}>QoS</label>
              <select
                className={styles.subDialogSelect}
                value={subQos}
                onChange={(e) => setSubQos(Number(e.target.value) as 0 | 1 | 2)}
              >
                <option value={0}>QoS 0</option>
                <option value={1}>QoS 1</option>
                <option value={2}>QoS 2</option>
              </select>
            </div>
            <div className={styles.subDialogBtns}>
              <button className={styles.subDialogBtn} onClick={() => setShowSubDialog(false)}>
                {t('cancel')}
              </button>
              <button
                className={`${styles.subDialogBtn} ${styles.subDialogBtnPrimary}`}
                disabled={!subTopic.trim()}
                onClick={() => {
                  void handleSubscribe();
                  setShowSubDialog(false);
                }}
              >
                {t('subscribe')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className={styles.subDialogOverlay} onClick={() => setShowDeleteConfirm(false)}>
          <div className={styles.subDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.subDialogTitle}>{t('deleteConfirmTitle')}</div>
            <div className={styles.deleteConfirmMsg}>{t('deleteConfirmMsg', { name: config.name })}</div>
            <div className={styles.subDialogBtns}>
              <button className={styles.subDialogBtn} onClick={() => setShowDeleteConfirm(false)}>
                {t('cancel')}
              </button>
              <button
                className={`${styles.subDialogBtn} ${styles.deleteConfirmBtn}`}
                onClick={() => {
                  setShowDeleteConfirm(false);
                  onDelete?.(config.id);
                }}
              >
                {t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
