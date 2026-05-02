# @owlmeans/basic-envelope

Type-safe message envelope with TTL, signing, and Base64 encoding for cross-service communication.

## Overview

- Wraps any JSON-serializable payload in a typed envelope with timestamp and TTL
- Envelopes can be signed with an ED25519 key and verified on the receiving side
- Two transport modes: wrapped (Base64 JSON) or tokenized (compact colon-separated)

## Installation

```bash
bun add @owlmeans/basic-envelope
```

## Usage

Create and send a signed message:

```typescript
import { makeEnvelopeModel, EnvelopeKind } from '@owlmeans/basic-envelope'
import { makeKeyPairModel } from '@owlmeans/basic-keys'

const keyPair = makeKeyPairModel()
const envelope = makeEnvelopeModel<MyMessage>('my-message-type')
envelope.send({ data: 'payload' })

// Sign and serialize in one step
const token = await envelope.sign(keyPair, EnvelopeKind.Token)
```

Receive and verify:

```typescript
// Reconstruct from a received token
const received = makeEnvelopeModel<MyMessage>(token, EnvelopeKind.Token)
const isValid = await received.verify(senderKeyPair)
if (isValid) {
  const msg = received.message<MyMessage>()
}
```

## API

### `makeEnvelopeModel<T>(typeOrRaw, kind?): EnvelopeModel<T>`

Creates a new envelope for type `T`. Pass a type string to create a new envelope, or pass an existing wrapped/tokenized string with the corresponding `kind` to reconstruct.

### `EnvelopeModel<T>`

- `send(msg, ttl?)` — set the payload; `ttl` defaults to `DEFAULT_TTL` (5 minutes)
- `wrap()` — serialize to a Base64 JSON string
- `tokenize()` — serialize to a compact `type:msg:sig` string
- `message<M>()` — deserialize the payload
- `type()` — return the envelope type string
- `sign(key, kind?)` — sign and serialize in one step; returns signature or serialized envelope
- `verify(key)` — verify the signature and TTL; returns `boolean`

### `EnvelopeKind`

```typescript
enum EnvelopeKind { Wrap = 'wrap', Token = 'token' }
```

### `DEFAULT_TTL`

5 minutes in milliseconds (`300_000`).

## Related Packages

- [`@owlmeans/basic-keys`](../basic-keys) — `KeyPairModel` used for signing/verification
- [`@owlmeans/auth`](../auth) — authentication flows that use envelopes for credential transport
