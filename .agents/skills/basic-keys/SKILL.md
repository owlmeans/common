---
name: basic-keys
description: How to use @owlmeans/basic-keys — Ed25519 keypair generation, signing/verification, key model, and auth plugins (built on @noble/curves and @noble/hashes). Auto-invoked when importing keypair utilities or implementing crypto-based auth.
user-invocable: false
---

# @owlmeans/basic-keys

**Layer:** Core
**Install:** `"@owlmeans/basic-keys": "^0.1.18-rc.11"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `makeKeyPairModel(input?)` | The one factory — returns a `KeyPairModel` |
| `KeyPair` | Key pair shape: `{ privateKey, publicKey, address, type }`, keys base64 |
| `KeyPairModel` | `sign` / `verify` / `encrypt` / `decrypt` / `dcrpt` / `export*` |
| `KeyType` | `ED25519` (`'ed25519'`, signing) and `XCHACHA` (`'xchacha'`, encryption) |
| `fromPubKey(key, type?)`, `matchAddress(address, pubKey)` | Verify-only model from a public key; address check |
| `packAuthCredentials(auth, extra, signer)` | Sign a credential payload into `AuthCredentials.credential` |
| `unpackAuthCredentials(auth, verifier?)` | Split that back into `{ unsigned, signature, extras, isValid }` |
| `plugins` | The key-type registry, keyed by type string |

## Subpath Exports

- `./plugins` — the individual plugins (`ed25519Plugin`, `xChahaPlugin`), the `plugins` registry
  again, and the **`KeyPlugin` type**. `KeyPlugin` is *not* on the root surface: the root re-exports
  only the registry value, so a package implementing a new key type imports the type from
  `@owlmeans/basic-keys/plugins`.
- `./utils` — `assertType`, `prepareKey`, `prepareData`, `toAddress`

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
| `basic.keys:unknown-type` | the key type is absent or has no plugin (see the guard order below) |
| `basic.keys:missing-pk` | `sign` on a model built from a `KeyPair` **object** whose `privateKey` is null or undefined |
| `basic.keys:sign-data-type` | data is neither string, object, nor `Uint8Array` |
| `basic.keys:decrypt-not-utf8` | plaintext is not valid UTF-8 (see below) |
| `ed25519:encryption-support` | `encrypt` or `decrypt` on an ed25519 model |
| `xchacha:signing` / `xchacha:verification` | `sign` or `verify` on an xchacha model |

Not every failure comes back as one of these, so do not match on a code where the underlying
library throws first:

- Signing with a **verify-only** model does not raise `basic.keys:missing-pk`. `fromPubKey` stores
  `privateKey: ''`, which passes the null guard, and `@noble/curves` rejects it as
  `private key of length 32 expected, got 0`.
- A string input that is neither a key type nor valid base64 fails in the decoder
  (`Found a character that cannot be part of a valid base64 string`), never with a `basic.keys:`
  code.
- The type check is not the first thing every method does. `export`, `exportPublic` and
  `exportAddress` run it before anything else, but `sign`, `verify` and `encrypt` convert the payload
  first — on a model whose type has no plugin, `sign(42)` throws `basic.keys:sign-data-type` while
  `sign('ok')` throws `basic.keys:unknown-type` — and `decrypt`/`dcrpt` base64-decode the input
  first, so a malformed ciphertext fails in the decoder.

## `@scure/base` — strict `utf8`

This package depends on `@scure/base` `^2.3.0`, whose `utf8` coder is strict: `encode` runs
`TextDecoder('utf-8', { ignoreBOM: true, fatal: true })` and throws on invalid bytes instead of
substituting `U+FFFD`, and `decode` rejects non-well-formed strings. `decrypt` therefore wraps its
`utf8.encode` call and rethrows as `basic.keys:decrypt-not-utf8`. Use `dcrpt` when the plaintext is
binary — it returns raw `Uint8Array` and never touches the utf8 coder.

In practice a wrong key fails earlier: xchacha20-poly1305 is authenticated, so it throws
`invalid tag` before any decoding happens. The guard covers the binary-plaintext case.

Callers that tolerate undecryptable values must catch — e.g. `@owlmeans/mongo` and
`@owlmeans/postgres` use `key.decrypt(value).catch(() => value)` for their encrypted-field paths.

## Signed credentials

`packAuthCredentials` canonicalizes the unsigned credentials plus your extras, signs them, and
returns `AuthCredentials` whose `credential` holds the signature (alone, or folded into the extras).
`unpackAuthCredentials` reverses it and — given a verifier — reports `isValid`. Either side accepts
a `KeyPairModel` or a bare sign/verify function, so a caller that holds only a remote signer works
the same way.

## Depends On

- `@owlmeans/auth` — `AuthCredentials`, the shape the auth helpers pack and unpack
- `@noble/curves`, `@noble/ciphers`, `@noble/hashes`, `@scure/base`, `canonicalize`
