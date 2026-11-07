import { Suspense, useMemo, useState } from 'react';
import { useI18n } from '../i18n';
import { filterTools, groupTools, TOOLS } from './registry';
import { CATEGORY_KEYS } from './types';

export default function ToolsView() {
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string>(TOOLS[0]?.id ?? '');

  const filtered = useMemo(
    () =>
      filterTools(query, (tool) => [
        t(tool.nameKey),
        t(tool.descriptionKey),
        t(CATEGORY_KEYS[tool.category]),
      ]),
    [query, t],
  );
  const groups = useMemo(() => groupTools(filtered), [filtered]);
  const active = filtered.find((tool) => tool.id === activeId) ?? filtered[0] ?? null;
  const ActiveTool = active?.component;

  return (
    <div className="tools-layout">
      <aside className="tool-list">
        <input
          type="search"
          placeholder={t('tools.search')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        {groups.map((group) => (
          <div key={group.category} className="tool-group">
            <div className="tool-group-title">{t(CATEGORY_KEYS[group.category])}</div>
            {group.items.map((tool) => (
              <button
                key={tool.id}
                type="button"
                className={active?.id === tool.id ? 'tool-item active' : 'tool-item'}
                onClick={() => setActiveId(tool.id)}
              >
                <span>{t(tool.nameKey)}</span>
              </button>
            ))}
          </div>
        ))}

        {filtered.length === 0 ? <p className="muted small">{t('tools.noMatch', { query })}</p> : null}
      </aside>

      <section className="tool-panel">
        {active && ActiveTool ? (
          <>
            <header className="tool-panel-header">
              <div>
                <h2>{t(active.nameKey)}</h2>
                <p className="muted small">{t(active.descriptionKey)}</p>
              </div>
              <span className="badge">{t(CATEGORY_KEYS[active.category])}</span>
            </header>
            <Suspense fallback={<p className="muted">{t('tools.loading')}</p>}>
              <ActiveTool />
            </Suspense>
          </>
        ) : (
          <div className="empty">
            <h2>{t('tools.noneTitle')}</h2>
            <p className="muted">{t('tools.noneBody')}</p>
          </div>
        )}
      </section>
    </div>
  );
}
