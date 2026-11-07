# 用户指南

DevToolBox 是一个包含 27 个内置工具和开放插件市场的桌面工具箱。

## 安装

从 [GitHub Releases](https://github.com/XthingsJacobs/devToolBox/releases) 下载：

- **macOS**：打开 DMG，将 DevToolBox 拖入 Applications。
- **Windows**：运行 NSIS 安装程序（x64）。

应用基于 Tauri 2，使用系统 WebView，安装包约 5.5 MB。

## 界面

- **侧边栏**：首页、工具、应用市场、设置；底部按钮可折叠为图标栏。
- **首页**：搜索、分类快捷入口、常用工具、应用/屏幕/运行环境信息。
- **工具**：左侧工具列表 + 右侧标签式工作区。
- **应用市场**：注册表来源、已安装插件、可用插件。
- **设置**：外观、语言、注册表、更新、关于。

## 工具

1. 打开 **工具**，在侧边栏选择分类，或在工具列表中搜索。
2. 点击工具，在标签页中打开。
3. 可同时打开多个工具；切换标签不会丢失状态。
4. 用 `×`、标签菜单的 **Close All** 或 `Cmd/Ctrl+W` 关闭。
5. 工具头部的全屏按钮进入专注模式，`Esc` 退出。

所有内置工具均在本地运行；网络工具（TCP Ping、MQTT、Tracert、WebSocket）和证书工具不会把数据发送到第三方服务。

## 应用市场

插件是运行在沙箱 iframe 中的小型 Web 应用，只能使用清单声明的能力，所有特权调用都由 Rust 宿主校验。

### 添加注册表

1. 打开 **应用市场**。
2. 在注册表栏粘贴 `registry.json` 地址，点击 **Add registry**。
3. 目录会自动刷新，也可点击 **Refresh**。

注册表地址必须是 HTTPS；本地开发允许 `http://localhost` 与 `http://127.0.0.1`。

需要签名验证时，在 **设置 → 注册表 → Trust options** 中粘贴 Ed25519 公钥，并可勾选强制签名。

### 安装、更新、移除

- **Marketplace**：安装或升级插件。
- **Installed**：使用顶部横幅一键更新、启用/禁用、垃圾桶按钮卸载。
- 禁用会撤销授权，重新启用时按清单重新授权。

## 设置

- **General**：深色/浅色主题、English/简体中文，均保存到 `settings.json`。
- **Registries**：添加/移除注册表、配置公钥与强制签名。
- **Updates**：检查新版本；更新包从 GitHub Releases 下载并用更新公钥验签。
- **About**：版本、平台、数据目录。

## 快捷键

| 快捷键                            | 行为                                |
| --------------------------------- | ----------------------------------- |
| `Cmd/Ctrl+K`                      | 全局工具搜索                        |
| `Cmd/Ctrl+,`                      | 打开设置                            |
| `Cmd/Ctrl+W`                      | 关闭当前工具标签                    |
| `Esc`                             | 关闭搜索/对话框、退出全屏           |
| `↑` / `↓` / `Enter`               | 搜索结果导航与打开                  |
| `Cmd/Ctrl+F`                      | JSON 格式化查找输出 · MQTT 过滤消息 |
| `Enter`                           | TCP Ping 探测 · Tracert 追踪        |
| `Cmd/Ctrl+C/V/X/A`                | 复制/粘贴/剪切/全选                 |
| `Cmd/Ctrl+Z` / `Shift+Cmd/Ctrl+Z` | 撤销/重做                           |
| `Cmd+Q`                           | 退出（macOS）                       |
| `Tab` / `Shift+Tab`               | 焦点移动                            |

## 数据与隐私

- 数据目录：macOS `~/Library/Application Support/com.devtoolbox.app`，Windows `%APPDATA%\com.devtoolbox.app`。
- 无遥测；内置工具本地运行；插件只有在清单声明 `http:*` / `net:*` 并安装后才会联网。
- 插件日志位于 `logs/plugins.log`。

## 反馈

通过 [GitHub Issues](https://github.com/XthingsJacobs/devToolBox/issues) 报告问题，附版本、系统、复现步骤与截图/日志。安全问题请遵循[安全策略](../../governance/security.md)。
