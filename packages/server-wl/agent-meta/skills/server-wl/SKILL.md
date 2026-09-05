---
name: server-wl
description: How to use @owlmeans/server-wl — the server half of the white-label contract — the elevated WL_PROVIDE entrypoint, the WlProvider and WlEntityIdentifier service seams, and the cfg.wlProviders wiring that decides what a provide call returns. Auto-invoked when serving white-label data or writing a white-label provider service.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/server-wl

**Layer:** Server
**Install:** `"@owlmeans/server-wl": "^0.1.18-rc.17"` in `dependencies`

Answers the one `WL_PROVIDE` entrypoint `@owlmeans/wled` declares. It stores nothing itself: it fans
the request out to the provider services the configuration names and returns their answers in one
object.

## Key Exports

| Export | Description |
|--------|-------------|
| `entrypoints` | The `WL_PROVIDE` declaration, already elevated with the provide handler. Spread it into the app's entrypoint list |
| `WlProvider` | Service seam a white-label section implements: `provide(entityId) => Promise<ProvidedWL>` |
| `WlEntityIdentifier` | Optional seam that maps a public identifier (a custom domain, say) to an entity id: `identifyEntity(identifier) => Promise<string \| null>` |
| `WlProviderAppend` | The config this package reads: `{ wlProviders: string[], wlIdentifierService?: string }` |
| `Config`, `Context` | `ServerConfig`/`ServerContext` narrowed to carry `WlProviderAppend` |

## Wiring

```typescript
import { entrypoints as wlEntrypoints } from '@owlmeans/server-wl'

export const appEntrypoints = [...ownEntrypoints, ...wlEntrypoints]
```

```typescript
// config — the aliases of services registered on this context that implement WlProvider
cfg.wlProviders = ['wl-info', 'wl-styles', 'wl-logo']
// optional: resolves a public identifier to an entity id before the providers are called
cfg.wlIdentifierService = 'wl-dns'
```

`wlProviders` is required, not optional: the handler maps over it unconditionally, so a context that
serves this entrypoint with the key unset fails the request rather than returning an empty set.

The declaration `@owlmeans/wled` ships carries **no guard**, and this package elevates it with a
handler only — so the endpoint answers anonymously and any caller who can name an organization reads
every section the deployment registered. Keep white-label records public by design, or elevate the
alias with a guard of your own in the application's entrypoint list.

## The response is keyed by service alias

The handler builds `{ [providerAlias]: await service.provide(entityId) }`, so the key a browser reads
a section under is the **alias the provider service was registered as** — not the `type` on the
record and not a white-label constant. Registering the same provider under a different alias renames
the section for every reader.

The `:entity` path param is whatever the caller addressed the organization by. When
`wlIdentifierService` is configured, its `identifyEntity` runs first and its answer replaces the
param; a `null` answer leaves the param in place, so a bare entity slug keeps working with a
resolver installed.

## Writing a provider

```typescript
import type { WlProvider } from '@owlmeans/server-wl'
import { WL_TYPE_COMPANY_INFO } from '@owlmeans/wled'
import { createService } from '@owlmeans/context'

export const makeInfoService = (alias = 'wl-info'): WlProvider =>
  createService<WlProvider>(alias, {
    provide: async entityId => {
      const record = await load(entityId)

      return record != null
        ? { ...record, type: WL_TYPE_COMPANY_INFO, exists: true }
        : { type: WL_TYPE_COMPANY_INFO, exists: false }
    }
  })
```

A provider is called for every request to the entrypoint, in parallel with its siblings, and one
rejection fails the whole response — so a provider that cannot answer returns `exists: false` rather
than throwing.

## Depends On

- `@owlmeans/wled`, `@owlmeans/server-api`, `@owlmeans/server-entrypoint`, `@owlmeans/server-context`,
  `@owlmeans/context`

The browser counterpart is `@owlmeans/web-wl`. Concrete providers — company info, styles, logo
storage, DNS — are separate downstream packages that implement `WlProvider`.
