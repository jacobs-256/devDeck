# Marketplace 协议（中文镜像）

> 英文源文档：[docs/architecture/marketplace.md](../../architecture/marketplace.md)。

Marketplace 是一个**开放、去中心化的插件分发协议**，不是单一商店。任何人都可以托管 `registry.json`；通过校验的包即可安装。DevToolBox 预置官方注册表，用户也可以增删来源。

## 设计原则

1. **静态托管**：注册表就是 JSON + ZIP，任何 HTTPS 静态站点都能承载。
2. **可验证产物**：每个发布都带 SHA-256；签名可选但强烈建议，安装前校验。
3. **最小权限**：能力必须写在清单里，运行时未声明的调用一律拒绝。
4. **权限不能静默增长**：升级新增权限时必须再次征得用户同意。
5. **格式简单**：JSON、ZIP、Ed25519、SemVer。

## 包结构

```
my-plugin-1.2.3.zip
├── manifest.json          必须在根目录
├── package/               构建后的 Web 应用
│   ├── index.html         manifest.entry 指向
│   └── assets/…
└── icon.png               可选，manifest.icon 指向
```

解包时强制：路径相对且不含 `..`、禁止符号链接、最多 20000 个条目、解压后总大小 ≤512 MiB、单文件 ≤64 MiB、声明大小必须与实际一致、入口与图标必须位于包内。

## 清单 v2

```json
{
  "schemaVersion": 2,
  "id": "market-ip-lookup",
  "name": "IP Lookup",
  "description": "Look up IP geolocation",
  "version": "1.0.0",
  "sdkVersion": "2.0",
  "entry": "package/index.html",
  "categoryId": "network-tools",
  "author": { "name": "DevToolBox", "url": "https://example.com" },
  "license": "Apache-2.0",
  "permissions": ["storage:kv", "http:proxy"],
  "httpDomains": ["api.ip2location.io"],
  "envAllowlist": []
}
```

要点：`id` 发布后不可更改；`entry` 必须是包内相对 `.html`；schema 2 使用 `http:*` 时必须提供 `httpDomains`；使用 `system:env:read` 时必须提供 `envAllowlist`；未知权限直接拒绝；未实现的保留权限只产生警告。

**兼容性**：schema 1 / `sdkVersion: 1.0` 的旧清单仍可安装，仅产生 `legacy_sdk` 警告；旧版 `http:proxy` 无白名单时只允许 https。

## 权限

| 权限                             | 能力                             | 需要白名单     |
| -------------------------------- | -------------------------------- | -------------- |
| `storage:kv`                     | 每插件独立 KV（8 MiB）           | —              |
| `http:proxy`                     | 经宿主发起 HTTP(S)               | `httpDomains`  |
| `http:external`                  | 由 WebView 直接发起              | `httpDomains`  |
| `fs:dialog`                      | 打开/保存对话框                  | —              |
| `fs:read` / `fs:write`           | 读取/写入用户选择的文件（token） | 对话框 token   |
| `fs:plugin-data`                 | 自有数据目录读写                 | —              |
| `net:socket`                     | TCP 客户端/服务端、UDP           | —              |
| `net:ssh`                        | SSH 终端 / exec / SFTP           | —              |
| `system:openExternal`            | 打开 http(s) 链接                | —              |
| `system:revealPath` / `openPath` | 文件管理器操作                   | —              |
| `system:notifications`           | 桌面通知                         | —              |
| `system:env:read`                | 读取环境变量                     | `envAllowlist` |
| `system:getInfo`                 | 应用/系统信息                    | —              |
| `clipboard:write`                | 写剪贴板                         | —              |
| `log:write`                      | 写轮转日志                       | —              |
| `theme:read`                     | 读取主题                         | —              |
| `bluetooth` / `serial` / `usb`   | 保留，运行时不可用               | —              |

## 注册表

```json
{
  "schemaVersion": 2,
  "name": "DevToolBox Official",
  "plugins": [
    {
      "manifest": { "…": "同上" },
      "downloadUrl": "https://example.com/marketplace/market-ip-lookup-1.0.0.zip",
      "sha256": "64 位小写十六进制",
      "size": 182344,
      "publishedAt": "2026-11-07T00:00:00Z",
      "status": "active",
      "signature": { "keyId": "8a1f0c2d4e6b8a90", "signature": "base64…" }
    }
  ]
}
```

校验规则：`schemaVersion` 为 1 或 2；每条清单通过校验；`sha256` 合法；`downloadUrl` 必须 https（localhost 例外）；`(id, version)` 唯一；`status` 为 `active` / `deprecated` / `yanked`。`latest()` 取最高 SemVer 且状态为 active 的版本。

### 应用内来源管理

用户可在 **应用市场** 的注册表栏添加 URL；高级信任设置位于 **设置 → 注册表 → Trust options**。来源保存在 `marketplace-sources.json`：

```json
{
  "schemaVersion": 1,
  "sources": [
    {
      "id": "example-com",
      "name": "Example Marketplace",
      "url": "https://example.com/marketplace/registry.json",
      "publicKey": "base64-ed25519-public-key",
      "requireSignature": true,
      "addedAtMs": 1762500000000
    }
  ]
}
```

Trust options 可以粘贴注册表的 Ed25519 公钥并强制要求签名；目录支持文本搜索与分类筛选。

信任策略：

| 来源配置                        | 要求                         |
| ------------------------------- | ---------------------------- |
| 未配置公钥                      | 必须校验 SHA-256 摘要        |
| 配置公钥                        | 存在 `.sig` 时校验注册表签名 |
| 公钥 + `requireSignature: true` | 签名缺失或无效则拒绝安装     |

下载上限：注册表 8 MiB、包 128 MiB，重定向逐跳校验 https。

## 签名

- 算法：Ed25519（`verify_strict`）
- 公钥：32 字节，标准 Base64
- 签名：64 字节，标准 Base64
- `keyId`：`sha256(公钥)` 前 16 位十六进制

可签名对象：ZIP 包（注册表条目 `signature`）、注册表文档（同名 `.sig` 文件）。校验实现在 `crates/devtoolbox-market/src/signing.rs`，并有篡改测试。

## 安装生命周期

```
(未安装) ──install──► staging ──校验通过──► installed ──disable──► disabled ──uninstall──► (移除)
```

不变式：安装原子化；默认拒绝降级；升级保留启用状态；状态文件是唯一事实来源，目录丢失会被 reconciliation 清理。

## 发布流程

```bash
pnpm --filter ./marketplace/modules/market-ip-lookup build
pnpm --filter @devtoolbox/marketplace pack market-ip-lookup
pnpm --filter @devtoolbox/marketplace keygen --out .signing/key.txt
DEVTOOLBOX_SIGNING_KEY=$(cat .signing/key.txt) \
  pnpm --filter @devtoolbox/marketplace sign .local-dist/market-ip-lookup-1.0.0.zip
pnpm --filter @devtoolbox/marketplace registry --all \
  --base-url https://example.com/marketplace --out release-dist/registry.json
DEVTOOLBOX_SIGNING_KEY=$(cat .signing/key.txt) \
  pnpm --filter @devtoolbox/marketplace sign release-dist/registry.json
```

## 本地验收

仓库提供整条流水线的端到端演练：

```bash
./scripts/marketplace-acceptance.sh market-emoji-search
# 或：pnpm marketplace:acceptance
```

脚本会：构建插件 → 使用与发布工作流相同的 `pack-release.mjs` + `sign.mjs` 流程以一次性密钥签名 → 校验全部签名 → 通过回环 HTTP 提供服务 → 用宿主签名安装路径完成安装（`cargo test ... manual_signed_registry_acceptance -- --ignored`）。脚本会校验实际提供的 registry 字节与签名文件一致，并在结束后清理密钥与产物。

在发布前、修改安装器/注册表/签名代码后都应运行一次。

## 威胁模型

| 威胁         | 缓解                                          |
| ------------ | --------------------------------------------- |
| Zip-slip     | `resolve_within` 拒绝 `..`，只写入 staging    |
| 符号链接逃逸 | 拒绝 symlink 条目，使用前 `ensure_within`     |
| Zip 炸弹     | 条目数/单文件/总量限制                        |
| 恶意注册表   | HTTPS + 摘要 + 可选签名，清单始终本地重新校验 |
| 恶意插件 JS  | 沙箱 iframe（不透明源）、CSP、无 Node API     |
| 权限提升     | 每次调用都检查授权，授权由已安装清单重建      |
| 重定向逃逸   | 每一跳重新校验 `httpDomains`                  |
| 读取任意文件 | 令牌绑定 (插件, 路径, 读写)，禁用即回收       |

## 版本策略

权限字符串只增不改；清单 schema 在同一大版本内向后兼容；SDK 遵循 SemVer，`sdkVersion` 大版本高于宿主时拒绝安装；注册表有独立的 `schemaVersion`。
