# 常见问题（用户）

## 应用市场

### 应用市场是空的

DevToolBox 没有内置注册表，需要手动添加：

1. 打开 **应用市场**。
2. 粘贴 `registry.json` 地址并点击 **Add registry**。
3. 如未更新，点击 **Refresh**。

本地开发允许 `http://localhost` / `http://127.0.0.1`，其他地址必须是 HTTPS。

### 安装提示 “Only https is allowed”

注册表与下载地址必须是 `https://`；仅回环地址允许 HTTP。

### 安装提示签名或摘要错误

安装包与注册表记录不一致：作者可能重新打包但未更新 `sha256`，或注册表已过期，或固定公钥的来源提供了未签名/被篡改的包。请刷新注册表并联系作者重新签名。

### 如何验证注册表签名？

**设置 → 注册表 → Trust options**，粘贴 Ed25519 公钥，并勾选强制签名。未配置公钥时仍会校验 SHA-256。

### 插件运行在哪里？

插件运行在 `plugin://` 协议的沙箱 iframe 中，无法直接访问文件、网络或 SSH；所有特权调用由 Rust 宿主按权限校验，插件 CSP 禁止直接联网。

### 可以离线使用吗？

可以。27 个内置工具均离线可用；只有声明了网络权限的插件需要联网。

## 更新

在 **设置 → Updates** 点击 **Check for updates**。更新包从 GitHub Releases 下载并验签。3.0.0 没有后台自动检查开关。

## 外观与语言

主题和语言保存在数据目录的 `settings.json`，启动时恢复；在 **设置 → General** 修改。

## 数据

- macOS：`~/Library/Application Support/com.devtoolbox.app`
- Windows：`%APPDATA%\com.devtoolbox.app`

包含 `settings.json`、`marketplace-state.json`、`marketplace-sources.json`、插件、插件存储、日志与 `known-hosts.json`。

重置：退出应用后删除数据目录（或仅删除 `settings.json` 重置外观/语言）。

## 支持

在 [GitHub Issues](https://github.com/XthingsJacobs/devToolBox/issues) 提交版本、系统、复现步骤与日志。安全问题请遵循[安全策略](../../governance/security.md)。
