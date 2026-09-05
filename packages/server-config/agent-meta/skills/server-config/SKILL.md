---
name: server-config
description: How to use @owlmeans/server-config — sservice() to declare a backend service route in the config, readConfigValue() to read a value out of a mounted file, and the BasicServerConfig shape that adds secrets. Auto-invoked when building a server config, declaring a backend service, or feeding a mounted secret into config.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-config

**Layer:** Server
**Install:** `"@owlmeans/server-config": "^0.1.18-rc.12"` in `dependencies`

The server-side half of `@owlmeans/config`. Small on purpose: it declares backend services and it
reads file-backed values. Everything else about config lives in `@owlmeans/config`, and the context
that applies these is `@owlmeans/server-context`.

## Key Exports

| Export | Description |
|--------|-------------|
| `sservice(service, cfg?)` | Declare a backend service route into `cfg.services` and return the config |
| `readConfigValue(value, def?)` | A value starting with `/` or `file://` becomes the trimmed contents of that path; `undefined` falls back to `def`, and any other string is returned as is |
| `BasicServerConfig` | `CommonConfig` plus `secrets: Record<string, string>` |

## Declaring services

`sservice` takes a `ServiceRoute` without `type` — `service` (the alias other routes name), `host`
/ `port` for how the world reaches it, `internalHost` / `internalPort` for how the cluster does,
`base`, and `opened` (bind on all interfaces rather than loopback). It writes the entry under
`service.service` and defaults `type` to `AppType.Backend` — a default only, because the entry
already stored under that alias is spread over it: an alias first declared by `service()` from
`@owlmeans/config` as `AppType.Frontend` keeps that type through a later `sservice` call. Declare a
frontend service with `service()`.

```typescript
import { sservice } from '@owlmeans/server-config'

let cfg = sservice({ service: MY_SERVICE, internalHost: 'my-api', internalPort: 8080, opened: true })
cfg = sservice({ service: AGENT, internalHost: 'agent', internalPort: 8081 }, cfg)
```

**One call per service, and it carries the whole address.** The write merges over whatever the key
already held, but `host` and `port` are then set last and unconditionally from the incoming argument
alone — `host: service.host ?? service.internalHost`, `port: service.port ?? service.internalPort`.
So a second `sservice` for the same alias that names no address at all overwrites the stored `host`
and `port` with `undefined`, and the service becomes unaddressable. Amend an existing entry by
assigning the field instead:

```typescript
cfg.services[MY_SERVICE].opened = true
```

That last-write rule is also the mirroring rule: whenever `host` / `port` are unset, the internal
ones become them. An entry declared with `internalHost` / `internalPort` only therefore carries the
cluster address in `host` / `port` as well — which is what a client sees wherever the config is
advertised (`@owlmeans/api-config-server`), so an internal address is not a private one.

The service the process **is** — `cfg.services[cfg.service]` — is the one the API server binds:
`internalPort ?? port` is the port, and `opened` decides between `0.0.0.0` and `127.0.0.1`. A peer
service is declared the same way and is never bound, only addressed.

`@owlmeans/server-app` re-exports `sservice`, so an app on it needs no direct dependency here.

## File-backed values

`readConfigValue` is how a mounted secret becomes a config value: a string starting with `/` or
`file://` is handed to `readFileSync` and its contents trimmed, `undefined` falls back to `def`, and
every other string is returned unchanged. That makes a config literal and a mounted path
interchangeable at the same key, which is what lets a deployment inject a credential without a code
path of its own.

**Mount the secret at an absolute path.** A `file://` prefix passes the same test but is handed to
`readFileSync` as a literal string, and that does not resolve a URL: the read fails with `ENOENT`
on the URL text itself rather than returning the file. `/` is the form that works, and the only one
anything in the framework produces.

```typescript
import { readConfigValue } from '@owlmeans/server-config'

const secret = readConfigValue(process.env.MY_SECRET, 'dev-secret')
```

Reading is synchronous and unguarded — a missing file throws where it is called. A whole config tree
is converted at once by the `fileConfigReader` middleware from `@owlmeans/server-context`, so an app
rarely calls this itself; reach for it when a value is produced outside the config tree.

`secrets` on `BasicServerConfig` is the conventional home for those values — a flat map, so every
entry can be either a literal or a path and the reader treats them alike.

## Depends On

- `@owlmeans/config`, `@owlmeans/server-route`
