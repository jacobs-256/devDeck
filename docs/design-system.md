# Design System & Layout — Aurora

DevDeck uses the **Aurora (Spectrum)** design language, selected in the
2026.11 UI review. It replaces the legacy zinc/emerald palette. The shipped
tokens live in
[`apps/desktop/src/theme/variables.css`](../apps/desktop/src/theme/variables.css).
This document and `AGENTS.txt` are the design reference; the one-off 2026.11
review prototypes were removed after the direction was adopted.

The layout keeps the original Electron structure. Aurora changes the visual
language — colour, glass surfaces, radii, gradients and density — not the
information architecture.

## Layout

```
┌────────────┬──────────────────────────────────────────────────────────┐
│ sidebar    │ page                                                     │
│ 210 / 52   │ dashboard · tools · modules · settings                   │
└────────────┴──────────────────────────────────────────────────────────┘
```

### Sidebar

- 210px expanded, 52px collapsed; the footer toggles collapse (`‹` / `›`).
- Primary navigation: **Dashboard · Tools · Marketplace · Settings**, 36px
  rows, 10px radius. The active row is a violet→cyan gradient pill with white
  icon/text and a soft violet shadow.
- The Tools page also lists categories: **All Tools, Developer, Text, Network,
  Security**, each with a category dot, label and count.
- Background `--bg-sidebar` (translucent glass) with `--glass-border` on the
  right; labels are hidden when collapsed and shown as tooltips.
- Expanded width is set in `AppShell.tsx`; keep it at 210px.

### Pages

| Page        | Structure                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------------- |
| Dashboard   | Header (kicker, search, greeting, date), category pills, frequent-tool cards, app/screen/runtime info widgets |
| Tools       | 252px tool list + workspace (46px tab bar, 58px tool header, content)                                         |
| Marketplace | Header (Module Center, counts, Refresh), registry bar, Installed/Marketplace tabs, filters, plugin list rows  |
| Settings    | Single scroll: heading, mono section labels, grouped glass rows, segmented theme/language/text-size controls  |

Dashboard content is capped at 1180px with `30px 34px 44px` padding; Settings is
capped at 1000px. Tools and Marketplace are full-bleed workbenches. Opening a
tool collapses the main sidebar (legacy behaviour); the fullscreen button hides
both sidebars. Open tool tabs stay mounted.

## Colour

Aurora is a deep indigo field lit by a violet→cyan wash. The interface stays
dark-first but the light theme is a first-class, separately tuned palette.

| Token                | Dark                     | Light                   | Use                        |
| -------------------- | ------------------------ | ----------------------- | -------------------------- |
| `--bg-primary`       | `#080a14`                | `#f2f3fa`               | App field                  |
| `--bg-secondary`     | `rgba(255,255,255,.045)` | `rgba(255,255,255,.74)` | Glass cards / panels       |
| `--bg-tertiary`      | `rgba(255,255,255,.07)`  | `rgba(24,26,64,.05)`    | Inset wells, inputs        |
| `--bg-elevated`      | `#161a2e`                | `#ffffff`               | Menus, dialogs             |
| `--bg-sidebar`       | `rgba(20,22,42,.72)`     | `rgba(255,255,255,.72)` | Sidebar glass              |
| `--border-default`   | `rgba(255,255,255,.09)`  | `rgba(24,26,64,.10)`    | Hairlines                  |
| `--border-subtle`    | `rgba(255,255,255,.15)`  | `rgba(24,26,64,.17)`    | Control borders (stronger) |
| `--text-primary`     | `#eef0ff`                | `#15162a`               | Primary text               |
| `--text-secondary`   | `#b6bcd8`                | `#454a66`               | Secondary text             |
| `--text-tertiary`    | `#8d94b4`                | `#636a86`               | Descriptions / labels      |
| `--text-quaternary`  | `#666e8f`                | `#7f859c`               | Decorative metadata        |
| `--accent-primary`   | `#8b5cf6`                | `#6247e8`               | Emphasis, fills            |
| `--accent-secondary` | `#c4b5fd`                | `#7350d8`               | Icons, links, active text  |
| `--accent-success`   | `#34d399`                | `#0f9d6e`               | Success / valid            |
| `--accent-error`     | `#fb7185`                | `#d63a5c`               | Errors / destructive       |
| `--accent-warning`   | `#fbbf24`                | `#b26a00`               | Warnings                   |

Gradient: `--aurora-grad: linear-gradient(120deg, #6a3df0, #0a6f86)` and
`--aurora-grad-hover`. Use it only for primary actions, the active sidebar row,
selected segments, checked switches and one emphasized heading word. The
ambient field uses `--aurora-wash`, `--aurora-glow-1/2/3` on `#root`; do not
paint it per page.

Category accents:

| Token            | Dark      | Light     |
| ---------------- | --------- | --------- |
| `--cat-dev`      | `#22d3ee` | `#0e8fa8` |
| `--cat-text`     | `#a78bfa` | `#7350d8` |
| `--cat-network`  | `#fbbf24` | `#b26a00` |
| `--cat-security` | `#f472b6` | `#d4468f` |
| `--cat-other`    | `#94a3b8` | `#6f7894` |

Syntax highlighting uses `--syntax-key/string/number/boolean/null/punct`, not
category colours.

Glass: `--glass-bg`, `--glass-bg-strong`, `--glass-border`, `--glass-blur`,
`--shadow-card`, `--shadow-glow`. Apply blur to top-level panels/cards/dialogs,
not to every list row.

## Typography

- Sans: `Inter, -apple-system, "SF Pro Display", "Segoe UI", "PingFang SC", …`.
- Mono: `JetBrains Mono, "SF Mono", ui-monospace, Menlo, …`.
- Base 13px / 1.5; small 12px; meta 11px; micro-labels 8.5–9px uppercase mono
  with 0.14–0.16em tracking.
- Page titles 24–30px / 650 / tight tracking; dashboard 30px, settings 24px.
- Section headings 13–14px / 650. Tool names 12–13px / 500–600.
- Use `font-variant-numeric: tabular-nums` for numbers and crypto material.

## Shape and spacing

- Spacing base 4px; page padding 30–34px; card padding 14–16px.
- Radii: `--radius` 14px for cards/panels, `--radius-small` 9px for controls,
  `999px` for pills/badges. Sidebar nav 10px.
- Shadows: `--shadow-card` at rest, `--shadow-glow` on hover. Never use heavy
  black drop shadows.
- The app shell is full-bleed (no floating outer frame); glass panels provide
  the depth.

## Components

### Buttons

- Primary: 9px radius, gradient fill, white text, subtle violet shadow.
- Secondary: glass fill + 1px border; hover border `--accent-secondary`.
- Ghost/icon: transparent; hover `--bg-hover`; 28–32px square.
- Hover 140ms; focus 2px outline + 3–4px soft ring; disabled 45–60% opacity.

### Form controls

- Inputs/selects: 30–36px tall, 9–10px radius, `--glass-bg-strong`, 1px border.
- Focus: border `--border-focus` plus a 3px `--accent-color-weak` ring.
- Labels 11–12px `--text-tertiary`; tool forms use `.field`, `.field-row`,
  `.field.compact` (148px), `.field.grow`.
- Checkboxes/radios use `accent-color: var(--accent-primary)`.

### Cards and lists

- Cards 16px radius, glass, 1px border, shadow; hover lifts 2px + glow.
- Plugin rows: 16px radius, 40px icon tile, name + version + category pill,
  description, action row.
- Tool list rows: 28px icon tile, name + 2-line description, 9px radius;
  active row uses the category tint with a 2px left rule.
- Dashboard tool cards: 16px radius, 36px icon tile, category label, 2-line
  description.
- Widgets: 16px radius, glass header, no coloured left bar; keep header icons in
  category colour.

### Tabs

- Tool tabs: compact pill tabs (9px radius) in a 46px glass bar. Active tab has
  an accent-tinted surface and border; the old bottom line is removed.
- Marketplace tabs: pill-style with count badges; active uses accent tint.
- Keep the overflow menu with “Close All”.

### Dialogs, menus and tooltips

- Dialogs: 18px radius (`--radius-dialog`), opaque `--bg-elevated`, scrim + blur
  (`--scrim`, `--scrim-blur`), glass border and `--shadow-float`. Close on
  Escape and backdrop click; use `role="dialog"` / `aria-modal="true"`.
- Menus/popovers: 14px radius, elevated surface, glass border, `--shadow-float`;
  no native browser dialogs (`window.prompt`, `confirm`, `alert`) in the UI.
- Tooltips: shared `data-tip` pattern with 10px radius, elevated surface, glass
  border and `--shadow-float`. Native `title` is only a fallback.

## Motion

- `--motion-fast` 140ms; `--motion-base` 200ms; `cubic-bezier(.22,1,.36,1)`.
- Hover lift ≤2px; dialogs fade/scale ≤4px; no looping background animation.
- Disable transforms and animations under `prefers-reduced-motion`.

## Accessibility

- Body text ≥ 4.5:1; gradient text only for decorative emphasis.
- Focus must remain visible on glass surfaces; never remove the ring.
- Category colour is always paired with text/icon.
- Keep `Cmd/Ctrl+K`, `Cmd/Ctrl+,`, arrow navigation and `Esc` working.
- Test 1440×900, 1280×800 and 1024×768, plus both languages.
- Dense 3-column tools use `repeat(auto-fit, minmax(560px, 1fr))` and stack at
  ≤1400px; split editor/result and server/client panes stack at ≤1300px when
  their headers or input rows stop fitting; 2-column detail grids stack at
  ≤1200px. No horizontal page scroll at 1024px.

## Plugin theming

Plugins load `marketplace/shared/devdeck-embed.css`, which imports the mirrored
tokens in `marketplace/shared/theme/*`. `followHostTheme()` applies
`data-theme`. Plugins must use host tokens, support both themes, and not assume
`backdrop-filter` exists. Keep the mirror in sync with app tokens.

## Implementation map

| Path                                                                              | Responsibility                            |
| --------------------------------------------------------------------------------- | ----------------------------------------- |
| [`apps/desktop/src/theme/variables.css`](../apps/desktop/src/theme/variables.css) | Aurora tokens (source of truth)           |
| `apps/desktop/src/theme/global.css`                                               | Root field, reset, focus, motion          |
| `apps/desktop/src/theme/toolkit.css`                                              | Shared `dtb-*` primitives                 |
| `apps/desktop/src/styles/tool-compat.css`                                         | Controls shared by all ported tools       |
| `apps/desktop/src/legacy/*.module.css`                                            | Shell, dashboard, tools, market, settings |
| `marketplace/shared/theme/*`                                                      | Plugin token mirror                       |
| [`AGENTS.txt`](../AGENTS.txt)                                                     | Mandatory rules for future modules        |

## Keyboard shortcuts

| Shortcut                         | Action                                               |
| -------------------------------- | ---------------------------------------------------- |
| `Cmd/Ctrl+K`                     | Toggle global tool search                            |
| `Cmd/Ctrl+,`                     | Open Settings                                        |
| `Cmd/Ctrl+W`                     | Close the active tool tab                            |
| `Esc`                            | Close search/dialog, exit fullscreen, close tab menu |
| `↑` / `↓` / `Enter`              | Navigate and open search results                     |
| `Cmd/Ctrl+F`                     | JSON Formatter find · MQTT filter                    |
| `Enter`                          | Ping probe · Tracert trace                           |
| `Cmd/Ctrl+C/V/X/A`, `Cmd/Ctrl+Z` | Native edit roles                                    |
| `Cmd+Q`                          | Quit (macOS)                                         |

The native menu exposes Settings, theme, language, Edit roles and About.
