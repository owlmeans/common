---
description: "How to use @owlmeans/module — declarative module/route definitions with module(), guard(), gate(), filter(), body(), params(), query() builders. Use when defining a service module declaration."
applyTo: "**/modules.ts, **/modules.tsx, **/*.ts, **/*.tsx"
---

# @owlmeans/module

**Layer:** Core
**Install:** `"@owlmeans/module": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `module(...builders)` | Compose a module declaration |
| `guard(alias, ...gates)` | Attach a security guard |
| `gate(alias, scopes[])` | Define an auth gate inside a guard |
| `filter(...validators)` | Attach request validators |
| `body(Schema)`, `params(Schema)`, `query(Schema)` | AJV validators |
| `ClientModule<T>` | Resolved module type for `ctx.module<...>(alias).call(...)` |
| Constants | Built-in module aliases |

## Subpath Exports

- `./utils` — module construction helpers

## Usage

```typescript
import { module, guard, gate, filter, body } from '@owlmeans/module'
import { route, RouteMethod } from '@owlmeans/route'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { OIDC_GATE } from '@owlmeans/oidc'

export const managerModules = [
  module(
    route(manager.back.project.create, '/create', {
      parent: manager.back.project.base,
      method: RouteMethod.POST,
    }),
    filter(body(CreateProjectSchema)),
    guard(DEFAULT_GUARD, gate(OIDC_GATE, [`my-service-{entity}`]))
  ),
]
```

## Depends On

- `@owlmeans/route`, `@owlmeans/auth-common`, `@owlmeans/error`, `@owlmeans/i18n`
