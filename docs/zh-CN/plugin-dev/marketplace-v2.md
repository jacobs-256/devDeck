# Marketplace 插件开发指南（SDK 2.0，中文镜像）

> 英文源文档：[docs/plugin-dev/marketplace-v2.md](../../plugin-dev/marketplace-v2.md)。

本指南面向**第三方插件作者**。插件只需要 HTML/CSS/JS（或 TS、任意前端框架），Rust 仅用于宿主能力。

## 插件是什么

一个静态 Web 应用：

```
my-plugin/
├── manifest.json      身份、入口、权限
├── src/
├── package.json
├── vite.config.ts
└── package/           构建产物，打进 .zip
    └── index.html
```

宿主从 `plugin://localhost/<id>/` 提供 `package/`，运行在沙箱 iframe 中，不会向你的页面注入任何内容。与宿主通信只能通过 `@devtoolbox/plugin-sdk`。

## 脚手架

在 DevToolBox 仓库内：

```bash
pnpm --filter @devtoolbox/marketplace create \
  --id market-my-tool --name "My Tool" --permissions storage:kv
```

生成：schema 2 清单、Vite 配置（`base: './'`、`outDir: 'package'`）、TS 配置、`followHostTheme()` 入口、存储示例、明暗主题 CSS、README。可用参数：`--description`、`--category`、`--author`、`--license`、`--permissions a,b`、`--dir`、`--force`。

独立 npm 项目：

```bash
mkdir my-plugin && cd my-plugin
pnpm init
pnpm add @devtoolbox/plugin-sdk
pnpm add -D vite typescript @vitejs/plugin-react @types/react @types/react-dom
```

## manifest.json

```json
{
  "schemaVersion": 2,
  "id": "market-my-plugin",
  "name": "My Plugin",
  "description": "One sentence",
  "version": "0.1.0",
  "sdkVersion": "2.0",
  "entry": "package/index.html",
  "categoryId": "text-tools",
  "author": { "name": "Your Name" },
  "license": "MIT",
  "permissions": ["storage:kv"],
  "httpDomains": [],
  "envAllowlist": []
}
```

常见坑：`id` 永久不变；`entry` 必须是包内相对 `.html`；使用 `http:*` 必须列 `httpDomains`（`*.example.com` 不含裸域）；未知权限直接报错。

## 使用 SDK

```ts
import { sdk, followHostTheme } from '@devtoolbox/plugin-sdk';

followHostTheme();

const saved = await sdk.storage.set('theme', 'dark');
if (!saved.ok) console.error(saved.error.code);
```

所有调用返回 `{ ok: true, data } | { ok: false, error: { code, message } }`，请按 `error.code` 分支（`permission_denied`、`invalid_argument`、`timeout`、`not_found`、`unsupported`、`internal`）。

| 调用                                        | 权限                                            |
| ------------------------------------------- | ----------------------------------------------- |
| `sdk.storage.*`                             | `storage:kv`                                    |
| `sdk.http.request`                          | `http:proxy` 或 `http:external` + `httpDomains` |
| `sdk.fs.pickFile` / `pickSaveFile`          | `fs:dialog`                                     |
| `sdk.fs.readFile` / `writeFile`             | `fs:read` / `fs:write`                          |
| `sdk.fs.readPluginData` / `writePluginData` | `fs:plugin-data`                                |
| `sdk.socket.*`                              | `net:socket`                                    |
| `sdk.log.*`                                 | `log:write`                                     |
| `sdk.system.openExternal`                   | `system:openExternal`                           |
| `sdk.system.getInfo`                        | `system:getInfo`                                |
| `sdk.system.getEnv`                         | `system:env:read` + `envAllowlist`              |
| `sdk.theme.get`                             | `theme:read`                                    |
| `sdk.capabilities.list`                     | 始终可用                                        |

### 文件

```ts
const picked = await sdk.fs.pickFile({ filters: [{ name: 'JSON', extensions: ['json'] }] });
if (picked.ok && picked.data.items.length > 0) {
  const file = picked.data.items[0];
  const contents = await sdk.fs.readFile({ fileToken: file.fileToken });
  if (contents.ok) console.log(contents.data.content);
}
```

插件拿不到真实路径，只有绑定到本插件、本次会话的 token；只读 token 不可写；单文件 8 MiB。

### 网络访问必须经过宿主

插件页面的 CSP 设置了 `connect-src 'none'`，`fetch`、XHR、WebSocket 都会被阻止。这是有意的设计：请使用 `sdk.http.request`、`sdk.socket.*`、`sdk.ssh.*`，由宿主执行权限与白名单校验。

### SSH 与 SFTP

```ts
import { onSshEvent, sdk } from '@devtoolbox/plugin-sdk';

onSshEvent((event) => {
  if (event.event === 'data') appendTerminal(event.text ?? '');
});

const session = await sdk.ssh.connect({ host: 'example.com', username: 'deploy', privateKey });
if (session.ok) {
  const shell = await sdk.ssh.openShell({ sessionId: session.data.sessionId });
  if (shell.ok) {
    await sdk.ssh.write({ sessionId: session.data.sessionId, channelId: shell.data.channelId, data: 'ls\n' });
  }
  await sdk.sftp.list({ sessionId: session.data.sessionId, path: '/var/log' });
}
```

首次连接会固定主机密钥（TOFU）；不匹配时返回 `permission_denied`，需要显式 `sdk.ssh.forgetHost(host, port)` 才能重新信任。

### Socket

```ts
const client = await sdk.socket.tcpConnect({ host: 'example.com', port: 9000 });
const stop = onSocketEvent((event) => {
  if (event.event === 'data') console.log(event.text ?? event.data);
});
if (client.ok) await sdk.socket.tcpSend({ sessionId: client.data.sessionId, data: 'hello\n' });
```

TCP 服务端用 `tcpListen({ port: 0 })` 获取随机端口；UDP 用 `udpBind` + `udpSend`。限制：每插件 32 个会话、单次 1 MiB；禁用/卸载会立即关闭会话。

## 本地开发

```bash
# DevToolBox 仓库内
pnpm --filter @devtoolbox/desktop tauri dev
# 插件
pnpm dev
pnpm build
```

本地加载方式：

1. **文件夹（最快）**：Marketplace 顶部点「安装文件夹」，选择包含 `manifest.json` 与 `package/` 的目录。安装来源标记为「开发」，可重复安装以获取最新构建。
2. **打包安装**：Marketplace → Install .zip。
3. **手动**：把目录复制到应用数据目录的 `plugins/<id>/`（启动时会做状态校准）。

## 打包、签名、发布

```bash
pnpm --filter ./marketplace/modules/market-my-plugin build
pnpm --filter @devtoolbox/marketplace pack market-my-plugin
pnpm --filter @devtoolbox/marketplace keygen --out .signing/my-key.txt
DEVTOOLBOX_SIGNING_KEY=$(cat .signing/my-key.txt) \
  pnpm --filter @devtoolbox/marketplace sign .local-dist/market-my-plugin-0.1.0.zip
pnpm --filter @devtoolbox/marketplace registry market-my-plugin \
  --base-url https://example.com/marketplace --out release-dist/registry.json
```

把 `.zip` 与 `registry.json` 放到任意 HTTPS 静态托管即可；用户添加你的注册表 URL 就能浏览安装。

## 发布前检查

- [ ] `registry` 校验通过
- [ ] 除 `httpDomains` 外无网络请求
- [ ] 所有宿主调用都有错误处理
- [ ] 无 `eval`、远程脚本、内联事件处理器
- [ ] 资源使用相对路径
- [ ] `license` 已填写，仓库公开
- [ ] 遵循 SemVer；新增权限至少 minor 升级
- [ ] 权限被拒时仍能降级运行

## 版本与弃用

- 新增权限/能力 → minor；删除功能或改存储键 → major + 迁移
- 下线某个版本：注册表置 `status: "yanked"`（不再提供新安装，已有安装不受影响）
- 不要改 `id`，发布新插件并弃用旧插件
