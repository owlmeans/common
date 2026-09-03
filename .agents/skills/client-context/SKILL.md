---
name: client-context
description: How to use @owlmeans/client-context — client-side context factory used as the base for web and native contexts. Auto-invoked when importing client context primitives.
user-invocable: false
---

# @owlmeans/client-context

**Layer:** Client
**Install:** `"@owlmeans/client-context": "^0.1.18-rc.12"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeClientContext` | Client-side context factory (cross-platform) |
| `ClientContext<C>` | Client Context interface — adds `serviceRoute(alias)` |
| `ClientConfig`, `config()` | Client config shape and its factory |
| `PLUGINS` | Alias of the plugins config resource |

## Usage

Most apps don't call this directly — `@owlmeans/web-panel` and native equivalents wrap it. A wrapper
calls it once, applies its own idempotent `append*(context)` mixins, and returns that same context:
one context per process, built by one factory.

```typescript
import { makeClientContext } from '@owlmeans/client-context'
const context = makeClientContext<Config, Context>(cfg)
```

## Depends On

- `@owlmeans/context`, `@owlmeans/client-config`, `@owlmeans/client-entrypoint`, `@owlmeans/client-route`
