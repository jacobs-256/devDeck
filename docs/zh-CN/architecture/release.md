# 发布流程（中文镜像）

> 英文源文档：[docs/architecture/release.md](../../architecture/release.md)。

DevDeck 通过 GitHub Releases 分发，并附带**签名的更新产物**，已安装的客户端可自动更新。

## 一次性准备

生成更新签名密钥（minisign）：

```bash
pnpm --filter @devdeck/desktop exec tauri signer generate \
  -w .signing/devdeck.key
```

- **公钥**写入 `apps/desktop/src-tauri/tauri.conf.json` 的 `plugins.updater.pubkey`，会内嵌进应用；轮换公钥必须先发布一个用旧密钥签名的版本。
- **私钥**保存为仓库 Secrets：`TAURI_SIGNING_PRIVATE_KEY`（密钥文件内容）与 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。
- `.signing/` 已被 git 忽略，切勿提交。

## 发布步骤

```bash
# 版本号需同时更新：package.json、apps/desktop/package.json、
# apps/desktop/src-tauri/tauri.conf.json、Cargo.toml [workspace.package]
pnpm version minor --no-git-tag-version

pnpm lint && pnpm typecheck && pnpm test
cargo fmt --all -- --check && cargo clippy --workspace --all-targets
cargo test --workspace

git add -A
git commit -m "chore(release): 3.1.0"
git tag v3.1.0
git push origin HEAD --tags
```

`.github/workflows/tauri-release.yml` 会：

1. 构建 macOS（arm64）与 Windows（x64）安装包；
2. 用 `TAURI_SIGNING_PRIVATE_KEY` 签名更新产物；
3. 创建 **draft** GitHub Release，包含安装包、`.sig` 与 `latest.json`。

确认无误后手动发布 draft。应用使用的更新地址：

```
https://github.com/jacobs-256/devDeck/releases/latest/download/latest.json
```

## 本地复现签名构建

```bash
TAURI_SIGNING_PRIVATE_KEY="$(cat .signing/devdeck.key)" \
TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
pnpm --filter @devdeck/desktop tauri build --bundles app,dmg \
  --config '{"bundle":{"createUpdaterArtifacts":true}}'
```

产物：`.dmg` 安装包、`DevDeck.app.tar.gz` 更新包、对应 `.sig` 签名。`latest.json` 由 `tauri-action` 生成，CLI 不生成。

## 应用内更新

`Settings → Updates` 调用 `tauri-plugin-updater` 的 `check()`；发现新版本后点击 Install 会下载、用内嵌公钥验签并安装，用户重启应用完成更新。`tauri dev` 下没有可用的发布源，界面会直接显示错误。

## Marketplace 签名独立

插件 ZIP 与 `registry.json` 使用 [Marketplace 协议](marketplace.md#签名) 中描述的**另一把**密钥，勿与更新密钥混用。

## 发布插件市场版本

`Marketplace release` 工作流（`.github/workflows/marketplace-release.yml`）会：构建全部插件模块 → 打包并签名 ZIP → 重新签名 `registry.json` → 逐项验证签名 → 上传到 GitHub Release。`make_latest` 故意设为 `false`，避免影响应用更新器的 `latest.json`。

一次性配置：添加仓库 Secret `MARKETPLACE_SIGNING_KEY`，值为 Base64 Ed25519 种子：

```bash
node marketplace/scripts/sign.mjs keygen --out marketplace-key.txt
# 把输出的 private key 填入 Secret
```

之后推送标签 `marketplace-v1`，或手动运行工作流并填写标签名。产物包括：

| 产物                              | 用途                                |
| --------------------------------- | ----------------------------------- |
| `registry.json` + `.sig`          | 注册表及其 Ed25519 签名             |
| `<plugin>-<version>.zip` + `.sig` | 已签名插件包                        |
| `public-key.txt`                  | 粘贴到 Trust options 的 Base64 公钥 |

用户添加注册表地址：

```
https://github.com/<owner>/<repo>/releases/download/marketplace-v1/registry.json
```

自建托管或预发布环境可用 `MARKETPLACE_DOWNLOAD_BASE_URL=http://<host>/<path>` 生成指向该地址的 `downloadUrl`。

## 密钥轮换

1. 先用当前密钥发布一个版本；
2. 生成新密钥，在下一个应用版本中内嵌新公钥；
3. 用户升级到该版本后，后续版本改用新密钥签名。

私钥丢失无法恢复：用户只能手动安装新版本。

## 发布前检查

- [ ] `package.json`、`apps/desktop/package.json`、`tauri.conf.json`、`Cargo.toml` 版本一致
- [ ] `pnpm lint`、`pnpm typecheck`、`pnpm test` 通过
- [ ] `cargo fmt --check`、`cargo clippy`、`cargo test --workspace` 通过
- [ ] Release draft 含 macOS / Windows 安装包与 `.sig`
- [ ] `latest.json` 指向新版本
- [ ] 发布 draft
- [ ] 可选：打 `marketplace-v<version>` 标签并发布签名注册表
