---
name: config
description: The global console override appendLog installs, and cfg.log (level, debug scopes, format, console) on a server, file-resolved, and in a browser, at build time.
metadata:
  purposes: config, ops
  mentions: cfg.log, appendLog, configureLog, logConfig, overrideConsole, restoreConsole, nativeConsole, parseLogLevel, VITE_LOG_LEVEL
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/log — Configuration and the console override

## Console override

`appendLog(context)` — which `makeServerContext` and `makeClientContext` already call — applies
`cfg.log` and **replaces the global `console`**: `console.debug/log/trace` become debug, `info`, `warn`
and `error` keep their level, all under scope `console`. A library that still calls `console.*` is
therefore under the same level as everything else. `cfg.log.console: 'native'` leaves the console
alone; CLIs do not install the override. Do not write new `console.*` calls anyway: a scope and a
level are the point.

The sink writes through the console methods captured when the module loaded (shared through
`globalThis`, so duplicate copies of the package cannot capture each other's override). In a browser
the sink passes the original objects, **including an `Error`, to `console.error`** — an error reporter
hooked on `console.error` (the preview's) keeps working.

## Configure it — `cfg.log`

```ts
cfg.log = { level: 'info', debug: 'agent:slot,jobs', format: 'text', console: 'override' }
```

| Field | Values | Meaning |
|---|---|---|
| `level` | `debug` `info` `warn` `error` `silent` | the floor; default `info` |
| `debug` | `'*'` or comma-separated scopes | scopes that log at debug whatever `level` is (a scope matches itself and its children) |
| `format` | `text` `json` | server sink only |
| `console` | `override` `native` | whether `appendLog` replaces the global console |

Every field also accepts the raw string a config file resolves to; a value that does not parse
(including an unresolved `/etc/…` path) is ignored and the previous setting stays — a mistake can
never silence or flood a process.

- **Server:** declare the leaves as file paths (`level: '/etc/app-config/log-level'`); the server
  context's file reader resolves them, and `appendLog` applies the result — as a Config middleware
  right after the reader and again as a Context middleware after every reader has finished.
- **Browser:** the value must be known at the first render (the i18n instance is created then), so
  it is a **build-time constant** (`import.meta.env.VITE_LOG_LEVEL` in a Vite app), not something the
  API's advertised config can change later. `log` is deliberately NOT in the advertised config.
- `debug.all` of `cfg.debug` no longer controls logging; it is a feature flag for other things.
