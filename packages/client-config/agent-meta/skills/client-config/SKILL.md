---
name: client-config
description: How to use @owlmeans/client-config — the BasicClientConfig shape every client config extends (webService, primaryHost, primaryPort, shortAlias) and addWebService() for naming which API client carries a call. Auto-invoked when typing a client config, wiring an app to its API service, or resolving which web service an entrypoint calls through.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/client-config

**Layer:** Client
**Install:** `"@owlmeans/client-config": "^0.1.18-rc.12"` in `dependencies`

The bottom of the client config stack: the few fields a client adds to `CommonConfig`, and the
helper that fills the one field a client cannot work without. Nothing here knows about React or the
browser.

## Key Exports

| Export | Description |
|--------|-------------|
| `BasicClientConfig` | `CommonConfig` + `webService`, `primaryHost`, `primaryPort`, `shortAlias` |
| `addWebService(service, alias?, cfg?)` | Point calls at an API client — globally, or per target service |
| `DEFAULT_KEY` (`default`) | The key `webService` uses for the fallback API client |

`ClientConfig` — the config a context is actually built from — is **not** here: it lives in
`@owlmeans/client-context`, which adds `services` and `i18n` on top of `BasicClientConfig`.

## The fields

| Field | Meaning |
|---|---|
| `webService` | Which API client carries an outgoing call. A string names one for everything; a record maps the *target service* alias to an API client alias, with `DEFAULT_KEY` as the fallback |
| `primaryHost` / `primaryPort` | The host the app is being served from. `@owlmeans/web-client` fills these from `window.location` while building the context — do not set them by hand |
| `shortAlias` | An abbreviation of `service`, so a flow or a redirect can name this app in a query parameter without spelling the full alias |

## Naming the API client

```typescript
import { addWebService } from '@owlmeans/client-config'

addWebService(API_CLIENT, cfg)                  // one client for every call
addWebService(BILLING_CLIENT, BILLING, cfg)     // ...and this one for calls to the billing service
```

The **three-argument** form never drops what is already there, and what it writes depends on the
state it finds:

| `webService` before | After `addWebService(S, ALIAS, cfg)` |
|---|---|
| unset | `{ default: S, ALIAS: S }` — the first per-service call **also** becomes the global default |
| the string `X` | `{ default: X, ALIAS: S }` — the general answer is demoted, not lost |
| a record | that record with `ALIAS: S` added |

So a first call meant as service-specific is not specific: name the general client first, or accept
that this one answers for everything else too.

The **two-argument** form sets the general answer: an unset or string `webService` becomes the plain
string, and on a record it writes only `DEFAULT_KEY`. Called with no `cfg` at all it builds and returns a fresh partial config
to spread. `@owlmeans/web-panel`, `@owlmeans/mui-panel` and `@owlmeans/server-app` re-export it, so
an app configures through the package it already imports.

A client entrypoint resolves its carrier from this field on every call, and refuses before anything
else when the field is absent: `SyntaxError('No webService provided')` is "this config never named
an API client", and it is thrown even for a call a registered transport would have carried. When
the field is a record with neither the target service's alias nor `DEFAULT_KEY`, the failure is
``SyntaxError("Can't cast web service alias for <alias> entrypoint")`` instead.

`webService` is listed in `notAdvertizedConfigKeys` (`@owlmeans/api-config`), so
`@owlmeans/api-config-server` filters it out of the `ApiConfig` it advertises, and
`@owlmeans/api-config-client` merges only what came back. Pulling config from the server never
supplies this field — every client names its API client locally.

## Depends On

- `@owlmeans/config` — `CommonConfig`, which `BasicClientConfig` extends

## Related

- [[client-context]] — `ClientConfig` and the context factory built on this shape
- [[client-entrypoint]] — the caller that reads `webService` to pick a carrier
