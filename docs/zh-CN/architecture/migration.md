# 迁移状态：Electron → Rust + Tauri 2（中文镜像）

> 英文源文档：[docs/architecture/migration.md](../../architecture/migration.md)。

`rust` 分支在保持产品可用的前提下重写桌面外壳。旧 Electron 实现位于 `core/`，已冻结，作为行为参考。

## 状态矩阵

| 模块                    | Electron（旧）                                 | Rust + Tauri（当前）                                 | 状态                |
| ----------------------- | ---------------------------------------------- | ---------------------------------------------------- | ------------------- |
| 外壳与打包              | electron-builder，239 MB `.app` / 95 MB `.dmg` | Tauri 2，4.0 MB `.app` / 2.1 MB `.dmg`（arm64 实测） | ✅ 已验证           |
| 清单契约                | TS 类型                                        | `devtoolbox-contract`，schema 2 + v1 兼容            | ✅ 实现并测试       |
| 权限模型                | `marketplace.ts` 内联判断                      | `devtoolbox-capability` 代理 + 白名单                | ✅ 实现并测试       |
| 包校验                  | Node 脚本 sha256                               | SHA-256 + Ed25519                                    | ✅ 实现并测试       |
| 安装/卸载/启用          | 3020 行 `marketplace.ts`                       | `devtoolbox-market::store`                           | ✅ 实现并测试       |
| 插件资源服务            | Electron 窗口                                  | `plugin://` 协议                                     | ✅ 实现             |
| 插件桥                  | `postMessage` + 115 IPC                        | `postMessage` + 单一 `plugin_sdk_call`               | ✅ 实现             |
| SDK 1.x 兼容            | 不适用                                         | 旧方法别名 + 旧响应形状                              | ✅ 实现并测试       |
| 存储/日志/主题/打开链接 | 专用 IPC                                       | 权限后置的 SDK 方法                                  | ✅ 实现             |
| HTTP 代理               | `plugin:httpRequest`                           | `http.rs` 逐跳白名单                                 | ✅ 实现             |
| TCP/UDP                 | `net`                                          | `socket.rs` 客户端/服务端/UDP + 事件                 | ✅ 实现并测试       |
| 文件对话框与读写        | `dialog`                                       | token 化 `fs:*` + 插件数据沙箱                       | ✅ 实现并测试       |
| SSH/SFTP                | `ssh2`                                         | 尚未迁移                                             | ⬜ 下一轮           |
| 注册表拉取              | 主进程 HTTP                                    | 来源管理 + 拉取 + 签名策略 + 按源安装                | ✅ 实现并测试       |
| 自动更新                | `electron-updater`                             | 尚未接入                                             | ⬜ 下一轮           |
| 内置工具（27）          | `core/renderer`                                | 已迁移 27 个并有单测                                 | 🟡 进行中           |
| i18n / 主题             | `core/renderer/i18n`                           | 壳层、市场与工具列表支持中/英                        | 🟡 工具正文暂为英文 |
| 插件作者文档            | 旧 SDK 文档                                    | SDK 2.0 指南 + 脚手架 + 旧文档提示                   | ✅ 完成             |

图例：✅ 完成并测试 · 🟡 部分 · ⬜ 待办。

## 可运行命令

```bash
cargo test -p devtoolbox-contract -p devtoolbox-capability -p devtoolbox-market
cargo test -p devtoolbox-desktop
cargo clippy --workspace --all-targets
pnpm --filter @devtoolbox/desktop build
pnpm --filter @devtoolbox/desktop test
pnpm --filter @devtoolbox/plugin-sdk build
pnpm --filter @devtoolbox/desktop tauri dev
pnpm --filter @devtoolbox/desktop tauri build --bundles dmg
```

实测体积：`.app` 4.0 MB、`.dmg` 2.1 MB（arm64，release + LTO/strip）；debug `.app` 约 40 MB。

## 迁移顺序

1. **内置工具迁移**（用户价值最高）：27 个已全部迁移，其余按「纯前端优先」推进。
2. **SSH/SFTP**：`net:socket` 已完成，SSH 仍需 `russh`，并保留旧方法名。
3. **自动更新**：接入 `tauri-plugin-updater` 与签名更新源，移除 `electron-updater`。
4. **i18n 与主题对齐**：迁移 `core/renderer/i18n` 与主题变量。
5. **移除旧实现**：`core/`、`electron-builder.yml`、`build/` 与旧工具链已不再被新应用引用，可随时删除；完整清单与验证步骤见 [移除旧 Electron 实现](legacy-removal.md)。在此之前 `pnpm lint:legacy` 会在 CI 中守住边界。

## 兼容性保证

- 插件 id、入口、权限字符串保持不变；
- schema 1 清单可安装（`legacy_sdk` 警告）；
- 现有 ZIP 包可直接安装；
- SDK 保留 `callSdk` / `sdk` 接口，迁移通常只需改 import 并把 `sdkVersion` 升到 `2.0`；
- 旧 socket / 文件方法名有别名映射。

## 风险与缓解

| 风险                     | 缓解                                           |
| ------------------------ | ---------------------------------------------- |
| WebView 平台差异         | 发布前逐平台冒烟；避免 Chromium 专有 API       |
| 工具迁移回归             | 一次一个工具，保留单测与手工清单               |
| 旧插件依赖 Electron 行为 | 桥接协议保持稳定，迁移期记录 `capability.list` |
| Windows WebView2 可用性  | 打包引导程序；文档标注最低 Win10 版本          |
| 单次评审过大             | 按能力分批迁移，旧代码在功能对齐前保留         |
