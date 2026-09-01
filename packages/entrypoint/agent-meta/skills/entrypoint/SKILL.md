---
name: entrypoint
description: How to use @owlmeans/entrypoint — declarative entrypoint/route definitions with entrypoint(), guard(), gate(), filter(), body(), params(), query() builders. Auto-invoked when importing from this package or defining a service entrypoint declaration. Also covers the deprecated @owlmeans/module reexport shim (module() → entrypoint()).
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/entrypoint

**Layer:** Core
**Install:** `"@owlmeans/entrypoint": "^0.1.18-rc.8"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `entrypoint(route, opts?)` | Declare an entrypoint on a route |
| `guard(alias, opts?)` | Require a guard; returns options, so it wraps rather than takes them |
| `gate(alias, params, opts?)` | Require a gate; passed as the `opts` of `guard(...)` |
| `filter(filter, opts?)` | Attach request validators |
| `body(Schema)` | AJV body validator |
| `params(Schema)` | URL params validator |
| `query(Schema)` | Query string validator |
| `ClientEntrypoint<T>` types | Resolved entrypoint type used for `ctx.entrypoint<...>(alias).call(...)` |
| `EntrypointOutcome` | Enum: Ok, Accepted, Created, Finished |
| Constants | Built-in entrypoint aliases |

`guard`, `gate` and `filter` are **options-object combinators, not variadic composers**. Each
returns a `CommonEntrypointOptions` and takes the next one as its final argument, so they nest:

```typescript
entrypoint(
  route(app.api.item.remove, '/:id', { parent: app.api.item, method: RouteMethod.DELETE }),
  guard(DEFAULT_GUARD, gate(OIDC_GATE, ['item--delete@id']))
)
```

Guards and gates are **inherited by child entrypoints** and enforced by the framework before a
handler runs — a handler that re-checks them is duplicating an enforced rule, and is wrong even
when it agrees.

## Subpath Exports

- `./utils` — entrypoint construction helpers (`isEntrypoint`, `CreateEntrypointSignature`)

## Usage

Define entrypoints in a shared `common` package, then `elevate()` them with handlers in server/web packages:

```typescript
import { entrypoint, guard, gate, filter, body } from '@owlmeans/entrypoint'
import { route, RouteMethod } from '@owlmeans/route'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { OIDC_GATE } from '@owlmeans/oidc'
import { CreateProjectSchema } from './schemas.js'

export const managerModules = [
  entrypoint(
    route(manager.back.account.base, '/account'),
    guard(DEFAULT_GUARD, gate(OIDC_GATE, [`my-service-account-{entity}`]))
  ),
  entrypoint(
    route(manager.back.project.create, '/create', {
      parent: manager.back.project.base,
      method: RouteMethod.POST,
    }),
    filter(body(CreateProjectSchema))
  ),
]
```

## Depends On

- `@owlmeans/route` — `route()`, `RouteMethod`
- `@owlmeans/auth-common` — guard aliases (`DEFAULT_GUARD`)
- `@owlmeans/error`, `@owlmeans/i18n`
