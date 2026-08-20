---
name: client-context
description: How to use @owlmeans/client-context — client-side context factory used as the base for web and native contexts. Auto-invoked when importing client context primitives.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/client-context

**Layer:** Client
**Install:** `"@owlmeans/client-context": "^0.1.18-rc.6"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeClientContext` | Client-side context factory (cross-platform) |
| `Context` (client) types | Client Context interface |
| `Config` (client) types | Client config shape |
| Constants | Default aliases |

## Subpath Exports

- `./utils`

## Usage

Most apps don't call this directly — `@owlmeans/web-panel` and native equivalents wrap it.

```typescript
import { makeClientContext } from '@owlmeans/client-context'
const context = makeClientContext<Config, Context>(cfg)
```

## Depends On

- `@owlmeans/context`, `@owlmeans/client-config`, `@owlmeans/client-entrypoint`, `@owlmeans/client-route`
