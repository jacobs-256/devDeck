# Design System & Layout

DevToolBox keeps the layout and visual language of the original Electron app
(`main` branch). The Rust/Tauri host only changes the plumbing; the interface
should be indistinguishable from the pre-rewrite build.

## Layout

```
┌────────────┬──────────────────────────────────────────────────────────┐
│ sidebar    │ page                                                     │
│ 180 / 52   │ dashboard · tools · modules · settings                   │
└────────────┴──────────────────────────────────────────────────────────┘
```

### Sidebar

- Width 180px expanded, 52px collapsed; the footer toggles collapse (`‹` / `›`).
- Primary navigation: **Dashboard · Tools · Marketplace · Settings**, each with
  a VS Code icon, 34px row, 10px radius and a 3px left accent indicator when
  active.
- On the Tools page the sidebar also lists categories: **All Tools, Developer
  Tools, Text Tools, Network Tools, Security & Crypto, Other Tools**, each with a
  color dot/icon, label, and module count.
- Collapsed mode keeps icons only; labels appear as hover tooltips.
- Background `--bg-secondary`, right border `--border-default`.

### Pages

| Page        | Structure                                                                                                                 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| Dashboard   | Header (kicker, search, title, date), category quick-nav, frequent-tool card grid, app/screen/runtime info widgets        |
| Tools       | 252px tool list panel + workspace (tab bar, 56px tool header, content area)                                               |
| Marketplace | Header (Module Center, counts, Refresh), registry bar, Installed/Marketplace tabs, category select + search, module cards |
| Settings    | 196px secondary navigation + content column with header and cards                                                         |

The tools workspace uses a two-column split: the list panel stays fixed while
the workspace scrolls. Opening a tool collapses the main sidebar (legacy
behaviour), and the fullscreen button in the tool header hides both sidebars.
Tabs keep opened tools mounted so state survives switching.

## Color

Tokens live in [`apps/desktop/src/theme/variables.css`](../apps/desktop/src/theme/variables.css)
and are mirrored for plugins in `marketplace/shared/theme/variables.css`.

| Token                | Dark      | Light     | Use                          |
| -------------------- | --------- | --------- | ---------------------------- |
| `--bg-primary`       | `#0d1117` | `#fafbfc` | App/page background          |
| `--bg-secondary`     | `#161b22` | `#f0f3f6` | Sidebar, panels, cards       |
| `--bg-tertiary`      | `#21262d` | `#e4e9ed` | Inputs, code blocks, widgets |
| `--bg-elevated`      | `#1c2128` | `#ffffff` | Floating menus, dialogs      |
| `--bg-hover`         | `#30363d` | `#d8dde3` | Hover                        |
| `--border-default`   | `#21262d` | `#c2c9d1` | Default borders              |
| `--border-subtle`    | `#30363d` | `#d4d9df` | Control borders              |
| `--border-emphasis`  | `#484f58` | `#9ca3ab` | Strong borders               |
| `--text-primary`     | `#e6edf3` | `#0f1419` | Primary text                 |
| `--text-secondary`   | `#cdd9e5` | `#57606a` | Secondary text               |
| `--text-tertiary`    | `#8b949e` | `#6e7781` | Labels                       |
| `--text-quaternary`  | `#6e7681` | `#818b98` | Descriptions, meta           |
| `--accent-primary`   | `#1f6feb` | `#0969da` | Primary actions              |
| `--accent-secondary` | `#58a6ff` | `#218bff` | Icons, links, active nav     |
| `--accent-success`   | `#3fb950` | `#1a7f37` | Success                      |
| `--accent-error`     | `#f85149` | `#d1242f` | Errors, destructive          |
| `--accent-warning`   | `#e3b341` | `#9a6700` | Warnings                     |

Category accents: `--cat-dev` blue, `--cat-text` green, `--cat-network` orange,
`--cat-security` purple, `--cat-other` yellow. They tint icons, pills and active
rows at 8–15% opacity.

## Typography

- Sans: `Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui`.
- Mono: `JetBrains Mono, "Fira Code", "Cascadia Code", "SF Mono", Consolas`.
- Base 13px / 1.5; small 12px; meta 11px; page titles 21px, card titles 13px.
- Tool headers 15px semibold; sidebar labels 12.5px.

## Components

### Buttons

Legacy buttons are compact and flat: 30–34px tall, 8–10px radius, 12px labels.

| Variant                              | Usage                          |
| ------------------------------------ | ------------------------------ |
| Primary (`--accent-primary` fill)    | Install, Refresh, save actions |
| Secondary (`--bg-tertiary` + border) | Tool actions, filters          |
| Ghost / icon                         | Tabs, close, copy, overflow    |
| Danger                               | Uninstall/remove               |

Hover raises the surface to `--bg-hover`; focus uses a 2px
`--border-focus` outline. Disabled controls drop to ~45–60% opacity.

### Form controls

- Inputs/selects: 32px tall, `--bg-tertiary`, 1px `--border-subtle`, 8px radius.
- Focus: border switches to `--border-focus` with a 1px outline.
- Labels sit above controls at 12px `--text-quaternary`.
- Tool forms use `.field`, `.field-row`, `.field.compact` (148px), `.field.grow`.
- Checkboxes/radios use the accent color.

### Cards and lists

- Module cards: 12px radius, `--bg-secondary`, 1px border, icon tile, title,
  version/category pills, description, action row.
- Tool list rows: 42px icon tile + name + 2-line description; active row gets a
  colored left border and `--bg-secondary`.
- Dashboard tool cards: 12px radius, hover border + shadow, category pill.
- Widgets: colored 3px left border, header with icon/title, body grid.

### Tabs

- Tool tabs: compact browser-style tabs, category-colored icon, close button,
  active line at the bottom, overflow menu with “Close All”.
- Marketplace tabs: underline style with count pills.

## Keyboard shortcuts

Shortcuts follow the Electron app exactly.

| Shortcut                          | Action                                                    |
| --------------------------------- | --------------------------------------------------------- |
| `Cmd/Ctrl+K`                      | Toggle global tool search                                 |
| `Cmd/Ctrl+,`                      | Open Settings                                             |
| `Cmd/Ctrl+W`                      | Close the active tool tab                                 |
| `Esc`                             | Close search/dialog, exit tool fullscreen, close tab menu |
| `↑` / `↓`                         | Move through search results                               |
| `Enter`                           | Open the selected search result                           |
| `Cmd/Ctrl+F`                      | JSON Formatter: find in output · MQTT: filter messages    |
| `Enter`                           | TCP Ping: run probe · Tracert: trace route                |
| `Cmd/Ctrl+C` / `V` / `X` / `A`    | Copy / paste / cut / select all (native menu roles)       |
| `Cmd/Ctrl+Z` / `Shift+Cmd/Ctrl+Z` | Undo / redo (native menu roles)                           |
| `Cmd+Q`                           | Quit (macOS)                                              |
| `Tab` / `Shift+Tab`               | Move focus between controls                               |

The native menu exposes Settings (`Cmd+,`), theme, language, Edit roles, and
About. Menu events are forwarded to the renderer as `menu:action`,
`menu:theme`, and `menu:language`.

## Plugin theming

Plugins load `marketplace/shared/devtoolbox-embed.css`, which imports the same
legacy token file and toolkit (buttons, inputs, cards, code highlighting). They
switch with `<html data-theme="light">`, applied by `followHostTheme()`.

## Implementation map

| Path                                        | Responsibility                                       |
| ------------------------------------------- | ---------------------------------------------------- |
| `apps/desktop/src/theme/variables.css`      | Color tokens and typography variables                |
| `apps/desktop/src/theme/global.css`         | Reset, scrollbars, animations, utility output colors |
| `apps/desktop/src/theme/toolkit.css`        | Shared plugin primitives                             |
| `apps/desktop/src/legacy/AppShell.tsx`      | Sidebar, navigation, categories                      |
| `apps/desktop/src/legacy/ToolsPage.tsx`     | Tool list, tabs, header, workspace                   |
| `apps/desktop/src/legacy/DashboardPage.tsx` | Dashboard                                            |
| `apps/desktop/src/legacy/ModulesPage.tsx`   | Marketplace                                          |
| `apps/desktop/src/legacy/SettingsPage.tsx`  | Settings                                             |
| `apps/desktop/src/legacy/GlobalSearch.tsx`  | `Cmd/Ctrl+K` search dialog                           |
| `apps/desktop/src/styles/tool-compat.css`   | Control styling for ported tool bodies               |
| `apps/desktop/src-tauri/src/lib.rs`         | Native menu and accelerators                         |

## Checklist

- [ ] New UI matches the legacy spacing, typography, and palette.
- [ ] Sidebar collapses to 52px and keeps categories usable.
- [ ] Tools open in tabs and survive switching.
- [ ] Shortcuts in the table still work (including tool-specific ones).
- [ ] Light and dark themes both look correct.
- [ ] Plugin UI uses the shared toolkit.

## Related

- [Development guide](development.md) — adding tools, commands, capabilities
- [Architecture overview](architecture/overview.md)
