---
description: "How to use @owlmeans/api-config-client — client-side middleware and modules for fetching the API config served by api-config-server."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/api-config-client

**Layer:** Client
**Install:** `"@owlmeans/api-config-client": "^0.1.8"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `apiConfigMiddleware` | Middleware to fetch remote API config at startup |
| `modules` | Client api-config module declarations |

## Usage

```typescript
import { modules as apiConfigClientModules } from '@owlmeans/api-config-client'
context.registerEntrypoints([...apiConfigClientModules, ...appModules])
```

## Depends On

- `@owlmeans/api-config`, `@owlmeans/client-entrypoint`, `@owlmeans/client-context`
