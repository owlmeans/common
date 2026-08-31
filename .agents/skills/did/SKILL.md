---
name: did
description: How to use @owlmeans/did — Decentralized Identifier (DID) management with wallet, key models, and DID method plugins. Auto-invoked when importing DID/wallet types or implementing identity workflows.
user-invocable: false
---

# @owlmeans/did

**Layer:** Core
**Install:** `"@owlmeans/did": "^0.1.18-rc.8"` in `dependencies`

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
import { Wallet, DidDocument } from '@owlmeans/did'

const wallet = Wallet.create({ seed: '...' })
const did = await wallet.createDid({ method: 'key' })
```

## Depends On

- `@owlmeans/basic-keys` — keypair generation
- `@owlmeans/basic-envelope` — message wrapping
- `@owlmeans/error` — DID error base class
- `@owlmeans/i18n` — translatable errors
