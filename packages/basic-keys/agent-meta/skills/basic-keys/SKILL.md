---
name: basic-keys
description: How to use @owlmeans/basic-keys — Ed25519 keypair generation, signing/verification, key model, and auth plugins (built on @noble/curves and @noble/hashes). Auto-invoked when importing keypair utilities or implementing crypto-based auth.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/basic-keys

**Layer:** Core
**Install:** `"@owlmeans/basic-keys": "^0.1.16"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `KeyPair` types | Public/private key pair shape |
| `keypair` factory | Generate or load Ed25519 keypairs |
| `KeyModel` | Sign/verify helpers |
| Constants | Curve names, key encodings |
| `auth` exports | Auth plugin built on keypair signatures |
| Plugins | Pluggable signature verification |

## Subpath Exports

- `./plugins` — pluggable key/auth plugins
- `./utils` — encoding/decoding helpers

## Usage

```typescript
import { keypair, KeyModel } from '@owlmeans/basic-keys'

const kp = keypair.generate()
const signature = KeyModel.sign(kp.privateKey, message)
const ok = KeyModel.verify(kp.publicKey, message, signature)
```

## Depends On

- `@owlmeans/basic-envelope` — wraps signed payloads
- `@noble/curves`, `@noble/hashes`, `@scure/base`, `@scure/bip39` (peer/runtime crypto)
