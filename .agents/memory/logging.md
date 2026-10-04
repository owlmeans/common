# Logging

`packages/log/**`, `packages/web-log/**`, `packages/viable-log/**`, and every `logger(...)` call site.

## The shape

`@owlmeans/log` (core, depends on `context` only) is the one logging system; `web-log` and
`viable-log` are plugins over it. `makeServerContext` and `makeClientContext` call `appendLog`, so
every app is wired without app code — which also OVERRIDES the global `console` (levels map 1:1,
`log`/`debug`/`trace` become debug). Console and analytics are call OPTIONS, not two APIs.

## Facts that cost time to rediscover

- **State lives on `globalThis`** under `Symbol.for('owlmeans.log.state')`. Two copies of the module
  (duplicate workspace links, a bundler that failed to dedupe) share one level, one plugin list and
  ONE captured native console. A per-module state made the second copy capture the first's override
  and call itself.
- **The sink writes through console methods captured at module load** — a test that replaces
  `console.warn` sees nothing. Read the log with `memoryPlugin()`; `nativeConsole()` is the mutable
  captured set for a test of the sink itself.
- **Config arrives in three steps**, so `appendLog` applies `cfg.log` three times: at once, as a
  Config middleware (registered after the file reader — same-stage middlewares start in registration
  order and the reader is synchronous), and as a Context middleware (runs only after EVERY config
  middleware finished — the one with the last word).
- **File-resolved values are strings**: `"false"` is truthy. `cfg.log` fields parse strings and ignore
  what does not parse (an unresolved `/etc/...` path included); booleans a process needs at context
  creation (`debug.supervisor`) are read synchronously and coerced by the app's config.
- **A browser's level is a build-time constant** — the i18n instance is created at the first render,
  before the advertised config arrives, and `log` is not in the advertised allow-list on purpose.
- **`debug.all` is not the log switch.** It is set to true by whole app families; it gates the
  supervisor, the OIDC provider's dev behaviour and the client debug menu. i18next debug follows
  `logEnabled('debug', 'i18n')`.
- **Redaction**: `token` only matches at the END of a key (`maxTokens`/`tokenCount` are usage
  numbers, not secrets). The mailer's console transport logs at info on purpose — e2e reads login
  codes from it; the iam-api `[iam:mail:test]` line likewise.
- **Fastify** gets a pino-shaped adapter (`loggerInstance`) with request logging disabled; a request
  is one debug line from `onResponse`, a failed one is classified in `handleError`
  (5xx error / 403 warn `access.forbidden` / 401 debug `auth.refused`).
