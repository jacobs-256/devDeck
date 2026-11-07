// @ts-nocheck
import { useEffect, useMemo, useState } from 'react';
import type { MqttConfig, MqttGroup } from '../mqttTypes';
import { getDefaultMqttConfig } from '../mqttTypes';
import styles from './MqttTool.module.css';
import { VscAdd, VscFolder } from 'react-icons/vsc';
import MqttConfigDialog from './MqttConfigDialog';
import { loadMqttConfigs, loadMqttGroups, saveMqttConfigs, saveMqttGroups } from '../mqttStore';
import MqttWorkspace from './MqttWorkspace';
import { onSdkEvent } from '../sdk';
import { t } from './i18n';

type ConnStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

export default function MqttTool() {
  const [configs, setConfigs] = useState<MqttConfig[]>([]);
  const [groups, setGroups] = useState<MqttGroup[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showGroupDialog, setShowGroupDialog] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, ConnStatus>>({});

  useEffect(() => {
    const load = async () => {
      try {
        const [cfg, grp] = await Promise.all([loadMqttConfigs(), loadMqttGroups()]);
        setConfigs(cfg);
        setGroups(grp);
        const defaultOpen: Record<string, boolean> = {};
        grp.forEach((g) => (defaultOpen[g.id] = true));
        setOpenGroups(defaultOpen);
        if (cfg[0]?.id) setActiveId(cfg[0].id);
      } finally {
        setHydrated(true);
      }
    };
    void load();
  }, []);

  useEffect(() => {
    const off1 = onSdkEvent<{ id: string }>('mqtt.connected', ({ id }) =>
      setStatuses((p) => ({ ...p, [id]: 'connected' })),
    );
    const off2 = onSdkEvent<{ id: string }>('mqtt.close', ({ id }) =>
      setStatuses((p) => ({ ...p, [id]: 'disconnected' })),
    );
    const off3 = onSdkEvent<{ id: string }>('mqtt.reconnect', ({ id }) =>
      setStatuses((p) => ({ ...p, [id]: 'connecting' })),
    );
    const off4 = onSdkEvent<{ id: string }>('mqtt.error', ({ id }) =>
      setStatuses((p) => ({ ...p, [id]: 'error' })),
    );
    return () => {
      off1();
      off2();
      off3();
      off4();
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void saveMqttConfigs(configs);
  }, [configs, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    void saveMqttGroups(groups);
  }, [groups, hydrated]);

  const grouped = useMemo(() => {
    const map: Record<string, MqttConfig[]> = {};
    configs.forEach((c) => {
      const gid = c.groupId;
      if (!gid) return;
      map[gid] ||= [];
      map[gid].push(c);
    });
    return map;
  }, [configs]);

  const ungrouped = useMemo(() => configs.filter((c) => !c.groupId), [configs]);

  const activeConfig = useMemo(() => configs.find((c) => c.id === activeId) ?? null, [configs, activeId]);

  const openAdd = () => {
    setEditingId(null);
    setShowEditor(true);
  };

  const openEdit = (id: string) => {
    setEditingId(id);
    setShowEditor(true);
  };

  const saveConfig = (cfg: MqttConfig) => {
    setShowEditor(false);
    setEditingId(null);
    setConfigs((prev) => {
      const idx = prev.findIndex((x) => x.id === cfg.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = cfg;
        void saveMqttConfigs(next);
        return next;
      }
      const next = [cfg, ...prev];
      void saveMqttConfigs(next);
      return next;
    });
    setActiveId(cfg.id);
  };

  const copyConfig = (id: string) => {
    const src = configs.find((c) => c.id === id);
    if (!src) return;
    const base = getDefaultMqttConfig();
    const copy: MqttConfig = { ...src, id: base.id, name: `${src.name} (copy)`, clientId: base.clientId };
    setConfigs((prev) => {
      const next = [copy, ...prev];
      void saveMqttConfigs(next);
      return next;
    });
    setActiveId(copy.id);
  };

  const deleteConfig = (id: string) => setConfirmDeleteId(id);

  const confirmDelete = () => {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    setConfigs((prev) => {
      const next = prev.filter((c) => c.id !== id);
      void saveMqttConfigs(next);
      return next;
    });
    setStatuses((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (activeId === id) setActiveId((_prev) => configs.find((c) => c.id !== id)?.id ?? null);
  };

  const toggleGroup = (gid: string) => setOpenGroups((p) => ({ ...p, [gid]: !p[gid] }));

  const addGroup = () => {
    setGroupName('');
    setShowGroupDialog(true);
  };

  const confirmAddGroup = () => {
    const name = groupName.trim();
    if (!name) return;
    const id = `g_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setGroups((prev) => {
      const next = [...prev, { id, name }];
      void saveMqttGroups(next);
      return next;
    });
    setOpenGroups((p) => ({ ...p, [id]: true }));
    setShowGroupDialog(false);
  };

  const groupList = useMemo(() => groups, [groups]);

  return (
    <div className={styles.appShell}>
      <div className={styles.side}>
        <div className={styles.sideHeader}>
          <div className={styles.sideTitle}>MQTT</div>
          <div className={styles.sideActions}>
            <button className={styles.sideBtn} onClick={addGroup} title={t('addGroup')}>
              <VscFolder />
            </button>
            <button className={styles.sideBtn} onClick={openAdd} title={t('addClient')}>
              <VscAdd />
            </button>
          </div>
        </div>

        <div className={styles.sideList}>
          {ungrouped.map((c) => {
            const st = statuses[c.id] ?? 'disconnected';
            return (
              <div
                key={c.id}
                className={`${styles.connRow} ${activeId === c.id ? styles.connRowActive : ''}`}
                onClick={() => setActiveId(c.id)}
              >
                <span className={`${styles.statusDot} ${styles[`dot_${st}`]}`} />
                <div className={styles.connName}>{c.name || '(unnamed)'}</div>
                <div className={styles.connDesc}>
                  {c.protocol}
                  {c.host}:{c.port}
                </div>
              </div>
            );
          })}
          {groupList.map((g) => {
            const gid = g.id;
            const open = openGroups[gid] ?? true;
            const items = grouped[gid] ?? [];
            return (
              <div className={styles.groupRow} key={gid}>
                <button className={styles.groupHeader} onClick={() => toggleGroup(gid)}>
                  <div className={styles.groupLeft}>
                    <span className={`${styles.groupArrow} ${open ? styles.groupArrowOpen : ''}`}>▶</span>
                    <span className={styles.groupName}>{g.name}</span>
                    <span className={styles.groupCount}>({items.length})</span>
                  </div>
                </button>
                {open &&
                  items.map((c) => {
                    const st = statuses[c.id] ?? 'disconnected';
                    return (
                      <div
                        key={c.id}
                        className={`${styles.connRow} ${activeId === c.id ? styles.connRowActive : ''}`}
                        onClick={() => setActiveId(c.id)}
                      >
                        <span className={`${styles.statusDot} ${styles[`dot_${st}`]}`} />
                        <div className={styles.connName}>{c.name || '(unnamed)'}</div>
                        <div className={styles.connDesc}>
                          {c.protocol}
                          {c.host}:{c.port}
                        </div>
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>

      <div className={styles.content}>
        {!activeConfig && <div className={styles.emptyState}>{t('noSubscriptions')}</div>}
        {activeConfig && (
          <MqttWorkspace
            key={activeConfig.id}
            config={activeConfig}
            status={statuses[activeConfig.id] ?? 'disconnected'}
            onEdit={openEdit}
            onCopy={copyConfig}
            onDelete={deleteConfig}
          />
        )}
      </div>

      {showEditor && (
        <MqttConfigDialog
          config={editingId ? (configs.find((c) => c.id === editingId) ?? undefined) : undefined}
          groups={groups}
          onSave={saveConfig}
          onClose={() => setShowEditor(false)}
        />
      )}

      {showGroupDialog && (
        <div className={styles.overlay} onClick={() => setShowGroupDialog(false)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.dialogTitle}>{t('addGroup')}</div>
            <label className={styles.dialogLabel}>{t('groupName')}</label>
            <input
              className={styles.dialogInput}
              value={groupName}
              placeholder={t('groupNamePlaceholder')}
              onChange={(e) => setGroupName(e.target.value)}
            />
            <div className={styles.dialogBtns}>
              <button className={styles.dialogBtn} onClick={() => setShowGroupDialog(false)}>
                {t('cancel')}
              </button>
              <button className={`${styles.dialogBtn} ${styles.dialogBtnPrimary}`} onClick={confirmAddGroup}>
                {t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteId && (
        <div className={styles.overlay} onClick={() => setConfirmDeleteId(null)}>
          <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.dialogTitle}>{t('deleteConfirmTitle')}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
              {t('deleteConfirmMsg', { name: configs.find((c) => c.id === confirmDeleteId)?.name ?? '' })}
            </div>
            <div className={styles.dialogBtns}>
              <button className={styles.dialogBtn} onClick={() => setConfirmDeleteId(null)}>
                {t('cancel')}
              </button>
              <button className={`${styles.dialogBtn} ${styles.dialogBtnPrimary}`} onClick={confirmDelete}>
                {t('delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
