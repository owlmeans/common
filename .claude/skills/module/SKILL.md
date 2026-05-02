---
name: module
description: How to use @owlmeans/module — declarative module/route definitions with module(), guard(), gate(), filter(), body(), params(), query() builders. Auto-invoked when importing from this package or defining a service module declaration.
user-invocable: false
---

# @owlmeans/module

**Layer:** Core
**Install:** `"@owlmeans/module": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `module(...builders)` | Compose a module declaration from builders |
| `guard(alias, ...gates)` | Attach a security guard |
| `gate(alias, scopes[])` | Define an auth gate (used inside a guard) |
| `filter(...validators)` | Attach request validators |
| `body(Schema)` | AJV body validator |
| `params(Schema)` | URL params validator |
| `query(Schema)` | Query string validator |
| `ClientModule<T>` types | Resolved module type used for `ctx.module<...>(alias).call(...)` |
| Constants | Built-in module aliases |

## Subpath Exports

- `./utils` — module construction helpers

## Usage

Define modules in a shared `common` package, then `elevate()` them with handlers in server/web packages:

```typescript
import { module, guard, gate, filter, body } from '@owlmeans/module'
import { route, RouteMethod } from '@owlmeans/route'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { OIDC_GATE } from '@owlmeans/oidc'
import { CreateProjectSchema } from './schemas.js'

export const managerModules = [
  module(
    route(manager.back.account.base, '/account'),
    guard(DEFAULT_GUARD, gate(OIDC_GATE, [`my-service-account-{entity}`]))
  ),
  module(
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
