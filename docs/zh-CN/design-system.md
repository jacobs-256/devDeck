# 设计规范与界面布局 — 极光 Aurora

DevDeck 使用 **Aurora（极光 / Spectrum）** 设计语言，该方案在 2026.11 的界面评审中选定，
取代旧的锌灰 / 翡翠绿配色。Token 以
[`apps/desktop/src/theme/variables.css`](../../apps/desktop/src/theme/variables.css)
为准；本文档与 `AGENTS.txt` 为设计依据。2026.11 的一次性评审原型在方案确定后已移除。

Aurora 保留原 Electron 应用的信息架构，只替换视觉语言：颜色、玻璃表面、圆角、渐变与密度。

## 布局

```
┌────────────┬──────────────────────────────────────────────────────────┐
│ 侧边栏     │ 页面                                                     │
│ 210 / 52   │ 首页 · 工具 · 应用市场 · 设置                             │
└────────────┴──────────────────────────────────────────────────────────┘
```

### 侧边栏

- 展开 210px、收起 52px；底部按钮切换折叠（`‹` / `›`）。
- 主导航：**首页 · 工具 · 应用市场 · 设置**，36px 行高、10px 圆角。激活项为紫→青渐变胶囊，
  白色图标与文字，并带柔和紫色投影。
- 工具页额外显示分类：**全部工具、开发工具、文本工具、网络工具、安全与加密**，
  带分类圆点、名称与数量。
- 背景使用 `--bg-sidebar` 玻璃色，右侧 `--glass-border`；收起时只保留图标与悬停提示。
- 展开宽度在 `AppShell.tsx` 中设置，保持 210px。

### 页面结构

| 页面     | 结构                                                                                   |
| -------- | -------------------------------------------------------------------------------------- |
| 首页     | 页头（小标题、搜索、欢迎语、日期）、分类胶囊、常用工具卡片、应用/屏幕/运行环境玻璃卡片 |
| 工具     | 252px 工具列表面板 + 工作区（46px 标签栏、58px 工具头、内容区）                        |
| 应用市场 | 页头（Module Center、计数、刷新）、注册表栏、已安装/市场标签、筛选、插件列表行         |
| 设置     | 单页滚动：标题、等宽分组标签、玻璃分组行、主题/语言/字号分段控件                       |

首页内容最大宽 1180px，内边距 `30px 34px 44px`；设置最大宽 1000px；工具与市场为
全宽工作区。打开工具时自动收起主侧边栏；全屏按钮隐藏两侧栏；标签页保持挂载。

## 颜色

Aurora 是深靛底色上的紫→青环境光，深色为默认，浅色是独立调校的一等主题。

| Token                | 深色                     | 浅色                    | 用途                 |
| -------------------- | ------------------------ | ----------------------- | -------------------- |
| `--bg-primary`       | `#080a14`                | `#f2f3fa`               | 应用底色             |
| `--bg-secondary`     | `rgba(255,255,255,.045)` | `rgba(255,255,255,.74)` | 玻璃卡片 / 面板      |
| `--bg-tertiary`      | `rgba(255,255,255,.07)`  | `rgba(24,26,64,.05)`    | 输入、内嵌区域       |
| `--bg-elevated`      | `#161a2e`                | `#ffffff`               | 菜单、对话框         |
| `--bg-sidebar`       | `rgba(20,22,42,.72)`     | `rgba(255,255,255,.72)` | 侧栏玻璃             |
| `--border-default`   | `rgba(255,255,255,.09)`  | `rgba(24,26,64,.10)`    | 发丝分隔线           |
| `--border-subtle`    | `rgba(255,255,255,.15)`  | `rgba(24,26,64,.17)`    | 控件边框（更强）     |
| `--text-primary`     | `#eef0ff`                | `#15162a`               | 主文字               |
| `--text-secondary`   | `#b6bcd8`                | `#454a66`               | 次文字               |
| `--text-tertiary`    | `#8d94b4`                | `#636a86`               | 描述 / 标签          |
| `--text-quaternary`  | `#666e8f`                | `#7f859c`               | 装饰性元数据         |
| `--accent-primary`   | `#8b5cf6`                | `#6247e8`               | 强调、填充           |
| `--accent-secondary` | `#c4b5fd`                | `#7350d8`               | 图标、链接、激活文字 |
| `--accent-success`   | `#34d399`                | `#0f9d6e`               | 成功 / 有效          |
| `--accent-error`     | `#fb7185`                | `#d63a5c`               | 错误 / 危险          |
| `--accent-warning`   | `#fbbf24`                | `#b26a00`               | 警告                 |

渐变：`--aurora-grad: linear-gradient(120deg, #6a3df0, #0a6f86)` 与
`--aurora-grad-hover`。只用于主操作、侧栏激活项、选中分段、开启的开关和一处强调标题文字。
环境光由 `#root` 上的 `--aurora-wash`、`--aurora-glow-1/2/3` 提供，不要逐页绘制。

分类色：

| Token            | 深色      | 浅色      |
| ---------------- | --------- | --------- |
| `--cat-dev`      | `#22d3ee` | `#0e8fa8` |
| `--cat-text`     | `#a78bfa` | `#7350d8` |
| `--cat-network`  | `#fbbf24` | `#b26a00` |
| `--cat-security` | `#f472b6` | `#d4468f` |
| `--cat-other`    | `#94a3b8` | `#6f7894` |

代码高亮使用 `--syntax-key/string/number/boolean/null/punct`，不复用分类色。

玻璃：`--glass-bg`、`--glass-bg-strong`、`--glass-border`、`--glass-blur`、
`--shadow-card`、`--shadow-glow`。`backdrop-filter` 只用于顶层面板、卡片、对话框，
不要用于每一行列表。

## 字体

- 无衬线：`Inter, -apple-system, "SF Pro Display", "Segoe UI", "PingFang SC", …`
- 等宽：`JetBrains Mono, "SF Mono", ui-monospace, Menlo, …`
- 正文 13px / 1.5；小字 12px；元数据 11px；微标签 8.5–9px 等宽大写，字距 0.14–0.16em。
- 页面标题 24–30px / 650 / 紧字距：首页 30px，设置 24px。
- 区块标题 13–14px / 650；工具名 12–13px / 500–600。
- 数字、证书与密钥信息使用 `tabular-nums`。

## 形状与间距

- 4px 间距基数；页面内边距 30–34px；卡片内边距 14–16px。
- 圆角：`--radius` 14px（卡片 / 面板）、`--radius-small` 9px（控件）、
  `999px`（胶囊 / 徽章）；侧栏导航 10px。
- 阴影：静置 `--shadow-card`，悬停 `--shadow-glow`；不要使用厚重的纯黑阴影。
- 外层不做悬浮边框，依靠玻璃面板建立层次。

## 组件

### 按钮

- 主按钮：9px 圆角、渐变填充、白字、柔和紫色阴影。
- 次按钮：玻璃底 + 1px 边框；悬停边框变为 `--accent-secondary`。
- Ghost / 图标按钮：透明，悬停 `--bg-hover`；尺寸 28–32px。
- 悬停 140ms；焦点 2px 描边 + 3–4px 柔光；禁用 45–60% 透明度。

### 表单

- 输入 / 下拉：30–36px 高，9–10px 圆角，`--glass-bg-strong`，1px 边框。
- 聚焦：边框 `--border-focus` + 3px `--accent-color-weak` 柔光。
- 标签 11–12px `--text-tertiary`；工具表单使用 `.field`、`.field-row`、
  `.field.compact`（148px）、`.field.grow`。
- 复选框 / 单选框使用 `accent-color: var(--accent-primary)`。

### 卡片与列表

- 卡片 16px 圆角、玻璃底、1px 边框、阴影；悬停上浮 2px + 柔光。
- 插件行：16px 圆角、40px 图标块、名称 + 版本 + 分类胶囊、描述、操作行。
- 工具列表：28px 图标块、名称 + 两行描述、9px 圆角；激活行使用分类色浅底 + 2px 左边线。
- 首页工具卡：16px 圆角、36px 图标块、分类标签、两行描述。
- 信息组件：16px 圆角、玻璃头部；不要使用 3px 彩色左边条。

### 标签页

- 工具标签：46px 玻璃栏中的胶囊标签（9px 圆角）；激活项使用强调色浅底 + 边框，
  不再使用底部下划线。
- 市场标签：胶囊样式 + 数量徽章，激活项使用强调色浅底。
- 保留溢出菜单与 “Close All”。

### 对话框、菜单与 Tooltip

- 对话框：18px 圆角（`--radius-dialog`）、不透明 `--bg-elevated`、遮罩 + 模糊
  （`--scrim` / `--scrim-blur`）、玻璃描边与 `--shadow-float`；支持 Esc 与点击遮罩
  关闭，并使用 `role="dialog"` / `aria-modal="true"`。
- 菜单 / 浮层：14px 圆角、抬升表面、玻璃描边、`--shadow-float`；界面中不得使用
  原生 `window.prompt`、`confirm`、`alert`。
- Tooltip：统一 `data-tip` 模式，10px 圆角、抬升表面、玻璃描边与
  `--shadow-float`；原生 `title` 仅作为回退。

## 动效

- `--motion-fast` 140ms；`--motion-base` 200ms；`cubic-bezier(.22,1,.36,1)`。
- 悬停位移不超过 2px；对话框淡入 + 缩放不超过 4px；不要循环背景动画。
- `prefers-reduced-motion` 下关闭位移动画。

## 无障碍

- 正文对比度 ≥ 4.5:1；渐变文字只用于装饰性强调。
- 玻璃表面上的焦点必须清晰可见，不得移除 focus ring。
- 分类色始终与文字 / 图标同时出现。
- 保持 `Cmd/Ctrl+K`、`Cmd/Ctrl+,`、方向键导航与 `Esc` 可用。
- 在 1440×900、1280×800、1024×768 与中英双语下验证。
- 密集三列工具使用 `repeat(auto-fit, minmax(560px, 1fr))`，≤1400px 时纵向堆叠；
  编辑器/结果、服务端/客户端双栏在标题或输入行放不下时 ≤1300px 堆叠；双列详情
  网格 ≤1200px 堆叠。1024px 下不得出现页面级横向滚动。

## 插件主题

插件加载 `marketplace/shared/devdeck-embed.css`，其中导入
`marketplace/shared/theme/*` 的镜像 token；`followHostTheme()` 设置 `data-theme`。
插件必须使用宿主 token、支持双主题，并且不能假设 `backdrop-filter` 一定可用。
修改应用 token 时必须同步镜像。

## 实现位置

| 路径                                                                                 | 职责                         |
| ------------------------------------------------------------------------------------ | ---------------------------- |
| [`apps/desktop/src/theme/variables.css`](../../apps/desktop/src/theme/variables.css) | Aurora token（唯一来源）     |
| `apps/desktop/src/theme/global.css`                                                  | 环境光、reset、焦点、动效    |
| `apps/desktop/src/theme/toolkit.css`                                                 | `dtb-*` 共享基础组件         |
| `apps/desktop/src/styles/tool-compat.css`                                            | 所有内置工具共用的控件样式   |
| `apps/desktop/src/legacy/*.module.css`                                               | 侧栏、首页、工具、市场、设置 |
| `marketplace/shared/theme/*`                                                         | 插件 token 镜像              |
| [`AGENTS.txt`](../../AGENTS.txt)                                                     | 后续模块必须遵守的规则       |

## 键盘快捷键

| 快捷键                           | 动作                                      |
| -------------------------------- | ----------------------------------------- |
| `Cmd/Ctrl+K`                     | 打开 / 关闭全局工具搜索                   |
| `Cmd/Ctrl+,`                     | 打开设置                                  |
| `Cmd/Ctrl+W`                     | 关闭当前工具标签                          |
| `Esc`                            | 关闭搜索 / 对话框、退出全屏、关闭标签菜单 |
| `↑` / `↓` / `Enter`              | 移动并打开搜索结果                        |
| `Cmd/Ctrl+F`                     | JSON 格式化查找 · MQTT 过滤               |
| `Enter`                          | Ping 探测 · Tracert 追踪                  |
| `Cmd/Ctrl+C/V/X/A`, `Cmd/Ctrl+Z` | 原生编辑操作                              |
| `Cmd+Q`                          | 退出（macOS）                             |

原生菜单提供设置、主题、语言、编辑操作与关于。
