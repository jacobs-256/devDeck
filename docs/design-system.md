# Design System

DevToolBox is a dense, keyboard-friendly desktop tool. The interface should feel
calm and precise: neutral surfaces, one accent, clear hierarchy, and controls
that behave the same everywhere. Plugins inherit the same tokens so the product
looks like one application.

## Principles

1. **Content first.** Chrome recedes: low-contrast borders, quiet surfaces, one
   accent reserved for actions, links, and focus.
2. **Dense but legible.** 13–14px base text, 8px spacing rhythm, comfortable hit
   targets (34px controls, 28px segmented items).
3. **Themeable by tokens.** No hardcoded colors in components; dark and light
   are the same design with different token values.
4. **Predictable controls.** Every button, input, tab, and badge has the same
   height, radius, and focus treatment.
5. **Plugins are guests with the same taste.** Marketplace iframes use the
   mirrored token set in `marketplace/shared/theme/`.

## Brand

- Wordmark: **DevToolBox**, semibold, 15px in the sidebar.
- Mark: 32×32 rounded square, 6px radius, subtle shadow.
- Accent: blue. Use it for primary actions, active navigation, links, and focus.
  Never use it for large backgrounds or decorative fills.

## Color tokens

Defined in [`apps/desktop/src/styles/tokens.css`](../apps/desktop/src/styles/tokens.css).
Semantic names only; components never reference raw hex values.

| Token                       | Dark                              | Light                             | Use                                |
| --------------------------- | --------------------------------- | --------------------------------- | ---------------------------------- |
| `--bg`                      | `#0a0e15`                         | `#f4f6fa`                         | App background                     |
| `--bg-subtle`               | `#0d121b`                         | `#eef2f8`                         | Sidebar gradient end               |
| `--bg-elevated`             | `#121826`                         | `#ffffff`                         | Cards, panels, dialogs             |
| `--surface-2`               | `#172033`                         | `#f7f9fd`                         | Inputs, nested cards, hover rows   |
| `--surface-3`               | `#1e293d`                         | `#eef2f9`                         | Active segmented item, code blocks |
| `--bg-hover`                | `#1b2435`                         | `#e9eefa`                         | Hover backgrounds                  |
| `--border`                  | `#253048`                         | `#dde4ef`                         | Default borders                    |
| `--border-strong`           | `#33415c`                         | `#c5d0e2`                         | Hover borders, dashed empty states |
| `--text`                    | `#e8edf7`                         | `#111a2c`                         | Primary text                       |
| `--text-muted`              | `#9aa7bd`                         | `#59667c`                         | Secondary text, labels             |
| `--text-faint`              | `#6d7b92`                         | `#7d8aa0`                         | Placeholders, meta                 |
| `--accent`                  | `#6ea0ff`                         | `#1f5fe0`                         | Links, active states, focus        |
| `--accent-strong`           | `#2f6fed`                         | `#2563eb`                         | Primary button background          |
| `--accent-soft`             | 14% blue                          | 10% blue                          | Selected/active backgrounds        |
| `--ok` / `--warn` / `--bad` | `#3ddc97` / `#f4b74a` / `#ff6b7a` | `#0f8a5f` / `#9a6400` / `#c62d43` | Status text and borders            |
| `--overlay`                 | 65% black                         | 40% slate                         | Dialog backdrop                    |

Status colors always pair a tinted background (`--ok-soft`, `--warn-soft`,
`--bad-soft`) with the matching text color; never use them for large areas.

## Typography

| Token         | Size | Use                         |
| ------------- | ---- | --------------------------- |
| `--text-xs`   | 11px | Badges, table headers, meta |
| `--text-sm`   | 12px | Labels, helper text, tables |
| `--text-base` | 14px | Body copy, controls         |
| `--text-md`   | 15px | Card titles, sidebar brand  |
| `--text-lg`   | 18px | Tool titles, dialog titles  |
| `--text-xl`   | 22px | Section headings            |
| `--text-2xl`  | 28px | Page title                  |

- Sans stack: system UI + Noto Sans SC / PingFang / Microsoft YaHei.
- Mono stack: system monospace; used for payloads, PEM, IPs, diffs, logs.
- Weights: 400 body, 500 labels/buttons, 600 headings, 680 page titles.
- Line height: 1.55 body, 1.25 headings.

## Spacing and shape

- Spacing scale: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 (`--space-1` … `--space-10`).
- Radii: `--radius-sm` 6, `--radius` 10, `--radius-lg` 14, `--radius-xl` 18,
  full pills.
- Control height: `--control-height` 34px.
- Sidebar: `--sidebar-width` 248px. Content max width: `--content-max` 1280px.

## Elevation and motion

- `--shadow-sm`: cards, active tabs, primary buttons.
- `--shadow-md`: hovered plugin cards.
- `--shadow-lg`: dialogs.
- Transitions: 120ms for hover/focus, 180ms for card elevation.
- Focus ring: 3px `--focus-ring` + accent border. Never remove focus styling.
- Honor `prefers-reduced-motion`: transitions collapse to ~0ms.

## Layout

```
┌──────────────┬─────────────────────────────────────────────┐
│ sidebar 248  │ content (max 1280, padding 32/36)           │
│ brand        │ header: title + subtitle      actions      │
│ nav          │ tabs / filters                             │
│ version      │ cards / tools layout                       │
│ footer       │                                            │
└──────────────┴─────────────────────────────────────────────┘
```

- **Shell:** CSS grid, sidebar fixed width, content scrolls independently.
- **Header:** title 28px, subtitle 14px muted, max 72ch; actions wrap on narrow
  widths.
- **Marketplace:** auto-fill grid, minimum card width 320px; filters sit above
  the grid (search grows, category select min 160px).
- **Tools:** two columns — navigator 236px and panel; both are elevated cards.
  Panels use a header row with title, description, and category badge.
- **Breakpoints:** 1080px (narrower sidebar), 900px (sidebar becomes a top bar,
  tool navigator stacks), 640px (single-column cards, stacked header).

## Components

### Buttons

| Variant            | Usage                                                  |
| ------------------ | ------------------------------------------------------ |
| `button.primary`   | One per view/section: install, connect, generate, save |
| `button` (default) | Secondary actions with a border and surface            |
| `button.ghost`     | Low-emphasis actions, filters, copy                    |
| `button.danger`    | Destructive actions (remove, uninstall)                |
| `button.link`      | Inline text actions                                    |

- Height 34px, padding 0 13px, radius 10px, 13px/500 label.
- Hover: border strengthens and background lifts. Active: 1px translate.
- Disabled: 45% opacity, no pointer events.
- Icon + label gap: 6px. Do not create icon-only buttons without an aria-label.

### Form controls

- Inputs/selects: 34px tall, surface-2 background, 1px border, 10px radius.
- Focus: accent border + 3px ring; never rely on outline alone.
- Textareas: 9/11px padding, min 96px, vertical resize.
- Labels sit above controls (`field-label`, 12px/500 muted); required fields add
  `*` in the label, not a separate asterisk.
- `.field-row` bottom-aligns controls; wrap on narrow widths.
- `.field.compact` is 148px for ports/counts; `.field.grow` takes remaining space.
- Checkboxes use the accent color and keep a 15px box; label is clickable.

### Segmented control and tabs

- `.segmented` for mutually exclusive modes inside a tool (Encode/Decode).
- `.tabs` for page-level sections (Catalog/Installed); active tab is an elevated
  pill on the surface-2 track.

### Badges and tags

- Badges: 21px pills, 11px/500; variants `ok`, `warn`, `bad`.
- Tags: mono 11px for permissions, domains, env vars.
- Never encode status by color alone — keep the text (`valid`, `expired`).

### Cards, tables, notices

- Cards: 14px radius, 20px padding, 1px border, shadow-sm. Plugin cards lift on
  hover.
- Tables: 12px text, uppercase 11px headers, row hover, no vertical borders.
- Notices: left accent bar; error notices use the error color and tint.
- Empty states: dashed border, 40px padding, centered title + hint.

### Dialogs

- 740px max width, 18px radius, backdrop blur, shadow-lg.
- Header (title + close), scrollable body, footer aligned right with
  Cancel + Primary.
- Permission rows: title, mono id, `privileged`/`unavailable` badges, summary;
  privileged rows use warning tint.

### Tool navigator

- Search on top, groups with uppercase 11px labels.
- Items 34px, 8px radius; active item uses accent-soft background and accent text.
- Panel shows title, one-line description, category badge, and a divider.

## Accessibility

- Text contrast ≥ 4.5:1 for body, ≥ 3:1 for large text and UI borders.
- Every interactive element is reachable by keyboard and has a visible
  `:focus-visible` state.
- Buttons and inputs are at least 34px tall; checkbox hit area includes label.
- Use semantic elements (`button`, `nav`, `main`, `header`, `dl`) and
  `aria-current="page"` for active navigation.
- Status is always conveyed with text, not just color.
- Respect reduced motion.

## Plugin theming

Plugins load `marketplace/shared/devtoolbox-embed.css`, which imports
`theme/variables.css` and `theme/toolkit.css`.

- `data-theme="light"` on `<html>` switches tokens; the SDK's `followHostTheme()`
  applies it.
- Use `--bg-*`, `--text-*`, `--accent-*`, `--border-*`, `--radius`, and font
  variables. Never hardcode hex colors.
- Toolkit helpers: `.dtb-card`, `.dtb-input`, `.dtb-button`, `.dtb-muted`.
- Plugin-specific styles may define layout, but controls should match the
  toolkit height/radius/focus behavior.

## Implementation map

| File                                     | Responsibility                                 |
| ---------------------------------------- | ---------------------------------------------- |
| `apps/desktop/src/styles/tokens.css`     | Color, type, spacing, motion tokens            |
| `apps/desktop/src/styles/base.css`       | Reset, typography, focus, scrollbars           |
| `apps/desktop/src/styles/layout.css`     | Shell, sidebar, content, grids, breakpoints    |
| `apps/desktop/src/styles/components.css` | Buttons, forms, cards, tabs, tables, dialogs   |
| `apps/desktop/src/styles/tools.css`      | Tool navigator, previews, markdown, diff, logs |
| `marketplace/shared/theme/variables.css` | Plugin mirror of the token set                 |
| `marketplace/shared/theme/toolkit.css`   | Shared plugin primitives                       |

## Checklist for new UI

- [ ] Uses tokens, not raw colors or ad-hoc font sizes.
- [ ] Primary action is unique and visually dominant.
- [ ] Labels, placeholders, and errors are distinguishable without color alone.
- [ ] Focus is visible; keyboard order matches visual order.
- [ ] Works in both themes and at 960px and 1280px widths.
- [ ] Empty, loading, and error states are designed.
- [ ] Plugin UI uses the toolkit and inherits tokens.
