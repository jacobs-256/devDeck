# 设计规范与界面布局

DevToolBox 保持原 Electron 应用（`main` 分支）的布局与视觉语言。Rust/Tauri 只替换底层实现，界面应与重写前保持一致。

## 布局

```
┌────────────┬──────────────────────────────────────────────────────────┐
│ 侧边栏     │ 页面                                                     │
│ 180 / 52   │ 首页 · 工具 · 应用市场 · 设置                             │
└────────────┴──────────────────────────────────────────────────────────┘
```

### 侧边栏

- 展开 180px、收起 52px；底部按钮切换折叠（`‹` / `›`）。
- 主导航：**首页 · 工具 · 应用市场 · 设置**，VS Code 风格图标，34px 行高，10px 圆角，激活时左侧 3px 强调条。
- 工具页额外显示分类：**全部工具、开发工具、文本工具、网络工具、安全与加密、其他工具**，带颜色图标、名称与数量。
- 收起时只保留图标，悬停显示名称。
- 背景 `--bg-secondary`，右侧边框 `--border-default`。

### 页面结构

| 页面     | 结构                                                                                      |
| -------- | ----------------------------------------------------------------------------------------- |
| 首页     | 页头（小标题、搜索、欢迎语、日期）、分类快捷导航、常用工具卡片、应用/屏幕/运行环境信息卡  |
| 工具     | 252px 工具列表面板 + 工作区（标签栏、56px 工具头、内容区）                                |
| 应用市场 | 页头（Module Center、计数、刷新）、注册表栏、已安装/市场标签页、分类筛选 + 搜索、模块卡片 |
| 设置     | 单页滚动：标题、分组设置行、主题/语言分段控件、注册表、更新、关于                         |

工具工作区为两栏：列表固定、工作区滚动。打开工具时自动收起主侧边栏（原版行为），工具栏的全屏按钮会隐藏两侧栏。标签页保持工具挂载，切换不丢状态。

## 颜色

Token 定义在 [`apps/desktop/src/theme/variables.css`](../../apps/desktop/src/theme/variables.css)，插件镜像位于 `marketplace/shared/theme/variables.css`。

| Token                | 深色      | 浅色      | 用途                 |
| -------------------- | --------- | --------- | -------------------- |
| `--bg-primary`       | `#0d1117` | `#fafbfc` | 页面背景             |
| `--bg-secondary`     | `#161b22` | `#f0f3f6` | 侧边栏、面板、卡片   |
| `--bg-tertiary`      | `#21262d` | `#e4e9ed` | 输入框、代码块、组件 |
| `--bg-elevated`      | `#1c2128` | `#ffffff` | 浮层、对话框         |
| `--bg-hover`         | `#30363d` | `#d8dde3` | 悬停                 |
| `--border-default`   | `#21262d` | `#c2c9d1` | 默认边框             |
| `--border-subtle`    | `#30363d` | `#d4d9df` | 控件边框             |
| `--border-emphasis`  | `#484f58` | `#9ca3ab` | 强调边框             |
| `--text-primary`     | `#e6edf3` | `#0f1419` | 主文本               |
| `--text-secondary`   | `#cdd9e5` | `#57606a` | 次要文本             |
| `--text-tertiary`    | `#8b949e` | `#6e7781` | 标签                 |
| `--text-quaternary`  | `#6e7681` | `#818b98` | 描述、元信息         |
| `--accent-primary`   | `#1f6feb` | `#0969da` | 主操作               |
| `--accent-secondary` | `#58a6ff` | `#218bff` | 图标、链接、激活导航 |
| `--accent-success`   | `#3fb950` | `#1a7f37` | 成功                 |
| `--accent-error`     | `#f85149` | `#d1242f` | 错误、危险操作       |
| `--accent-warning`   | `#e3b341` | `#9a6700` | 警告                 |

分类色：`--cat-dev` 蓝、`--cat-text` 绿、`--cat-network` 橙、`--cat-security` 紫、`--cat-other` 黄，以 8–15% 透明度用于图标、胶囊与激活行。

## 字体

- 无衬线：`Inter, -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui`。
- 等宽：`JetBrains Mono, "Fira Code", "Cascadia Code", "SF Mono", Consolas`。
- 基准 13px / 1.5；小号 12px；元信息 11px；页面标题 21px、卡片标题 13px。
- 工具标题 15px 半粗；侧边栏标签 12.5px。

## 组件

### 按钮

原版按钮紧凑、扁平：30–34px 高、8–10px 圆角、12px 文字。

| 变体                              | 用途                     |
| --------------------------------- | ------------------------ |
| 主按钮（`--accent-primary` 填充） | 安装、刷新、保存         |
| 次按钮（`--bg-tertiary` + 边框）  | 工具操作、筛选           |
| Ghost / 图标按钮                  | 标签页、关闭、复制、更多 |
| 危险按钮                          | 卸载、移除               |

悬停提升到 `--bg-hover`；焦点使用 2px `--border-focus` 轮廓；禁用态约 45–60% 不透明度。

### 表单控件

- 输入框/下拉：32px 高，`--bg-tertiary` 背景，1px `--border-subtle` 边框，8px 圆角。
- 焦点：边框切换为 `--border-focus` 并显示 1px 轮廓。
- 标签在控件上方，12px `--text-quaternary`。
- 工具表单使用 `.field`、`.field-row`、`.field.compact`（148px）、`.field.grow`。
- 复选框/单选框使用强调色。

### 卡片与列表

- 模块卡片：12px 圆角、`--bg-secondary`、1px 边框、图标块、标题、版本/分类胶囊、描述、操作行。
- 工具列表：42px 图标块 + 名称 + 两行描述；激活行使用彩色左边框与 `--bg-secondary`。
- 首页工具卡片：12px 圆角，悬停边框 + 阴影，分类胶囊。
- 信息组件：左侧 3px 彩色边框，头部图标/标题，内容网格。

### 标签页

- 工具标签：浏览器风格紧凑标签，分类色图标、关闭按钮、底部激活线，更多菜单含「Close All」。
- 应用市场标签：下划线样式 + 数量胶囊。

## 键盘快捷键

与原 Electron 应用完全一致。

| 快捷键                            | 行为                                        |
| --------------------------------- | ------------------------------------------- |
| `Cmd/Ctrl+K`                      | 打开/关闭全局工具搜索                       |
| `Cmd/Ctrl+,`                      | 打开设置                                    |
| `Cmd/Ctrl+W`                      | 关闭当前工具标签                            |
| `Esc`                             | 关闭搜索/对话框、退出工具全屏、关闭标签菜单 |
| `↑` / `↓`                         | 在搜索结果中移动                            |
| `Enter`                           | 打开选中的搜索结果                          |
| `Cmd/Ctrl+F`                      | JSON 格式化：在输出中查找 · MQTT：过滤消息  |
| `Enter`                           | Ping Test：开始探测 · Tracert：开始追踪     |
| `Cmd/Ctrl+C` / `V` / `X` / `A`    | 复制 / 粘贴 / 剪切 / 全选（原生菜单角色）   |
| `Cmd/Ctrl+Z` / `Shift+Cmd/Ctrl+Z` | 撤销 / 重做（原生菜单角色）                 |
| `Cmd+Q`                           | 退出（macOS）                               |
| `Tab` / `Shift+Tab`               | 在控件间移动焦点                            |

原生菜单提供设置（`Cmd+,`）、主题、语言、Edit 角色与关于；菜单事件以 `menu:action`、`menu:theme`、`menu:language` 转发给渲染层。

## 插件主题

插件加载 `marketplace/shared/devtoolbox-embed.css`，导入同一套 legacy token 与 toolkit（按钮、输入框、卡片、代码高亮）。通过 `<html data-theme="light">` 切换主题，由 `followHostTheme()` 设置。

## 实现位置

| 路径                                        | 职责                             |
| ------------------------------------------- | -------------------------------- |
| `apps/desktop/src/theme/variables.css`      | 颜色 token 与字体变量            |
| `apps/desktop/src/theme/global.css`         | Reset、滚动条、动画、输出颜色    |
| `apps/desktop/src/theme/toolkit.css`        | 插件共享基础组件                 |
| `apps/desktop/src/legacy/AppShell.tsx`      | 侧边栏、导航、分类               |
| `apps/desktop/src/legacy/ToolsPage.tsx`     | 工具列表、标签页、工具头、工作区 |
| `apps/desktop/src/legacy/DashboardPage.tsx` | 首页                             |
| `apps/desktop/src/legacy/ModulesPage.tsx`   | 应用市场                         |
| `apps/desktop/src/legacy/SettingsPage.tsx`  | 设置                             |
| `apps/desktop/src/legacy/GlobalSearch.tsx`  | `Cmd/Ctrl+K` 搜索对话框          |
| `apps/desktop/src/styles/tool-compat.css`   | 迁移工具的控件样式               |
| `apps/desktop/src-tauri/src/lib.rs`         | 原生菜单与快捷键                 |

## 检查清单

- [ ] 新界面符合原版间距、字体与配色。
- [ ] 侧边栏可收起为 52px，分类仍可用。
- [ ] 工具在标签页中打开，切换不丢状态。
- [ ] 上表快捷键（含工具内快捷键）可用。
- [ ] 深色与浅色主题均正常。
- [ ] 插件 UI 使用共享 toolkit。

## 相关文档

- [二次开发指南](development.md)
- [架构总览](architecture/overview.md)
