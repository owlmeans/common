---
name: entrypoint
description: How to use @owlmeans/entrypoint — declarative entrypoint/route definitions with entrypoint(), guard(), gate(), filter(), body(), params(), query() builders. Auto-invoked when importing from this package or defining a service entrypoint declaration. Also covers the deprecated @owlmeans/module reexport shim (module() → entrypoint()).
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/entrypoint

**Layer:** Core
**Install:** `"@owlmeans/entrypoint": "^0.1.10"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `entrypoint(...builders)` | Compose an entrypoint declaration from builders |
| `guard(alias, ...gates)` | Attach a security guard |
| `gate(alias, scopes[])` | Define an auth gate (used inside a guard) |
| `filter(...validators)` | Attach request validators |
| `body(Schema)` | AJV body validator |
| `params(Schema)` | URL params validator |
| `query(Schema)` | Query string validator |
| `ClientEntrypoint<T>` types | Resolved entrypoint type used for `ctx.entrypoint<...>(alias).call(...)` |
| `EntrypointOutcome` | Enum: Ok, Accepted, Created, Finished |
| Constants | Built-in entrypoint aliases |

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
