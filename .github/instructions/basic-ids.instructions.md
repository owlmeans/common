---
description: "How to use @owlmeans/basic-ids — identifier generation helpers (random IDs, namespaced IDs, ULID-like)."
applyTo: "**/*.ts, **/*.tsx"
---

# @owlmeans/basic-ids

**Layer:** Core
**Install:** `"@owlmeans/basic-ids": "^0.1.2"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| ID helpers | Generate random/sortable identifiers |
| Constants | Default ID lengths, character sets |

## Usage

```typescript
import { randomId } from '@owlmeans/basic-ids'
const id = randomId()
```

## Depends On

- None at runtime
