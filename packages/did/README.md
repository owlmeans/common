# @owlmeans/did

Hierarchical deterministic (HD) wallet and DID document management for OwlMeans identity.

## Overview

- `makeWallet()` creates a DID wallet from a persistent store, generating a master key on first use
- Wallets derive child keys by path (entity, profile, service) using BIP39 mnemonics
- The `owlmk` key type is a custom HD key scheme on top of ED25519
- Used by `@owlmeans/client-did` and `@owlmeans/server-auth` for identity management

## Installation

```bash
bun add @owlmeans/did
```

## Usage

Create or load a wallet from a persistent store:

```typescript
import { makeWallet } from '@owlmeans/did'
import type { DIDStore } from '@owlmeans/did'

const wallet = await makeWallet(store)

// Derive a key for a specific entity
const key = await wallet.key({ entityId: 'entity-abc' })
const address = key.model.exportAddress()
```

## API

### `makeWallet(store, opts?): Promise<DIDWallet>`

Creates a wallet backed by the given `DIDStore`. Generates a master key on first call unless `opts.allowEmpty` is true.

### `DIDWallet`

- `key(meta): Promise<DIDKeyModel>` — derive a key for the given metadata path
- `mnemonic(): string` — export the wallet mnemonic phrase
- `restore(mnemonic)` — restore the wallet from a mnemonic

### `DIDKeyModel`

- `model: KeyPairModel` — the underlying `@owlmeans/basic-keys` model
- `meta: KeyMeta` — path metadata for this key

### `KEY_OWL`

The default key type identifier: `'owlmk'`.

## Related Packages

- [`@owlmeans/basic-keys`](../basic-keys) — `KeyPairModel` used internally for signing/verification
- [`@owlmeans/client-did`](../client-did) — client-side DID wallet service
- [`@owlmeans/server-auth`](../server-auth) — server-side auth using DID keys

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
