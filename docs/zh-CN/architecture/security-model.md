# 安全模型（中文镜像）

> 英文源文档：[docs/architecture/security-model.md](../../architecture/security-model.md)。

本文列出 Rust + Tauri 宿主的安全不变量及其执行位置。修改 `apps/desktop/src-tauri` 或 `crates/` 前请先阅读。

## 信任边界

| 边界            | 不可信方                      | 执行点                                           |
| --------------- | ----------------------------- | ------------------------------------------------ |
| 渲染层 → 宿主   | Web 内容（React、第三方插件） | `commands.rs` 参数校验、Tauri capabilities       |
| 插件 → 宿主     | 来自注册表的任意 JS           | `sdk::dispatch` + `CapabilityBroker`             |
| 注册表 → 安装器 | 网络文档                      | `devtoolbox-contract` 校验 + `devtoolbox-market` |
| 包 → 文件系统   | 攻击者构造的 ZIP              | `package::extract_zip` + `resolve_within`        |

## 不变量

1. **插件只能调用清单声明的能力。** `CapabilityBroker::require` 是唯一闸门，授权在安装/启用时由清单重建。
2. **安装先于调用。** `AppState::require_active` 在权限检查前拒绝未知/已禁用插件；状态文件中的清单是事实来源，插件改磁盘上的 `manifest.json` 不会扩权。
3. **文件访问基于 token。** 插件拿不到路径；对话框返回绑定 `(插件, 路径, 可写)` 的令牌，跨插件使用被拒，只读令牌不可写，禁用/卸载即回收。
4. **路径不会逃出沙箱。** 构造时 `resolve_within` 拒绝绝对路径、`..`、Windows 分隔符与 NUL；使用时 `ensure_within` 解析符号链接后再次校验。
5. **网络按 host 逐跳白名单。** `authorize_http` 要求 `http:proxy`/`http:external`，仅允许 http/https，拒绝内嵌凭据；重定向不自动跟随，每一跳重新授权。
6. **包在解压前完成校验。** SHA-256 与可选 Ed25519 针对原始字节校验；解压时执行路径/类型/资源限制并核对声明大小。
7. **升级原子化且默认拒绝降级。** staging 校验通过后 rename 替换；拒绝旧版本覆盖新版本。
8. **插件代码无法访问宿主文档。** `plugin://` 独立 scheme + 无 `allow-same-origin` 的沙箱 iframe；父页面只接受来自该 iframe 的 `event.source` 消息。
9. **宿主表面保持最小。** 插件能力只有一个 `plugin_sdk_call`；不存在通用「读文件 / 执行命令 / 请求 URL」命令。

## 资源限额

| 资源                | 限制                   | 位置            |
| ------------------- | ---------------------- | --------------- |
| 包条目数            | 20 000                 | `InstallLimits` |
| 包解压总量          | 512 MiB                | `InstallLimits` |
| 包内单文件          | 64 MiB                 | `InstallLimits` |
| HTTP 响应           | 8 MiB（截断）          | `http.rs`       |
| HTTP 超时           | 默认 15s / 上限 60s    | `http.rs`       |
| 文件读写            | 8 MiB                  | `files.rs`      |
| Socket 会话         | 每插件 32 个           | `socket.rs`     |
| Socket 单次发送     | 1 MiB                  | `socket.rs`     |
| Socket 读分块       | 每事件 16 KiB          | `socket.rs`     |
| 插件 KV 单值 / 总量 | 1 MiB / 8 MiB          | `storage.rs`    |
| 插件日志            | 5 MiB 轮转，单条 8 KiB | `logs.rs`       |

### 2c. SSH 主机密钥固定

首次连接 `host:port` 时记录服务器密钥指纹到 `known-hosts.json`。之后不匹配会中止握手并返回 `permission_denied`；如需更换必须显式调用 `ssh.forgetHost`。密码或 OpenSSH 私钥仅在 Rust 侧使用，调用返回后插件不再持有凭据。

执行位置：`apps/desktop/src-tauri/src/ssh.rs`。

### 2d. 插件文档不能直接发起网络连接

每个 `plugin://` 响应都带严格 `Content-Security-Policy`，其中 `connect-src 'none'`，因此插件文档内的 `fetch`、`XMLHttpRequest`、`WebSocket`、`EventSource` 都会失败。网络访问必须走能力代理（`http.request`、`socket.*`、`ssh.*`），在那里执行权限、白名单与限额检查。内联脚本仍被允许（已发布插件带有内联主题引导），但没有网络原语就无法外传数据。

执行位置：`apps/desktop/src-tauri/src/protocol.rs`。

## 插件不能做什么

- 读取插件目录、KV 命名空间或用户授予的令牌之外的文件；
- 在没有 `net:socket` / `net:ssh` 的情况下打开套接字或 SSH；
- 访问 `httpDomains` 之外的 host；
- 读取 `envAllowlist` 之外的环境变量；
- 执行程序、加载本地库或使用 Electron/Node API；
- 修改自身权限，或通过安装后改清单扩权；
- 访问其他插件的存储、日志或授权。

## 漏洞上报

请阅读 [安全策略](../governance/security.md) 并私下报告，不要为绕过上述不变量开公开 issue。
