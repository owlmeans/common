---
name: api-config-client
description: How to use @owlmeans/api-config-client — client-side middleware and modules for fetching the API config served by api-config-server. Auto-invoked when wiring runtime API config into a client app.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/api-config-client

**Layer:** Client
**Install:** `"@owlmeans/api-config-client": "^0.1.15"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `apiConfigMiddleware` | Middleware to fetch and apply remote API config at startup |
| `modules` | Client-side api-config module declarations |

## Usage

```typescript
import { modules as apiConfigClientModules } from '@owlmeans/api-config-client'
context.registerEntrypoints([...apiConfigClientModules, ...appModules])
```

## Depends On

- `@owlmeans/api-config`, `@owlmeans/client-entrypoint`, `@owlmeans/client-context`
