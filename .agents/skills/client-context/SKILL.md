---
name: client-context
description: How to use @owlmeans/client-context — makeClientContext(), the ClientConfig shape, config() and serviceRoute(alias, makeDefault?) — the platform-agnostic client context every web and native context is built from. Auto-invoked when building a client context, declaring a client config, or resolving a service route on the client.
user-invocable: false
---

# @owlmeans/client-context

**Layer:** Client
**Install:** `"@owlmeans/client-context": "^0.1.18-rc.12"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeClientContext(cfg)` | The base client context factory — a basic context plus `serviceRoute` and a registered API client |
| `ClientContext<C>` | The context interface — `BasicContext` + `ConfigResourceAppend` + `serviceRoute(alias, makeDefault?)` |
| `ClientConfig` | `BasicClientConfig` + `services` (the service-route table) + optional `i18n` |
| `config(service, cfg?)` | Build a `ClientConfig` for `service` with `AppType.Frontend` already set |
| `PLUGINS` (`plugins`) | Alias of the second config resource, the one plugin records live in |

## Usage

Most apps never call this directly — `@owlmeans/client` wraps it (adding state, modal, debug and
the router accessor), and `@owlmeans/web-client`, `@owlmeans/web-panel` and their native
counterparts wrap that. A wrapper calls the layer below once, applies its own idempotent
`append*(context)` mixins, and returns the same context: one context per process, built by one
factory.

```typescript
import { makeClientContext, config } from '@owlmeans/client-context'

const cfg = config<Config>(MY_APP, { services: { ... } })
const context = makeClientContext<Config, Context>(cfg)
```

`makeClientContext` appends the API client (`appendApiClient`) itself, so an entrypoint can make a
call as soon as the context is configured — nothing else has to register a carrier. Which carrier a
given call uses is `cfg.webService`, from `@owlmeans/client-config`.

## Service routes

```typescript
const route = context.serviceRoute(MANAGER, true)   // and mark it the default one
```

`serviceRoute` reads `cfg.services[alias]` and, with a boolean second argument, sets that route's
`default` flag — which is how an app says "unqualified addresses belong to this service". It
returns the live route object, so the flag is set on the config the rest of the context reads.

An unknown alias throws a `SyntaxError` that **names every registered service**. Expect to see it
during import, with a blank page and a stack pointing into the framework; the usual cause is a
route alias passed where a service alias belongs, since both are plain strings and nothing earlier
objects.

## Depends On

- `@owlmeans/context` — `makeBasicContext`, `AppType`, `makeBasicConfig`
- `@owlmeans/client-config` — `BasicClientConfig`
- `@owlmeans/api` — the API client appended into every client context
- `@owlmeans/route` (`CommonServiceRoute`), `@owlmeans/i18n`, `@owlmeans/config`

## Related

- [[client]] — the React layer, whose own `makeClientContext` builds on this one
- [[client-config]] — `webService` and the rest of the base client config
