---
name: basic-keys
description: How to use @owlmeans/basic-keys — Ed25519 keypair generation, signing/verification, key model, and auth plugins (built on @noble/curves and @noble/hashes). Auto-invoked when importing keypair utilities or implementing crypto-based auth.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/basic-keys

**Layer:** Core
**Install:** `"@owlmeans/basic-keys": "^0.1.18-rc.12"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeKeyPairModel(input?)` | The one factory — returns a `KeyPairModel` |
| `KeyPair` | Key pair shape: `{ privateKey, publicKey, address, type }`, keys base64 |
| `KeyPairModel` | `sign` / `verify` / `encrypt` / `decrypt` / `dcrpt` / `export*` |
| `KeyType` | `ED25519` (`'ed25519'`, signing) and `XCHACHA` (`'xchacha'`, encryption) |
| `fromPubKey`, `matchAddress` | Verify-only model from a public key; address check |
| `auth` exports | Auth plugin built on keypair signatures |

## Subpath Exports

- `./plugins` — pluggable key/auth plugins
- `./utils` — encoding/decoding helpers

## Usage

`makeKeyPairModel` takes **one** argument. Pass a `KeyType` string to generate a fresh pair of that
type, a `"<type>:<base64key>"` string (or bare base64, implying ed25519) to load one, or a
`KeyPair` object. There is no separate type parameter.

```typescript
import { makeKeyPairModel, KeyType } from '@owlmeans/basic-keys'

const signer = makeKeyPairModel(KeyType.ED25519)   // generate
const signature = await signer.sign(payload)        // objects are canonicalized first
const ok = await signer.verify(payload, signature)

const cipher = makeKeyPairModel(KeyType.XCHACHA)
const secret = await cipher.decrypt(await cipher.encrypt('message'))
```

`ed25519` throws `ed25519:encryption-support` on `encrypt` — signing and encryption are separate
key types, never the same model.

## Errors

Plain `Error` with a `basic.keys:<code>` message — this package does **not** use
`@owlmeans/error`, so do not add that dependency.

| Code | Raised when |
|------|-------------|
| `basic.keys:missing-keypair` | model has no key pair |
| `basic.keys:unknown-type` | key type is absent or has no plugin |
| `basic.keys:sign-data-type` | data is neither string, object, nor `Uint8Array` |
| `basic.keys:decrypt-not-utf8` | plaintext is not valid UTF-8 (see below) |

## `@scure/base` v2 — strict `utf8`

The repo is on `@scure/base` **v2**, whose `utf8` coder is strict: `encode` runs
`TextDecoder('utf-8', { ignoreBOM: true, fatal: true })` and throws on invalid bytes instead of
substituting `U+FFFD`, and `decode` rejects non-well-formed strings. `decrypt` therefore wraps its
`utf8.encode` call and rethrows as `basic.keys:decrypt-not-utf8`. Use `dcrpt` when the plaintext is
binary — it returns raw `Uint8Array` and never touches the utf8 coder.

In practice a wrong key fails earlier: xchacha20-poly1305 is authenticated, so it throws
`invalid tag` before any decoding happens. The guard covers the binary-plaintext case.

Callers that tolerate undecryptable values must catch — e.g. `@owlmeans/mongo` and
`@owlmeans/postgres` use `key.decrypt(value).catch(() => value)` for their encrypted-field paths.

## Depends On

- `@owlmeans/auth` — credential types for the auth helpers
- `@noble/curves`, `@noble/ciphers`, `@noble/hashes`, `@scure/base` (v2), `canonicalize`
