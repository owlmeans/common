---
description: "How to use @owlmeans/client-module — client-side module helpers extending @owlmeans/module with React component attachment and call helpers."
applyTo: "**/*.ts, **/*.tsx"
---

# @owlmeans/client-module

**Layer:** Client
**Install:** `"@owlmeans/client-module": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `ClientSideModule` types | Client module interface |
| Module helpers | Build client modules; resolve callable references |

## Subpath Exports

- `./utils`

## Usage

```typescript
import type { ClientSideModule } from '@owlmeans/client-module'
```

## Depends On

- `@owlmeans/module`, `@owlmeans/client-route`, `@owlmeans/client-context`
