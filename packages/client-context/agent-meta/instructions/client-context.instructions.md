---
description: "How to use @owlmeans/client-context — client-side context factory used as the base for web and native contexts."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/client-context

**Layer:** Client
**Install:** `"@owlmeans/client-context": "^0.1.11"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeClientContext` | Client context factory |
| `Context` / `Config` (client) types | Client interfaces |
| Constants | Default aliases |

## Subpath Exports

- `./utils`

## Usage

```typescript
import { makeClientContext } from '@owlmeans/client-context'
const context = makeClientContext<Config, Context>(cfg)
```

## Depends On

- `@owlmeans/context`, `@owlmeans/client-config`, `@owlmeans/client-entrypoint`, `@owlmeans/client-route`
