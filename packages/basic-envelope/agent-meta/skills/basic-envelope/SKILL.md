---
name: basic-envelope
description: How to use @owlmeans/basic-envelope — makeEnvelopeModel for wrapping a payload with a type tag, timestamp and TTL, signing and verifying it with a basic-keys key pair, and serializing it as a wrap or a token. Auto-invoked when importing envelope types, or building a signed challenge or token payload.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/basic-envelope

**Layer:** Core
**Install:** `"@owlmeans/basic-envelope": "^0.1.18-rc.12"` in `dependencies`

An envelope is a signed, self-expiring container: a type tag, an encoded message, a timestamp and a
TTL, plus the signature over all of it. It is what carries auth challenges and tokens between
services, because a receiver can check the type, the age and the signature without knowing what the
message means.

## Key Exports

| Export | Description |
|--------|-------------|
| `makeEnvelopeModel<T>(type, kind?)` | Build a new envelope, or parse an existing one |
| `EnvelopeModel<T>` | `envelope` / `send` / `message` / `type` / `wrap` / `tokenize` / `sign` / `verify` |
| `EnvelopeModel.envelope` | The `Envelope` itself — read `dt`/`ttl` from it, e.g. to size a cache entry |
| `Envelope` | The wire shape: `{ t, msg, sig?, dt, ttl }` |
| `EnvelopeKind` | `Wrap` (base64) and `Token` (base64url, no padding) |
| `DEFAULT_TTL` | 5 minutes, in milliseconds |

## Creating, signing, sending

Called with a type tag alone, `makeEnvelopeModel` starts a fresh envelope stamped with the current
time and `DEFAULT_TTL`. `send()` sets the payload — a string is stored as is, anything else is
JSON-encoded and base64'd — takes an optional TTL where `null` means never expires, and **returns
the model**, so the chained form is the idiomatic one.

```typescript
import { makeEnvelopeModel, EnvelopeKind } from '@owlmeans/basic-envelope'
import { RELY_3RD, type RelyToken } from '@owlmeans/auth'
import { fromPubKey, makeKeyPairModel } from '@owlmeans/basic-keys'

const key = makeKeyPairModel(privateKey)

// unsigned, serialized in one expression
const plain = makeEnvelopeModel<RelyToken>(RELY_3RD).send(rely).tokenize()

// signed
const envelope = makeEnvelopeModel<RelyToken>(RELY_3RD)
envelope.send(rely)
const token = await envelope.sign(key, EnvelopeKind.Token)
```

`sign(key, kind?)` stores the signature on the envelope and returns it; pass `EnvelopeKind.Wrap` or
`EnvelopeKind.Token` to get the whole serialized envelope back instead. `wrap()` and `tokenize()`
serialize without signing — a token is URL-safe, a wrap is not.

The type tag and the payload type are the caller's — the example borrows `RELY_3RD` and `RelyToken`
from `@owlmeans/auth`, which this package does not depend on. Any string works as a tag.

The envelope itself is public as `model.envelope`, which is how a caller reaches `dt` and `ttl` —
a server that caches a received envelope for exactly as long as it is valid reads
`envelope.envelope.ttl` and derives the entry's lifetime from it.

## Parsing and verifying

Pass the serialized string as the first argument together with the kind it was produced in:

```typescript
const received = makeEnvelopeModel<RelyToken>(token, EnvelopeKind.Token)

if (received.type() !== RELY_3RD) { /* wrong kind of message */ }
if (!await received.verify(fromPubKey(publicKey))) { /* forged or expired */ }

const rely = received.message()               // decoded payload
const raw = received.message(true)            // the encoded string, untouched
```

`verify` answers `false` — it does not throw — when the envelope carries no signature, when
`dt + ttl` is already in the past, or when the signature does not match. The signature covers the
envelope with `sig` removed, so re-serializing a verified envelope keeps it verifiable. `message()`
falls back to returning the raw string when the payload was not JSON.

## Depends On

- `@owlmeans/basic-keys` — the `KeyPairModel` that signs and verifies
- `@scure/base`, `@noble/curves`, `@noble/hashes` — encoding and the underlying primitives
