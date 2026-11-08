# @devdeck/plugin-sdk

The official SDK for building **DevDeck Marketplace** plugins.

A plugin is a regular web app (HTML + JS/TS, any framework) that runs sandboxed
inside DevDeck. It reaches host capabilities only through this SDK, and the
host enforces the permissions declared in `manifest.json` on every call.

## Install

```bash
pnpm add @devdeck/plugin-sdk
```

## Minimal plugin

```ts
import { sdk, followHostTheme } from '@devdeck/plugin-sdk';

followHostTheme((theme) => document.documentElement.classList.toggle('dark', theme === 'dark'));

const result = await sdk.http.request<{ ip: string }>({
  url: 'https://api.ipify.org?format=json',
});

if (result.ok) {
  document.body.textContent = `Your IP: ${result.data?.data.ip ?? 'unknown'}`;
} else {
  document.body.textContent = `${result.error.code}: ${result.error.message}`;
}
```

## Permissions

Every namespace maps to a permission that must be declared in `manifest.json`:

| SDK call                  | Permission                                      |
| ------------------------- | ----------------------------------------------- |
| `sdk.storage.*`           | `storage:kv`                                    |
| `sdk.http.request`        | `http:proxy` or `http:external` + `httpDomains` |
| `sdk.log.*`               | `log:write`                                     |
| `sdk.system.openExternal` | `system:openExternal`                           |
| `sdk.system.getInfo`      | `system:getInfo`                                |
| `sdk.theme.get`           | `theme:read`                                    |
| `sdk.capabilities.list`   | always allowed                                  |

A call without the matching permission fails with
`{ code: "permission_denied" }`. Plugins should degrade gracefully rather than
assuming a capability is present.

## Error handling

Every call resolves to `SdkResult<T>`:

```ts
{ ok: true, data } | { ok: false, error: { code, message, details? } }
```

Branch on `error.code` (`permission_denied`, `timeout`, `invalid_argument`,
`not_found`, …), never on the message text.

## License

Apache-2.0
