# @owlmeans/log

The one logging system of an OwlMeans process — server, browser or worker. It decides how much is
written (a level, plus per-scope debug), in what form (text or JSON lines on a server, the original
objects in a browser), what is never written (secret-looking keys are redacted, bytes become sizes,
long values are clipped), and who else hears a call (plugins: analytics, a platform link, a file, a
test). Application code uses `logger(scope)` in every module instead of `console.*`; the server and
client context factories already call `appendLog`, which applies `cfg.log` and routes the global
`console` through the logger. It ships no analytics or remote sink itself — those are plugins such
as `@owlmeans/web-log` for a tag manager.

## Installation

```bash
bun add @owlmeans/log@^0.1.18-rc.2
```

## Concepts

- **Scope** — a lowercase, colon-separated name (`billing`, `jobs:queue`) saying where a line comes
  from; `child(name)` appends `:<name>`. Debug scopes select by it.
- **Level** — `debug` < `info` < `warn` < `error`; `silent` admits nothing. The default floor is
  `info`. Scopes listed in `cfg.log.debug` (or `'*'`) log at `debug` regardless, children included.
- **Record** — `LogRecord`: level, scope, message, time, redacted `data`, optional `event`, and the
  `Error` the call carried, kept intact.
- **Routing by options** — a call goes to the console sink and plugins' `log` unless
  `console: false`; it also goes to plugins' `track` when `analytics` is set. Analytics ignore the
  level.
- **Plugin** — `LogPlugin` `{ name, log?, track?, install?, uninstall? }`. A plugin that throws is
  skipped and reported at most once a minute; logging never breaks the work.
- **Console override** — `console.debug/log/trace` become `debug`, `info/warn/error` keep their
  level, all under scope `console`. The sink writes through the natives captured at load time and
  shared on `globalThis`, so duplicate module copies cannot recurse.

## Usage

### Log from a module

```typescript
import { logger, logThrottle } from '@owlmeans/log'

const log = logger('billing')

log.debug('Plan read', { entityId })
log.info('Subscription started', { plan }, { event: 'subscription.started' })
log.warn('Fallback used', { model })
log.error('Save failed', error)              // pass the Error itself
log.error('Save failed', { error, id })      // an Error under data.error / data.err is lifted out

if (log.enabled('debug')) {
  log.debug('Dump', buildCostlyDump())
}

const worker = log.child('worker', { queue })   // scope 'billing:worker', `queue` on every line

if (logThrottle('billing:poll', 30_000)) {
  log.info('Still polling')
}
```

### Send an analytics event

```typescript
log.info('Opened', { page }, { analytics: 'page_view' })                    // console and analytics
log.info('Opened', { page }, { analytics: 'page_view', console: false })    // analytics only
```

### Configure a process

The server and client context factories call `appendLog` already; a hand-built context calls it
once. `defaults` fills only what `cfg.log` leaves out.

```typescript
import { appendLog } from '@owlmeans/log'

cfg.log = { level: '/etc/app-config/log-level', debug: 'agent:slot,jobs', format: 'json' }
appendLog(context, { level: 'info' })
```

On a server, leaves may be config-file paths resolved by the file reader; `appendLog` applies the
policy at once, again as a Config middleware and again as a Context middleware after every reader.
In a browser the level must be a build-time constant (for example `import.meta.env.VITE_LOG_LEVEL`).
A value that does not parse — an unresolved path included — is ignored and the previous setting
stays. A CLI that should keep its own console calls `configureLog` without the override.

### Write a plugin

```typescript
import { addLogPlugin } from '@owlmeans/log'
import type { LogPlugin } from '@owlmeans/log'

const remove = addLogPlugin({
  name: 'metrics',
  log: record => { if (record.level === 'error') errorCounter.inc({ scope: record.scope }) },
  track: event => sendMeasurement(event.event, event.data),
} satisfies LogPlugin)

remove()   // or removeLogPlugin('metrics')
```

### Test with the memory plugin

```typescript
import { addLogPlugin, logger, memoryPlugin, resetLog } from '@owlmeans/log'

const memory = memoryPlugin()
addLogPlugin(memory)
logger('x').warn('boom', { id: 1, apiKey: 'k' })
expect(memory.records[0]).toMatchObject({ level: 'warn', scope: 'x', data: { id: 1, apiKey: '[redacted]' } })
resetLog()   // real console, no plugins, default settings
```

## API

### Functions

| Symbol | Purpose |
|---|---|
| `logger(scope, base?)` | `Logger`: `debug`, `info`, `warn`, `error` `(message, data?, options?)`, `child(name, data?)`, `enabled(level?)`, `scope` |
| `appendLog(context, defaults?)` | apply `cfg.log` now and in the Config and Context middlewares; override or restore the console; idempotent per context |
| `configureLog(config)` | apply a `LogConfig`; absent or unparseable fields keep the previous value |
| `logConfig()` | the effective `{ level, format, console, debug }` |
| `logEnabled(level = 'debug', scope = '')` | whether a record would be written now |
| `logThrottle(key, ms = 30_000)` | `true` the first time a key is seen, then once per window |
| `addLogPlugin(plugin)` / `removeLogPlugin(name)` / `logPlugins()` | manage destinations; same name replaces |
| `overrideConsole()` / `restoreConsole()` | route `console` through the logger / put the natives back |
| `resetLog()` | restore console, drop plugins, reset level, scopes, format, mode and throttles |
| `memoryPlugin(name = 'memory')` | `MemoryPlugin` collecting `records` and `events`, with `clear()` |
| `nativeConsole()` | deprecated `compat:factory-refactor` wrapper of `logStateHelper.nativeConsole()` |

### Helpers

| Symbol | Members |
|---|---|
| `logLevelHelper`, `createLogLevelHelper()` | `parseLogLevel(value, fallback?)` (accepts `warning`), `parseLogFormat`, `parseLogConsole`, `parseDebugScopes`, `levelAdmits(floor, level)` |
| `redactHelper`, `createRedactHelper()` | `redact(value)` — never throws; `errorData(error)` — name, message, code, type, incidentId, stack |
| `logStateHelper`, `createLogStateHelper()` | `state()`, `nativeConsole()`, `isBrowser()` |

### Constants

| Symbol | Value / purpose |
|---|---|
| `LEVEL_RANK`, `LOG_LEVELS` | `debug` 10, `info` 20, `warn` 30, `error` 40, `silent` 100 |
| `DEFAULT_LOG_LEVEL` | `'info'` |
| `CONSOLE_SCOPE` | `'console'` |
| `REDACTED` | `'[redacted]'` |
| `SECRET_KEY` | key pattern: secret, password, authorization, cookie, api key, credential, private, signature, `pk`, and `token` only at the end of a key |
| `MAX_STRING`, `MAX_DEPTH` | `2000` characters, depth `4` |
| `STATE_KEY` | `Symbol.for('owlmeans.log.state')` |

### Types

`LogLevel`, `LogFormat`, `LogConsoleMode`, `LogConfig`, `LogOptions`, `LogRecord`, `AnalyticsEvent`,
`LogPlugin`, `LogMethod`, `Logger`, `MemoryPlugin`, `ConsoleMethod`, `NativeConsole`, `LogState`,
`LogLevelHelper`, `RedactHelper`, `LogStateHelper`, and the `BasicConfig.log?: LogConfig`
augmentation of `@owlmeans/context`.

## Sink formats

| Where | Output |
|---|---|
| Server, `format: 'text'` | `<iso> LEVEL [scope] message event=… key=value …`, then the stack |
| Server, `format: 'json'` | one JSON object: `time`, `level`, `scope`, `msg`, `event?`, `data?`, `err?` |
| Browser | `[scope] message`, the data object and the `Error` as separate console arguments; `debug` uses `console.log` |

## Common pitfalls

- Do not write new `console.*` calls; use a scoped logger and a deliberate level.
- Redaction works on keys only. Never pass a request, a body, a prompt, a message or any free text
  that can hold secrets or personal content; log ids, sizes, counts and statuses.
- Pass the `Error` object, not `error.message` or `JSON.stringify(error)`.
- A line that can fire every few seconds is `debug` or guarded by `logThrottle`.
- Set the level per environment in config, never in code; `cfg.debug.all` does not control logging.
- In tests read `memoryPlugin()` records; spying on `console` misses the sink, which writes through
  captured natives.

The `log` skill covers the mechanics (levels, routing, plugins, console override, configuration);
the `logging` skill is the policy for what application code logs and at which level.

## Related packages

- [`@owlmeans/context`](../context) — `BasicConfig.log` and the middleware stages `appendLog` uses
- [`@owlmeans/web-log`](../web-log) — browser analytics plugin for a tag manager
- [`@owlmeans/viable-log`](../viable-log) — a generated target's log link to the platform
- [`@owlmeans/server-api`](../server-api) — adapts Fastify's own records into this logger, without bodies, headers or queries

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.49
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
