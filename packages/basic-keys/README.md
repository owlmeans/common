# @owlmeans/basic-keys

ED25519 and XChaCha20 cryptographic key operations: generation, signing, verification, and credential packing.

## Overview

- Generate ED25519 key pairs or import from existing public/private keys
- Sign and verify arbitrary payloads
- Pack/unpack `AuthCredentials` objects with cryptographic signatures
- Address derivation from public keys

## Installation

```bash
bun add @owlmeans/basic-keys
```

## Usage

Generate a key pair and sign data:

```typescript
import { makeKeyPairModel } from '@owlmeans/basic-keys'

const pair = makeKeyPairModel()             // generates a new ED25519 keypair
const exported = pair.export()              // string representation for storage
const signature = await pair.sign(payload)  // sign arbitrary data
const valid = await pair.verify(payload, signature)
const address = pair.exportAddress()        // derive address from public key
```

Load from an existing public key:

```typescript
import { fromPubKey, matchAddress } from '@owlmeans/basic-keys'

const model = fromPubKey('ed25519:ABC123...')
const isMatch = matchAddress(knownAddress, publicKeyStr)
```

Pack authentication credentials for a request:

```typescript
import { packAuthCredentials, unpackAuthCredentials } from '@owlmeans/basic-keys'

const signed = await packAuthCredentials(authObj, extraData, keyPairModel)
const { isValid, extras } = await unpackAuthCredentials(signed, keyPairModel)
```

## API

### `makeKeyPairModel(input?): KeyPairModel`

Creates a `KeyPairModel` from an existing `KeyPair` object, encoded private key string, or algorithm type string. Generates a new ED25519 key pair when called with no arguments.

### `fromPubKey(pubKey, type?): KeyPairModel`

Creates a verify-only `KeyPairModel` from a public key string. Supports `"type:key"` format.

### `matchAddress(address, pubKey): boolean`

Returns true if `address` was derived from `pubKey`.

### `packAuthCredentials(auth, extra, signer): Promise<AuthCredentials>`

Signs auth credentials, optionally embedding extra data in the credential field.

### `unpackAuthCredentials(auth, verifier?): Promise<UnpackedAuthCredentials>`

Extracts and optionally verifies signed auth credentials. Returns `isValid` boolean when a verifier is provided.

### `KeyType`

```typescript
enum KeyType { ED25519 = 'ed25519', XCHACHA = 'xchacha' }
```

## Related Packages

- [`@owlmeans/basic-envelope`](../basic-envelope) — uses `KeyPairModel` for envelope signing
- [`@owlmeans/auth`](../auth) — `AuthCredentials` type consumed by this package
- [`@owlmeans/did`](../did) — DID documents built on top of key pairs

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
