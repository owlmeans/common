---
name: getting-started
description: Start a protocol-first OwlMeans application with shared contracts, server entrypoints and browser entrypoints.
metadata:
  scope: general
---

# Protocol-first application shape

An OwlMeans application owns one shared protocol declaration and creates local entrypoints for each
runtime. The declaration is never modified by a server or browser.

```ts
// common/src/entrypoints.ts
export const sessionProtocols = {
  list: protocol(
    route(session.list, '/session', backend()),
    contract.request({ query: typed<SessionQuery>(SessionQuerySchema) }, typed<Session[]>())
  ),
}
```

```ts
// api/src/entrypoints.ts
const api = handlers<Context>()
export const serverBindings = [
  ...frameworkEntrypoints,
  bind(sessionProtocols.list, api.request(sessionProtocols.list, listSessions)),
]
```

```ts
// web/src/entrypoints.ts
export const clientBindings = [
  ...frameworkEntrypoints,
  ...bindAll(sessionProtocols),
]

const sessions = await context.entrypoint(sessionProtocols.list).call({ query: { sid } })
```

Use `schema<T>(...)` or `typed<T>(...)` at the contract boundary. Bind all route parents with their
children. Keep organization entity values on the wire as `entitySlug`; database relations use
`entityId` only.

## Configuration per runtime

The shared config in `common` (services, alias, security) is imported by both runtimes, so it
never reads `process.env` or `import.meta.env`, and it never sets `cfg.debug = { all: true }`.
Each runtime's own `config.ts` adds what depends on its environment — the log level above all
(`logging`, `log`), behind a type-only `import type {} from '@owlmeans/log'`:

```ts
// api/src/config.ts — Bun runtime env
cfg.log = { level: process.env.LOG_LEVEL || 'info', debug: process.env.LOG_DEBUG ?? '' }

// web/src/config.ts — Vite build-time env, typed in vite-env.d.ts
const env = import.meta.env
cfg.log = { level: env.VITE_LOG_LEVEL || (env.PROD ? 'info' : 'debug'), debug: env.VITE_LOG_DEBUG ?? '' }
```

The server and client contexts apply `cfg.log` themselves; application code logs through
`logger('<scope>')` from `@owlmeans/log`, never `console.*`.
