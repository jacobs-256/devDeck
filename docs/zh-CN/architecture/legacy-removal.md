# 移除旧 Electron 实现

状态：**已就绪，尚未执行。** Tauri 应用、插件 SDK 与 Marketplace 模块都不依赖 `core/` 或 Electron，CI 中的守卫会持续检查。删除只是清理工作，维护者确认不再需要旧实现作为参考后即可执行。

## 守卫

```bash
pnpm lint:legacy
```

`scripts/check-legacy-imports.mjs` 会扫描 `apps/desktop/src`、`apps/desktop/src-tauri/src`、`packages/plugin-sdk/src`、`marketplace/modules`，发现 `core/…` 或 `electron` 导入即失败。它已接入 `pnpm lint` 与 CI。

## 清单

| 路径                                  | 内容                                              | 替代                                               |
| ------------------------------------- | ------------------------------------------------- | -------------------------------------------------- |
| `core/`                               | Electron 主进程/预加载、React 渲染层、27 个旧工具 | `apps/desktop/`、`crates/`、`packages/plugin-sdk/` |
| `build/`                              | Electron 图标与 entitlements                      | `apps/desktop/src-tauri/icons/`、`tauri.conf.json` |
| `electron-builder.yml`                | Electron 打包配置                                 | `tauri.conf.json`、`tauri-release.yml`             |
| 根 `vite/vitest/tsconfig`             | 旧渲染层构建与 `core/` 别名                       | `apps/desktop/` 下的配置                           |
| `scripts/new-tool.mjs` 等             | 旧工具脚本                                        | `apps/desktop/src/tools/`、`lint:legacy`           |
| `dist/`、`dist-electron/`、`release/` | 生成的 Electron 产物                              | `target/release/bundle/`                           |
| `docs/core-dev/`                      | Electron 架构文档                                 | `docs/architecture/`                               |

`marketplace/`、`docs/architecture/`、`docs/plugin-dev/`、`design/` 保留。

## 步骤

1. 确认守卫与质量门通过：`pnpm lint:legacy`、`pnpm test`、`pnpm build`、`cargo test --workspace`。
2. 删除目录与配置（`git rm -r core build dist dist-electron release docs/core-dev`，以及 `electron-builder.yml`、根 Vite/Vitest/tsconfig、旧脚本）。
3. 精简 `package.json`：移除 `legacy:*`、`new:tool`、`lint:modules`、`prune:pnpm-links`、Electron 相关依赖与 `postinstall`；`test` 指向 `pnpm --filter @devtoolbox/desktop test`。
4. 删除 CI 中的 **Legacy Electron build** 步骤。
5. 文档清理：`docs-site/mkdocs.yml` 移除 `core-dev/*`，README 删除 `legacy:*` 段落与 `core/` 说明。
6. 全量验证：`pnpm install && pnpm lint && pnpm typecheck && pnpm build && pnpm test`、`cargo fmt/clippy/test`、`pnpm package:mac`、`./scripts/marketplace-acceptance.sh market-emoji-search`，最后启动 release 二进制并打开一个内置工具与一个已安装插件。

## 为什么现在不删？

`core/` 仍可作为已迁移工具的边界行为参考，且删除不可逆。目标本身并不依赖它：新代码没有导入、CI 仅让它保持可编译，所有功能都有带测试的 Tauri 实现。
