---
description: "How to use @owlmeans/entrypoint — declarative entrypoint/route definitions with entrypoint(), guard(), gate(), filter(), body(), params(), query() builders. Use when defining a service entrypoint declaration. Also covers the deprecated @owlmeans/module reexport shim (module() → entrypoint())."
applyTo: "**/modules.ts, **/modules.tsx, **/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/entrypoint

**Layer:** Core
**Install:** `"@owlmeans/entrypoint": "^0.1.16-rc.0"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `entrypoint(...builders)` | Compose an entrypoint declaration |
| `guard(alias, ...gates)` | Attach a security guard |
| `gate(alias, scopes[])` | Define an auth gate inside a guard |
| `filter(...validators)` | Attach request validators |
| `body(Schema)`, `params(Schema)`, `query(Schema)` | AJV validators |
| `ClientEntrypoint<T>` | Resolved entrypoint type for `ctx.entrypoint<...>(alias).call(...)` |
| `EntrypointOutcome` | Enum: Ok, Accepted, Created, Finished |
| Constants | Built-in entrypoint aliases |

## Subpath Exports

- `./utils` — entrypoint construction helpers

## Usage

```typescript
import { entrypoint, guard, gate, filter, body } from '@owlmeans/entrypoint'
import { route, RouteMethod } from '@owlmeans/route'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { OIDC_GATE } from '@owlmeans/oidc'

export const managerModules = [
  entrypoint(
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
