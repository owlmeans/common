---
name: web-wl
description: How to use @owlmeans/web-wl — the browser half of the white-label contract — the elevated WL_PROVIDE entrypoint, the caching WlWebService that loads an organization's white-label set, and the WlLogo component. Auto-invoked when reading white-label data in a web app or rendering a customer's branding.
user-invocable: false
---

# @owlmeans/web-wl

**Layer:** Web (React)
**Install:** `"@owlmeans/web-wl": "^0.1.18-rc.14"` in `dependencies`

Reads what `@owlmeans/server-wl` serves. One service call per organization entity, cached inside the
service, plus a component for the one piece of branding almost every app needs.

## Key Exports

| Export | Description |
|--------|-------------|
| `entrypoints` | The `WL_PROVIDE` declaration elevated for the browser. Spread it into the app's entrypoint list or `call()` misses |
| `makeWlService(alias?)` | The service factory. Defaults to `DEFAULT_ALIAS` |
| `DEFAULT_ALIAS` | `'wl-web-serivce'` — spelled exactly that way. Always register and look the service up through this constant rather than a literal |
| `WlWebService` | `load<T>(entityId, resource?) => Promise<ProvidedWLSet<T>>` and `extract<T>(key, set) => ProvidedWL<T>`. The `resource` argument is accepted and ignored — the whole set always comes back |
| `ProvidedWLSet<T>` | The whole answer: `{ [providerAlias]: ProvidedWL<T> }` |
| `WlLogo` | `<WlLogo entityId={…} defImg={…} />` — both props optional. Renders the `wl-logo` section's `brand.wideLogo`, else `defImg`, else nothing; with no `entityId` it never loads and only `defImg` can show. It reads the section by the literal name `wl-logo`, so the backend must register its media provider under exactly that alias |
| `Config`, `Context` | This package's `AppConfig`/`AppContext` from `@owlmeans/web-client`, narrowed for its own service |

The component prop interfaces are **not** exported — the entry point re-exports the component only.
Type a wrapper with `ComponentProps<typeof WlLogo>` rather than importing a props name.

## Wiring

```typescript
import { entrypoints as wlEntrypoints, makeWlService } from '@owlmeans/web-wl'

context.registerService(makeWlService())
const entrypoints = [...baseEntrypoints, ...wlEntrypoints, ...managerEntrypoints]
```

## Reading a white-label set

```typescript
import { DEFAULT_ALIAS } from '@owlmeans/web-wl'
import type { WlWebService } from '@owlmeans/web-wl'
import type { CustomStyles } from '@owlmeans/wled'

const wl = context.service<WlWebService>(DEFAULT_ALIAS)
const set = await wl.load(entityId)
const styles = wl.extract<CustomStyles>('wl-styles', set)
if (styles.exists === true) {
  applyTheme(styles.colors, styles.font)
}
```

The key is the **provider service alias the backend registered**, the same string that appears in
that server's `cfg.wlProviders`. It is not a `WL_TYPE_*` constant — those name the `type` field
inside a section, which is how a reader confirms the shape it got.

The value `load` sends as the `entity` param is the argument it was given, unchanged; what the server
accepts there is the server's rule, not this package's.

`load` memoises per `entityId` in a cache created inside `makeWlService`, so the memo lives exactly as
long as that service instance and two services made under different aliases keep independent caches.
The entry is written only after the call resolves and there is no in-flight promise memo, so
concurrent callers — two `WlLogo`s mounting in the same tick — each issue their own request; the
cache only dedups calls made after one has returned. Nothing invalidates it either, so a screen that
has just written new branding must reload the page (or read the write's own response) rather than
expecting `load` to see the change.

## Depends On

- `@owlmeans/wled`, `@owlmeans/client`, `@owlmeans/client-entrypoint`, `@owlmeans/context`
- `@owlmeans/web-client` — supplies the `AppConfig`/`AppContext` this package's `Config`/`Context`
  extend. It is imported by the published types but missing from the manifest, so a consumer has to
  install it explicitly or the declarations do not resolve
- `react` (peer)

The server counterpart is `@owlmeans/server-wl`. Editing screens for white-label records live in
downstream manager packages, not here.
