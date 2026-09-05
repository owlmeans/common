---
name: did
description: How to use @owlmeans/did — the owlmk derivable key type, makeDidKeyModel and its derive() paths, and makeWallet over a three-resource DID store with mnemonic seed, key metadata and per-entity key provisioning. Auto-invoked when importing DID or wallet types, deriving keys, or implementing identity workflows.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/did

**Layer:** Core
**Install:** `"@owlmeans/did": "^0.1.18-rc.12"` in `dependencies`

This package adds a **derivable** key type on top of `@owlmeans/basic-keys` and a wallet that stores
keys derived from one mnemonic seed. Importing it registers the `owlmk` key type into the shared
key-plugin registry, so `KEY_OWL` becomes a valid type anywhere a key type is accepted — that side
effect is the reason a package that only needs the type still imports this one.

## Key Exports

| Export | Description |
|--------|-------------|
| `makeDidKeyModel(input?)` | A `KeyPairModel` that also derives children — same input rules as `makeKeyPairModel` |
| `DIDKeyModel` | `KeyPairModel` + `derive(path)`; its `keyPair` also carries `path` and `parent` (read the caveat below) |
| `DIDKeyPair` | `KeyPair` + `{ path?, parent? }` |
| `makeWallet(store, opts?)` | Open (or initialize) a wallet over a `DIDStore` |
| `DIDWallet` | `generate` / `mnemonic` / `master` / `add` / `meta` / `update` / `get` / `find` / `provide` (→ `DIDKeyModel[]`) / `remove` / `all` / `allMeta` |
| `DIDStore` | `{ master, keys, meta }` — three resources the host supplies |
| `KeyMeta` | What a key is for: `{ id, name, entityId?, ...Profile }` |
| `KeySeedRecord`, `KeyPairRecord`, `KeyMetaRecord` | The record shapes those resources hold |
| `MakeDIDWalletOptions`, `MnemonicOptions` | `{ force, allowEmpty, mnemonic, type, allowCustomType }`; `{ size }` |
| `WalletFacade`, `WalletKey`, `WalletOptions`, `NewKeyOptions`, `RequestReason` | The contract a wallet UI or a remote wallet exposes to an app |
| `plugins` | The shared `@owlmeans/basic-keys` registry, with `owlmk` added — the only plugin symbol this package exports |
| `DIDError`, `DIDKeyError`, `DIDWalletError`, `DIDWalletPermissionError`, `DIDInitializationError` | Registered `ResilientError` subclasses |
| `KEY_OWL` (`'owlmk'`), `MASTER`, `KP_SEP` (`'/'`), `MAX_DEPTH` (6) | Key type, master record id, path separator and depth cap |
| `SERVICE_PREFIX`, `ENTITY_PREFIX`, `PROFILE_PREFIX`, `PREFIX_SEP` | The segments a metadata-derived path is composed from |

## Deriving keys

A DID here is what `exportAddress()` returns — `"<type>:<address>"` — and it is the id every stored
key and every metadata record is keyed by.

```typescript
import { makeDidKeyModel, KEY_OWL } from '@owlmeans/did'

const master = makeDidKeyModel(KEY_OWL)        // fresh derivable key
const child = master.derive('entity.acme/profile.42')
child.keyPair!.parent                          // the intermediate key's DID, not the master's
```

`derive` splits on `/` and derives once per segment, so a multi-segment path is exactly repeated
single-step derivation. It throws `DIDKeyError` on a path deeper than `MAX_DEPTH`
(`did:wallet:too:deep`), on an empty path (`did:wallet:no:path`), and on a model with no private key
(`did:wallet:no:pk`).

**`path` and `parent` describe one step, not the whole chain.** Because the recursion re-derives per
segment, the model that comes back from `derive('entity.acme/profile.42')` carries
`keyPair.path === 'profile.42'` and a `keyPair.parent` that is the intermediate `entity.acme` key's
DID — not the master's. The full path lives only on the intermediate model that was thrown away.
Store the string you passed to `derive` if you need to re-derive later; `keyPair.path` will not
rebuild it.

A key type that cannot derive (plain `ed25519`, `xchacha`) is rejected **only when the model is
built from the bare type string** — `makeDidKeyModel('ed25519')` throws `DIDKeyError`
`did:wallet:non-derivable:ed25519`. Built from a `KeyPair` object — which is what the wallet does
for every record it loads — or with no argument at all, nothing checks, and `derive()` fails later
with a raw `TypeError: plugins[...].derive is not a function`. Guard the type yourself before
deriving from a stored key pair.

## The wallet

`makeWallet` needs a `DIDStore`: three resources — `master` for the seed record, `keys` for the key
pairs, `meta` for what each key is for. Any `@owlmeans/resource` implementation will do, and the
choice of store is what decides whether the wallet lives in memory, in a browser, or on a server.

```typescript
import { makeWallet } from '@owlmeans/did'

const wallet = await makeWallet(store, { force: true })   // force ⇒ generate a fresh seed
const master = await wallet.master()
const [key] = await wallet.provide({ name: 'signing', entityId })
```

Opening a store with no master record throws `DIDInitializationError` unless `force` (generate one
now) or `allowEmpty` (open it anyway) is passed. `{ type, allowCustomType: true }` is the only
public way to add another derivable key type: `makeWallet` builds a plugin for the named type and
puts it in the shared registry.

### Seed and mnemonic

`generate()` derives the seed from a fresh mnemonic. `{ mnemonic: { size } }` must be between 12 and
24 and defaults to **18**, but it is not a word count — it is mapped to BIP-39 entropy and rounded
up to the next whole 32-bit block, so 12 gives a 15-word phrase, 18 gives 21, and 21–23 all give 24.
**`size: 24` throws `TypeError: Invalid entropy`**, because the mapping overshoots the 256-bit
maximum. Stay at 23 or below.

`mnemonic()` does not recover the phrase of a wallet this package generated. `generate()` stores the
seed base64-encoded while `mnemonic()` hex-decodes what it reads, so the call throws in the decoder.
It returns `false` (or throws `DIDWalletError` when called as `mnemonic(true)`) only for a master
record that carries no seed at all. Do not build a recovery-phrase flow on it.

### Providing keys

`provide(meta)` is the call an application actually makes: it looks for keys matching the metadata
and, finding none, derives one from the master at a path composed from that metadata — the service
scope, then the organization entity, then the profile — stores it with its metadata, and returns
**an array** (`DIDKeyModel[]`, one element for a freshly derived key). Destructure it;
`meta.name` is required and its absence throws `DIDKeyError` `did:wallet:no:name`.

Idempotence holds **only while the metadata carries no `id`.** The stored metadata record is always
keyed by the key's own DID, so a `meta.id` you pass in is discarded on save and the next
`find(meta)` — which matches `id` against the stored value — cannot find the key it just wrote. The
second `provide` re-derives the same key and `add` rejects it with `DIDWalletError`
`did:wallet:key:exists`. Identify a key by its scope fields (`entityId`, `scopes`) rather than by a
profile id, or catch that error.

Repeat the `name` verbatim as well: it takes part in the lookup (see below), so `provide` with a
changed name for the same scope finds nothing, re-derives the same key and fails with that same
`did:wallet:key:exists`.

`find(meta)` filters twice and likewise returns an array. Every **non-boolean** field of `meta` —
`name` among them — goes into the query it puts to the metadata resource, and each record that comes
back is re-checked in memory, where `name` is the one field skipped, a boolean is compared (those
never reach the query), and an array value must be contained in the stored array. So a `name` that
differs from the stored one still excludes the key at the store: this is not a name-insensitive
lookup. `get(did)` and `remove(did)` work by DID, and `add`/`update` take a model plus its metadata.
`add` refuses a key it cannot manage (no private key) and a DID already present.

## Depends On

- `@owlmeans/basic-keys` — the key model, the plugin registry and the `utils` this extends
- `@owlmeans/resource` — the three stores a `DIDStore` is made of
- `@owlmeans/auth` — `Profile`, which `KeyMeta` extends
- `@owlmeans/error` — the base class the DID errors extend
- `@owlmeans/i18n` — importing this package registers the `keys` and `wallet` libraries under the `did` namespace
- `@scure/bip39` (mnemonic), `@scure/base`, `@noble/curves`, `@noble/hashes`
