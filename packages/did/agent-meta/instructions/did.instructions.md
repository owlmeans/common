---
description: "How to use @owlmeans/did — Decentralized Identifier (DID) management with wallet, key models, and DID method plugins. Use when implementing identity workflows."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/did

**Layer:** Core
**Install:** `"@owlmeans/did": "^0.1.16-rc.0"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| Wallet model | Create/load wallets and derive keys |
| DID model | DID document, key references, services |
| DID errors | Typed errors for DID operations |
| Plugins | Per-method DID plugin registry |
| Constants | Default method names, key types |
| i18n | Translatable error messages |

## Usage

```typescript
import { Wallet } from '@owlmeans/did'
const wallet = Wallet.create({ seed: '...' })
const did = await wallet.createDid({ method: 'key' })
```

## Depends On

- `@owlmeans/basic-keys`, `@owlmeans/basic-envelope`, `@owlmeans/error`, `@owlmeans/i18n`
