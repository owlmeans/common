---
name: log
description: How to use @owlmeans/log — the one logging system of an OwlMeans process. Levels (debug|info|warn|error|silent), scoped loggers, structured data with automatic redaction, per-call routing to the console and/or analytics plugins by option parameters, the plugin contract, the global console override, per-environment configuration through cfg.log (file-resolved on a server, build-time in a browser), debug scopes, throttling and testing with the memory plugin. Auto-invoked when adding or changing any log line, importing logger, logThrottle, addLogPlugin, configureLog or appendLog, replacing console.*, wiring a level into a chart or .env, or reading a log to diagnose a process.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/log

**Layer:** Core (depends on `@owlmeans/context` only; isomorphic — server, browser, worker)
**Install:** `"@owlmeans/log": "^0.1.18-rc.1"` in `dependencies`

Everything a process says about itself goes through this package. It owns four decisions that a bare
`console.*` leaves to chance: **how much** is written (the level), **in what form** (text or JSON on a
server, the original objects in a browser), **what is never written** (secrets), and **who else
hears it** (plugins: analytics, a platform link, a file, a test).

## Use it

```ts
import { logger } from '@owlmeans/log'

const log = logger('billing')            // one per module; the scope names where a line comes from
log.debug('Plan read', { entityId })      // chatty: per request, per tick, progress, dumps
log.info('Subscription started', { plan }, { event: 'subscription.started' })
log.warn('Fallback used', { model })      // degraded but continuing
log.error('Save failed', error)           // pass the Error itself — its stack and class survive
log.error('Save failed', { error, id })   // an Error under data.error / data.err is lifted out
if (log.enabled('debug')) log.debug('dump', costly())   // guard a costly argument
const worker = log.child('worker', { queue })           // scope `billing:worker`, `queue` on every line
```

`logger(scope)` is cheap — keep one per module. A scope is lowercase and colon-separated
(`agent:slot`, `publisher:build`); it is what `cfg.log.debug` selects by.

### Levels — what belongs where

| Level | Written when | Examples |
|---|---|---|
| `debug` | the process is being diagnosed | per-request lines, progress, state changes, object dumps, model usage |
| `info` | an operator wants it in production | a job/pipeline started or stopped, a subscription event, a minimal auth event, a server listening, a migration applied |
| `warn` | something degraded and the work went on | a fallback, a refused request, an access-forbidden, a swallowed non-fatal error |
| `error` | the work failed | a fault, a failed write, an unhandled rejection |
| `silent` | nothing | — |

A line that can fire every few seconds is `debug`, or guarded: `if (logThrottle('key', 30_000)) …` is
`true` once per window. Give a significant event a stable dotted name in the options (`{ event: 'job.start' }`)
— it makes the line greppable and lets a plugin pick it up.

### Never write

Tokens, keys, passwords, authorization/cookie headers, whole request or response bodies, user prompts,
file contents, environment values. Log ids, names, sizes, counts, statuses. `redact()` runs on every
record's data and replaces the value of a secret-looking key (`token`, `secret`, `password`,
`authorization`, `cookie`, `apiKey`, `credential`, `private…`, `signature`; `token` only as the END of a
key, so `maxTokens` survives) and clips long strings and deep structures — but it cannot recognize a
secret inside a free-text value, so do not rely on it for a dump.

## Console and analytics are call parameters

One call can go to either, chosen by its options — there are not two APIs:

```ts
log.info('Opened', { page }, { analytics: 'page_view' })               // console AND analytics plugins
log.info('Opened', { page }, { analytics: 'page_view', console: false }) // analytics plugins only
log.info('Plain line')                                                   // console only
```

`analytics` (a name, or `true` to use `event`/the message) hands the call to every plugin's `track`;
it ignores the level — an analytics call needs none. `console: false` keeps it out of the console
sink and the plugins' `log`. Use `analytics` only for product events that something should count.

## Plugins

```ts
interface LogPlugin {
  name: string
  log?: (record: LogRecord) => void        // every record the level filter admitted
  track?: (event: AnalyticsEvent) => void  // every call that asked for analytics
  install?: () => void; uninstall?: () => void
}
addLogPlugin(plugin)  // same name replaces; returns the remover
```

Analytics systems (`@owlmeans/web-log`'s GTM plugin, a server-side measurement sender), a target's
link to the platform (`@owlmeans/viable-log`), a file or a test's memory are all plugins. A plugin that
throws is skipped (and reported at most once a minute) — logging never breaks the work.

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

## Test with it

```ts
const memory = memoryPlugin()
addLogPlugin(memory)
logger('x').warn('boom', { id: 1 })
expect(memory.records[0]).toMatchObject({ level: 'warn', scope: 'x', data: { id: 1 } })
resetLog()           // restores the console, drops plugins, back to the defaults
```

`configureLog({ level: 'silent' })` quiets a noisy test; do not replace `console.*` methods — the sink
writes through captured natives, so it would not see them.

## API

`logger`, `appendLog`, `configureLog`, `logConfig`, `logEnabled`, `logThrottle`, `addLogPlugin`,
`removeLogPlugin`, `logPlugins`, `overrideConsole`, `restoreConsole`, `resetLog`, `memoryPlugin`,
`redact`, `parseLogLevel`, `nativeConsole`; types `LogConfig`, `LogRecord`, `AnalyticsEvent`,
`LogPlugin`, `Logger`, `LogOptions`.
