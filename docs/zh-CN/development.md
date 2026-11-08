# 二次开发指南

本指南面向 DevDeck 宿主的二次开发：环境搭建、架构、添加工具、宿主命令与插件能力、UI 约定、测试与发布。

## 1. 环境要求

- Node.js 20+、pnpm 10+
- Rust 1.90+（`rustup` 默认工具链）
- 平台 Tauri 依赖（macOS 需 Xcode 命令行工具，Windows 需 WebView2/MSVC）

```bash
pnpm install
pnpm dev            # tauri dev（Vite + Rust 宿主）
```

## 2. 目录结构

| 路径                           | 职责                                                       |
| ------------------------------ | ---------------------------------------------------------- |
| `apps/desktop/src`             | React 渲染层：legacy 外壳/页面、27 个工具、主题            |
| `apps/desktop/src-tauri`       | Rust 宿主：命令、插件协议、socket、SSH、MQTT、证书、更新器 |
| `crates/devdeck-contract`   | 清单、权限、注册表模型、错误                               |
| `crates/devdeck-capability` | 能力代理、白名单、路径沙箱                                 |
| `crates/devdeck-market`     | SHA-256/Ed25519、ZIP 安全、安装状态                        |
| `packages/plugin-sdk`          | `@devdeck/plugin-sdk` 2.0（可发布）                     |
| `marketplace/`                 | 插件工作区、脚手架、打包/签名/注册表脚本                   |
| `scripts/`                     | 市场验收、更新演练、legacy 导入守卫                        |
| `docs/`                        | 英文文档与 `zh-CN` 镜像                                    |

## 3. 架构速览

```
渲染层（React）
  legacy 页面 ── 工具（懒加载） ── PluginView（沙箱 iframe）
        │                            │ postMessage
        ▼                            ▼
Tauri commands ───────────► plugin_sdk_call（唯一网关）
        │                            │
        ▼                            ▼
AppState ── sources/market ── 能力代理 ── 路径沙箱
        │
        └──────── contract / capability / market 三个 crate
```

- 渲染层不直接访问文件、socket 或 SSH；内置工具调用显式命令，插件只能走 `plugin_sdk_call`。
- 每次插件调用都会重新校验安装状态、启用状态、权限授权与白名单；禁用/卸载会重建授权。
- 插件资源通过 `plugin://localhost/<id>/<entry>` 提供，并带 `connect-src 'none'`，防止绕过代理。
- 市场状态（来源、缓存、已安装插件、授权）保存在应用数据目录。

## 4. 运行与调试

```bash
pnpm dev
pnpm build
pnpm typecheck
pnpm test
pnpm lint
cargo test --workspace
cargo clippy --workspace --all-targets
```

- 数据目录：macOS `~/Library/Application Support/com.devdeck.desktop`，Windows `%APPDATA%\com.devdeck.desktop`。
- `settings.json` 保存主题/语言，`known-hosts.json` 保存 SSH TOFU，`logs/plugins.log` 保存插件日志。
- `./scripts/marketplace-acceptance.sh market-emoji-search` 走完整签名安装流程。
- `./scripts/updater-rehearsal.sh` 构建更新产物并对照固定公钥验签。

## 5. 添加内置工具

内置工具界面沿用 main 分支的 legacy 组件，位于
`apps/desktop/src/legacy-renderer/components/ModuleTools/`。共享 `@@components`
提供 `ToolSection`、`useSplitPane`、`HelpModal`、`JsonTreeView` 等组件，保证布局与旧版一致。

1. 新建 `legacy-renderer/components/ModuleTools/<Folder>/`：`index.tsx`（默认导出，填满工具区域）、`<Folder>.module.css`、可选的 `locales/en.ts`。
2. 使用 `@@components` 中的共享组件，不要另写工具头部/分栏。
3. 在 `apps/desktop/src/tools/registry.ts` 注册：`id`、英文搜索文本、`nameKey`/`descriptionKey`、分类、关键词、懒加载组件。
4. 在 `apps/desktop/src/legacy/data.tsx` 映射分类与图标。
5. 在中英词典加入 `tool.<id>.name` / `.desc`。
6. 特权操作调用 Tauri 命令；`window.electronAPI` 只存在于 `legacy-renderer/compat/electron.ts` 兼容桥，按需扩展。

工具按标签页保活，切换不丢失状态。

## 6. 添加宿主命令

1. 在 `apps/desktop/src-tauri/src/commands.rs` 实现：
   ```rust
   #[tauri::command]
   pub fn my_command(state: State<'_, AppState>, value: String)
       -> Result<MyResult, DevDeckError> { ... }
   ```
2. 在 `lib.rs` 的 `invoke_handler` 注册。
3. 在 `apps/desktop/src/api.ts` 添类型化包装，在 `types.ts` 添类型。
4. 在 Rust 侧校验所有输入（长度、协议、路径、范围），不要信任渲染层。
5. 在宿主模块或对应 crate 添加单元测试。

命令是渲染层访问宿主的唯一通道，保持粗粒度与强类型。

## 7. 添加插件能力

1. 在 `crates/devdeck-contract/src/permission.rs` 增加 `Permission` 变体（字符串、摘要、敏感性、`is_implemented`）。
2. 在 `crates/devdeck-capability/src/broker.rs` 校验授权白名单（域名、环境变量、保留权限）。
3. 在 `apps/desktop/src-tauri/src/sdk.rs` 实现并在 `plugin_sdk_call` 分发。
4. 在 `packages/plugin-sdk/src/index.ts` 的 `sdk.*` 暴露类型化方法。
5. 更新文档：`docs/plugin-dev/sdk.md`、`docs/architecture/security-model.md`、`docs/architecture/marketplace.md`。
6. Rust 与前端各补测试；必要时加验收插件。

保留权限（`bluetooth`、`serial`、`usb`）可解析，但在实现前返回 `unimplemented_permission`。

## 8. UI 约定

- `apps/desktop/src/legacy/` 下的外壳与页面保持原 Electron 布局：180/52px 侧边栏、工具列表+标签页、模块中心与扁平设置行。
- 使用 `apps/desktop/src/theme/variables.css` 的 legacy token，不要引入新色板或字号；插件镜像 `marketplace/shared/theme/`。
- 页面组件用 CSS Module；工具内部使用 `styles/tool-compat.css`。
- 保持快捷键契约：`Cmd/Ctrl+K`、`Cmd/Ctrl+,`、`Cmd/Ctrl+W`、`Esc`、搜索方向键/Enter、工具内 `Cmd/Ctrl+F`（JSON/MQTT）、Enter（Ping/Tracert）。见[设计规范](design-system.md)。
- 文案必须可翻译：中英词典同步添加，不要在已有 `t()` 的组件里硬编码新英文。

## 9. 市场开发

```bash
pnpm --filter @devdeck/marketplace pack market-my-plugin
DEVDECK_SIGNING_KEY=$(cat .signing/my-key.txt) \
  pnpm --filter @devdeck/marketplace sign .local-dist/market-my-plugin-0.1.0.zip
pnpm --filter @devdeck/marketplace registry market-my-plugin \
  --base-url http://127.0.0.1:8765 --out .local-dist/registry.json
python3 -m http.server 8765 --directory marketplace/.local-dist
```

在 **应用市场** 添加 URL；在 **设置 → 注册表 → Trust options** 配置固定公钥与强制签名。

注册表与安装包均使用 Ed25519；安装前同时校验签名、SHA-256 与 ZIP 安全。详见 [Marketplace 协议](architecture/marketplace.md) 与[打包文档](../plugin-dev/packaging.md)。

## 10. 测试与 CI

| 层面      | 命令                                                               |
| --------- | ------------------------------------------------------------------ |
| 前端/工具 | `pnpm test`（Vitest）                                              |
| 类型      | `pnpm typecheck`                                                   |
| Lint      | `pnpm lint`（清单、legacy 守卫、ESLint）                           |
| Rust      | `cargo test --workspace`、`cargo clippy --workspace --all-targets` |
| 格式      | `cargo fmt --all -- --check`、`prettier --check`                   |
| 市场 e2e  | `pnpm marketplace:acceptance`                                      |
| 更新      | `pnpm release:rehearse`                                            |

CI 在 Ubuntu 跑前端流水线，Tauri 任务跑 Linux 构建/测试；发布工作流构建 macOS arm64 与 Windows x64。

## 11. 发布

- 应用：推送 `v<version>`（如 `v3.0.0`），Tauri 工作流构建 DMG/NSIS 与更新产物并创建草稿。
- 市场：推送 `marketplace-v*`，工作流打包、签名、校验并上传 `registry.json`、插件 ZIP 与公钥。
- 需要的 Secrets：`TAURI_SIGNING_PRIVATE_KEY`（及密码）、`MARKETPLACE_SIGNING_KEY`。
- 完整清单见[发布流程](architecture/release.md)。

## 12. PR 检查清单

- [ ] `pnpm lint`、`pnpm typecheck`、`pnpm test` 通过。
- [ ] `cargo fmt --check`、`cargo clippy`、`cargo test --workspace` 通过。
- [ ] 新文案中英词典齐全。
- [ ] 新权限/命令有文档与测试。
- [ ] UI 遵循 legacy 布局与主题 token。
- [ ] 快捷键仍可用（见设计规范）。
- [ ] 未提交密钥、签名或构建产物。
