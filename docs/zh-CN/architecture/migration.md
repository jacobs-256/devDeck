# 迁移状态：Electron → Rust + Tauri 2（中文镜像）

> 英文源文档：[docs/architecture/migration.md](../../architecture/migration.md)。

重写已在 `rust` 分支的 **3.0.0** 中落地：旧 Electron 外壳与 `core/` 已删除，全部实现位于 `apps/desktop`、`crates/` 与 `packages/plugin-sdk`。

## 状态矩阵

| 模块                    | Electron（2.0.x）                              | Rust + Tauri（3.0.0）                             | 状态          |
| ----------------------- | ---------------------------------------------- | ------------------------------------------------- | ------------- |
| 外壳与打包              | electron-builder，239 MB `.app` / 95 MB `.dmg` | Tauri 2，8.35 MB `.app` / 5.46 MB `.dmg`（arm64） | ✅ 已完成     |
| 清单契约                | TS 类型                                        | `devtoolbox-contract`，schema 2 + v1 兼容         | ✅ 实现并测试 |
| 权限模型                | `marketplace.ts` 内联判断                      | `devtoolbox-capability` 代理 + 白名单             | ✅ 实现并测试 |
| 包校验                  | Node 脚本 sha256                               | SHA-256 + Ed25519                                 | ✅ 实现并测试 |
| 安装/卸载/启用          | 3020 行 `marketplace.ts`                       | `devtoolbox-market::store`                        | ✅ 实现并测试 |
| 插件资源服务            | Electron 窗口                                  | `plugin://` 协议                                  | ✅ 实现       |
| 插件桥                  | `postMessage` + 115 IPC                        | `postMessage` + 单一 `plugin_sdk_call`            | ✅ 实现       |
| SDK 1.x 兼容            | 不适用                                         | 旧方法别名 + 旧响应形状                           | ✅ 实现并测试 |
| 示例插件                | SDK 1.x shim                                   | 六个示例插件升级到 SDK 2.0（全部构建通过）        | ✅ 已迁移     |
| 存储/日志/主题/打开链接 | 专用 IPC                                       | 权限后置的 SDK 方法                               | ✅ 实现       |
| HTTP 代理               | `plugin:httpRequest`                           | `http.rs` 逐跳白名单                              | ✅ 实现       |
| SSH/SFTP/TCP/UDP        | `ssh2`, `net`                                  | socket + SSH shell/exec + SFTP + 测试内服务端     | ✅ 实现并测试 |
| 文件对话框与读写        | `dialog`                                       | token 化 `fs:*` + 插件数据沙箱                    | ✅ 实现并测试 |
| 注册表拉取              | 主进程 HTTP                                    | 来源管理 + 拉取 + 签名策略 + 按源安装             | ✅ 实现并测试 |
| 自动更新                | `electron-updater`                             | `tauri-plugin-updater` + 签名发布                 | ✅ 已接入     |
| 内置工具（27）          | `core/renderer`                                | 27 个全部迁移，带模型/宿主测试                    | ✅ 完成       |
| i18n / 主题             | `core/renderer/i18n`                           | 壳层、市场与 27 个工具正文全部中/英               | ✅ 完成       |
| 插件作者文档            | 旧 SDK 文档                                    | SDK 2.0 指南 + 脚手架 + 打包文档                  | ✅ 完成       |

图例：✅ 完成并测试 · 🟡 部分 · ⬜ 待办。

## 可运行命令

```bash
cargo test --workspace
cargo clippy --workspace --all-targets

pnpm install
pnpm build
pnpm test
pnpm lint

pnpm dev
pnpm package:mac
pnpm package:win

pnpm marketplace:acceptance
pnpm release:rehearse
```

实测体积（arm64 macOS，3.0.0）：`.app` 8.35 MB、`.dmg` 5.46 MB；debug `.app` 约 40 MB。

## 剩余事项（运维动作，非代码）

1. **发布应用**：配置 `TAURI_SIGNING_PRIVATE_KEY` / `..._PASSWORD` 后推送 `v3.0.0` 标签，工作流会生成签名草稿与更新产物。
2. **发布插件市场**：配置 `MARKETPLACE_SIGNING_KEY` 后推送 `marketplace-v*` 标签，工作流会打包、签名、校验并上传 `registry.json` 与插件 ZIP。
3. **平台冒烟**：macOS arm64 已在本地构建并启动；Windows 与 macOS x64 由发布矩阵覆盖。

## 兼容性保证

- 插件 id、入口、权限字符串保持不变；
- schema 1 清单可安装（`legacy_sdk` 警告）；
- 现有 ZIP 包可直接安装；
- SDK 保留 `callSdk` / `sdk` 接口，迁移通常只需改 import 并把 `sdkVersion` 升到 `2.0`；
- 旧 socket / 文件方法名有别名映射。

## 风险与缓解

| 风险                     | 缓解                                     |
| ------------------------ | ---------------------------------------- |
| WebView 平台差异         | 发布前逐平台冒烟；避免 Chromium 专有 API |
| 旧插件依赖 Electron 行为 | 桥接协议保持稳定，保留旧 SDK 别名        |
| Windows WebView2 可用性  | 打包引导程序；文档标注最低 Win10 版本    |
| 更新/市场密钥丢失        | 密钥保存在 CI Secret，轮换流程见发布文档 |
