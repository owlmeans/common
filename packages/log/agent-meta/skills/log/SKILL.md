---
name: log
description: How to use @owlmeans/log — the one logging system of an OwlMeans process. Levels (debug|info|warn|error|silent), scoped loggers, structured data with automatic redaction, per-call routing to the console and/or analytics plugins by option parameters, the plugin contract, the global console override, per-environment configuration through cfg.log (file-resolved on a server, build-time in a browser), debug scopes, throttling and testing with the memory plugin. Auto-invoked when adding or changing any log line, importing logger, logThrottle, addLogPlugin, configureLog or appendLog, replacing console.*, wiring a level into a chart or .env, or reading a log to diagnose a process.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/log

**Layer:** Core (depends on `@owlmeans/context` only; isomorphic — server, browser, worker)
**Install:** `"@owlmeans/log": "^0.1.18"` in `dependencies`

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

Tokens, keys, passwords, authorization/cookie headers, whole request or response bodies, query
strings, user prompts and messages, e-mail text, file contents, environment values. Log ids, names,
sizes, counts, statuses. `redact()` runs on every record's data and replaces the value of a
secret-looking key (`token`, `secret`, `password`, `authorization`, `cookie`, `apiKey`, `credential`,
`private…`, `signature`; `token` only as the END of a key, so `maxTokens` survives), writes bytes (a
`Buffer`, a typed array, an `ArrayBuffer`) as their size (`[Uint8Array 19 bytes]`) and clips long
strings and deep structures — but it cannot recognize a secret or a person's text inside a free-text
value or under an innocent key (`body`, `note`, `rationale`), so never hand it a request, a body or a
dump. A server framework's own records are made safe by its adapter: `@owlmeans/server-api` drops
bodies, headers and queries from every Fastify record (`/server-api` § Logging).

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

## API

`logger`, `appendLog`, `configureLog`, `logConfig`, `logEnabled`, `logThrottle`, `addLogPlugin`,
`removeLogPlugin`, `logPlugins`, `overrideConsole`, `restoreConsole`, `resetLog`, `memoryPlugin`,
`redact`, `parseLogLevel`, `nativeConsole`; types `LogConfig`, `LogRecord`, `AnalyticsEvent`,
`LogPlugin`, `Logger`, `LogOptions`.

## Parts

Load a part on top of this core when its job is in play.

| Part | Load it when |
|---|---|
| [plugins](parts/plugins.md) | Writing or registering a log plugin — analytics, a platform link, a file (`LogPlugin`, `addLogPlugin`) |
| [config](parts/config.md) | Setting a level or debug scopes (`cfg.log`, a chart, `.env`, a Vite constant), or the global console override |
| [test](parts/test.md) | Asserting on log lines in a test, or quieting a noisy one (`memoryPlugin`, `resetLog`) |
