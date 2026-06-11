---
description: "How to use @owlmeans/basic-envelope — Envelope data model for wrapping payloads with metadata for cryptographic signing/verification."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/basic-envelope

**Layer:** Core
**Install:** `"@owlmeans/basic-envelope": "^0.1.8"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `Envelope` types | Wrapped payload shape (header, payload, signature) |
| `EnvelopeModel` | Helpers to build/parse envelopes |
| Constants | Envelope kinds, header field names |

## Usage

```typescript
import { EnvelopeModel } from '@owlmeans/basic-envelope'
const envelope = EnvelopeModel.wrap({ kind: 'auth-token', payload: { entityId: 'abc' } })
```

## Depends On

- None at runtime
