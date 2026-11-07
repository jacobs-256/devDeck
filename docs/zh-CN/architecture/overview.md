# 架构总览（中文镜像）

> 英文源文档：[docs/architecture/overview.md](../../architecture/overview.md)。若两者不一致，以英文版为准。

DevToolBox 由两层组成：

- **JS/TS 前端**：所有界面与内置工具；
- **Rust 宿主**：所有特权操作与策略判定。

桌面外壳使用 **Tauri 2**。渲染层被视为不可信输入，Marketplace 插件被视为潜在恶意代码。

## 设计目标

| 目标             | 实现方式                                                                     |
| ---------------- | ---------------------------------------------------------------------------- |
| 安装包小、启动快 | Tauri 复用系统 WebView，不打包 Chromium                                      |
| 安全边界可审计   | 每个特权域只有一个 Rust 入口，策略位于无 UI 依赖的 crate                     |
| 贡献门槛低       | 工具与插件都是普通 Web 应用，只有宿主能力才需要 Rust                         |
| 开放生态         | 清单、权限、注册表、SDK、签名规范独立版本化                                  |
| 策略可测试       | `devtoolbox-contract` / `-capability` / `-market` 不依赖 Tauri，可在 CI 单测 |

## 分层

```
apps/desktop/src           React 渲染层（不可信）
  ├─ pages / tools          内置工具
  └─ pluginBridge.ts        postMessage ⇄ invoke 桥

apps/desktop/src-tauri     Tauri 宿主（可信）
  ├─ commands.rs            唯一可调用入口
  ├─ sdk.rs                 插件能力的唯一门控分发器
  ├─ protocol.rs            plugin:// 静态资源服务
  ├─ http.rs / socket.rs    网络能力
  ├─ files.rs               token 化文件访问
  └─ state.rs / storage.rs  运行时状态

crates/                    无框架依赖的策略层
  ├─ devtoolbox-contract    清单、权限、注册表、错误
  ├─ devtoolbox-capability  授权、白名单、路径沙箱
  └─ devtoolbox-market      包校验、安装、状态机
```

依赖方向严格向下：策略 crate 不引入 Tauri、不读 UI、不直接做网络 I/O，因此可被 CLI 工具复用。

## 目录结构

| 路径                           | 用途                                        |
| ------------------------------ | ------------------------------------------- |
| `apps/desktop/src`             | React 外壳、内置工具、插件桥                |
| `apps/desktop/src-tauri`       | Tauri 配置、Rust 宿主、capabilities         |
| `crates/devtoolbox-contract`   | 共享词汇：id、清单、权限、注册表、错误      |
| `crates/devtoolbox-capability` | 能力代理与文件系统沙箱                      |
| `crates/devtoolbox-market`     | 包校验、解包、安装状态                      |
| `packages/plugin-sdk`          | 面向插件作者的 npm SDK                      |
| `marketplace/`                 | 官方插件源码与打包/签名工具                 |
| `docs/`                        | 文档（含本中文镜像）                        |
| `core/`                        | 旧 Electron 实现（冻结，见 legacy-removal） |

## 信任边界

1. **渲染层 → 宿主**：全部经由 `commands.rs` 的 `#[tauri::command]`，由 Tauri capability 文件限制窗口可用插件。
2. **插件 → 宿主**：插件运行在 `plugin://localhost/<id>/` 的沙箱 iframe 中，只能 `postMessage`；渲染层校验 `event.source` 后转发给 `plugin_sdk_call`，宿主每次重新校验安装状态、启用状态与具体权限。
3. **宿主 → 系统**：只有 `http.rs`、`socket.rs`、`files.rs`、`storage.rs`、`logs.rs`、`protocol.rs` 触碰网络、磁盘或系统对话框。

## 单一分发器

旧 Electron 宿主有 63 个专用 IPC 通道。新宿主只有一个：

```rust
#[tauri::command]
async fn plugin_sdk_call(plugin_id, method, params) -> Result<Value, DevToolboxError>
```

- `method` 选择能力（`storage.set`、`http.request`、`socket.tcpConnect`、`fs.readFile`…）
- `params` 为 JSON 对象
- 能力代理在执行前校验权限

新增能力 = 一个 match 分支 + 一条权限，不新增 IPC 表面。

## 安装流程

```
registry.json ──校验──► RegistryIndex
                          │
                       下载 .zip
                          │
              SHA-256 + Ed25519 校验
                          │
              解包到 .staging/<id>
                          │
         清单校验 + 入口布局校验
                          │
              原子 rename → plugins/<id>
                          │
              状态文件原子写入 + 授权
```

任一步失败都不会破坏旧版本：staging 目录被清理，升级只在新包完全校验通过后替换目录。

## SDK 调用流程

```
插件 iframe
  │ postMessage({ type: 'devtoolbox:sdk:request', method, params })
  ▼
渲染层 pluginBridge.ts（校验 event.source）
  │ invoke('plugin_sdk_call', { pluginId, method, params })
  ▼
commands::plugin_sdk_call → sdk::dispatch
  ├─ require_active        已安装且已启用
  ├─ broker.require        清单是否声明该权限
  ├─ 白名单校验             域名 / 环境变量 / 文件 token / 路径
  └─ 具体实现               storage | http | socket | fs | log | opener
```

## 新增能力清单

1. 在 `devtoolbox-contract` 的 `Permission` 增加权限 id（wire 字符串是公共 API）。
2. 在 `devtoolbox-capability` 增加白名单规则。
3. 在 `sdk::dispatch` 增加一个分支并实现宿主逻辑。
4. 在 `packages/plugin-sdk` 暴露类型化方法。
5. 更新 `docs/plugin-dev/marketplace-v2.md` 并补测试。

## 新增内置工具

工具只属于渲染层：

```
apps/desktop/src/tools/
├── registry.ts              唯一注册点
├── types.ts                 ToolDefinition / 分类
├── components.tsx           CopyButton、ErrorText
└── module-tools/<tool>/
    ├── <tool>.model.ts      纯逻辑（无 React / 无 window.*）
    ├── <tool>.model.test.ts Vitest
    └── <ToolName>.tsx       界面
```

规则：逻辑放 `.model.ts` 便于 Node 测试；需要特权的工具必须调用宿主命令，禁止直接 `fetch` / 文件 API。

## 国际化

壳层与应用市场支持英文与简体中文（`apps/desktop/src/i18n/`）。语言与主题一起保存在 `settings.json`，启动时恢复。

- 词典是扁平 key 映射；`zh-CN` 的类型是 `Dictionary`，缺 key 会导致 TypeScript 构建失败
- `translate()` 支持 `{name}` 插值，未知 key 回退为 key 本身
- 全部 27 个工具的名称、描述、分类与正文均已翻译。协议/状态类标识（例如 MQTT 连接状态、WebSocket readyState 名称）保留技术原文。

## 测试策略

| 层     | 测试                                                                      | 位置                           |
| ------ | ------------------------------------------------------------------------- | ------------------------------ |
| 契约   | id、清单、权限、注册表、路径沙箱单测                                      | `crates/*/src`                 |
| 能力   | 每条白名单规则与失败分支                                                  | `crates/devtoolbox-capability` |
| 市场   | 内存 ZIP 的端到端安装（含 zip-slip、签名、降级）                          | `crates/devtoolbox-market`     |
| 宿主   | `cargo test -p devtoolbox-desktop`（socket 回环、文件 token、注册表拉取） | `apps/desktop/src-tauri`       |
| 渲染层 | `tsc --noEmit` + `vite build` + 工具 model 单测                           | `apps/desktop`                 |
