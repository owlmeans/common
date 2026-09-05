---
name: client-did
description: How to use @owlmeans/client-did — the browser/native DID wallet service (makeWalletService, appendDidService, context.getDidService()) plus makeDidAccountModel for signing an authentication challenge with a wallet key. Auto-invoked when importing client DID services, registering a wallet on a client context, or authenticating with a DID key.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/client-did

**Layer:** Client
**Install:** `"@owlmeans/client-did": "^0.1.18-rc.15"` in `dependencies`

A `DIDWallet` from `@owlmeans/did` needs three resources to live in — master seed, key pairs, key
meta. This package registers those as client resources, wraps the wallet in a lazy service, and
adds the one model that turns a wallet key into an authentication credential.

## Key Exports

| Export | Description |
|--------|-------------|
| `appendDidService(ctx, alias?, deps?)` | The wiring call: registers the three client resources, the wallet service, and `ctx.getDidService()` |
| `makeWalletService(alias?, deps?)` | The service factory on its own, for a context that already owns the resources |
| `DIDService` | `exists()` · `create(opts?)` · `intialize()` · `get()` · `wallet` — a `LazyService` |
| `DIDServiceAppend` | What `appendDidService` adds to the context: `getDidService(alias?)` |
| `DIDServiceDeps` | `{ keys, meta, master }` — the resource aliases the wallet reads and writes |
| `makeDidAccountModel(did, isPub?)` | Wrap a `DIDKeyModel`, a `KeyPair` (from `@owlmeans/basic-keys`) or an exported key string as an account that can sign a challenge |
| `DIDAccountModel` | `{ did, authenticate(credentials) }` |
| `DEFAULT_ALIAS` (`did-wallet`) | The service alias, and the prefix every default resource alias is built from |
| `DEF_KEYS_RESOURCE` · `DEF_META_RESOURCE` · `DEF_MASTER_RESOURCE` | `did-wallet-keys` · `did-wallet-meta` · `did-wallet-master` |
| `defDeps` | Those three constants as a `DIDServiceDeps` |

## Wiring

```typescript
import { appendDidService } from '@owlmeans/client-did'

appendDidService(context)                       // resources + service + context.getDidService()
appendDidService(context, 'signer')             // resources signer-keys / signer-meta / signer-master
```

`appendDidService` creates each missing dependency with `appendClientResource`, so the wallet
persists through whatever backend `@owlmeans/client-resource` resolves for those aliases — the
browser IndexedDB store when `@owlmeans/web-db` is registered. It derives resource aliases from the
service alias unless `deps` names them, and it registers `getDidService` only once: a second call
under another alias adds a service and its resources, and the accessor still answers for the first
one unless asked for another (`context.getDidService('signer')`).

The **first** `appendDidService` call also lists its three resources in the client debug menu with
`appendStateDebug`, so the menu's "Reset states" item clears the wallet along with the rest. That
listing sits behind the same `getDidService == null` check as the accessor: a second call under
another alias registers a service and its resources but adds nothing to the menu, so a second
wallet is not reset by it. The menu item exists only in a debuggable build — `cfg.debug.all` or
`cfg.debug.debugger` — because `appendDebugService` registers no service otherwise.

## Using the wallet

```typescript
const did = context.getDidService()
await did.ready()                    // the line above already started init; this waits for it

if (!await did.exists()) {
  await did.create()                 // builds the wallet AND mints its master seed
}

const wallet = did.get()
const master = await wallet.master()
```

`exists()` answers by loading the `MASTER` record from the master resource. Initialization is
started by `getDidService()` itself — the context's service accessor fires `lazyInit` on the first
lookup of a service that is not initialized yet — and `ready()` only waits on the promise that init
settles; it triggers nothing. Init initializes the keys resource and opens the wallet only when a
master seed is already stored, and it swallows whatever goes wrong so a broken store never blocks
the context — a context with no wallet comes up initialized with `get()` answering `undefined`, so
a screen must call `create()` before it can use one.

**`create()` is the entire first-run path.** It throws `DIDInitializationError('exists:service')`
rather than overwriting a wallet that already exists, and otherwise builds one with `force: true` —
which in `makeWallet` both waives the refusal for a missing master seed and runs `generate()` before
the wallet is handed back. So `create()` returns a **seeded** wallet: calling `wallet.generate()`
after it mints a second mnemonic over the first and loses the seed the wallet just made. Reach for
`generate(opts?)` only to re-seed a wallet deliberately.

`intialize()` (spelled with that typo in the interface) opens an already-seeded wallet with no
options, so it raises `DIDInitializationError('master')` when there is no master record — which is
why init calls it only after `exists()`.

## Authenticating with a wallet key

```typescript
import { makeDidAccountModel } from '@owlmeans/client-did'

const account = makeDidAccountModel(await wallet.master())
const credentials = await account.authenticate(challengeCredentials)
```

`authenticate` fills `userId` with the key's address, `publicKey` with its exported public key, and
`credential` with the signature over `auth.challenge` — it mutates and returns the credentials
object it was handed, so it composes with whatever the authentication plugin already filled in.

The argument decides how the key is read: an object carrying a `keyPair` (a `DIDKeyModel`, which is
what `wallet.master()` answers) is used as it is, any other object is treated as a `KeyPair` and
wrapped with `makeDidKeyModel`, and a string is a private key unless `isPub` is `true`, in which
case it is read through `fromPubKey` as an exported public key. `KeyPair` and `fromPubKey` are
`@owlmeans/basic-keys`, which an app handing in a raw key pair imports itself. A key read as public
carries no private half, so its account exports an address and a public key but `authenticate`
cannot produce the signature it needs.

## Depends On

- `@owlmeans/did` — `makeWallet`, `makeDidKeyModel`, `MASTER`, the three resource interfaces
- `@owlmeans/client-resource` — where the wallet's records live
- `@owlmeans/client`, `@owlmeans/client-context` — the context it registers on and the debug hookup
- `@owlmeans/auth` — the `AuthCredentials` shape `authenticate` fills
- `@owlmeans/context`, `@owlmeans/state`
- `@owlmeans/basic-keys` supplies the `KeyPair` type and `fromPubKey` that `makeDidAccountModel`
  uses, and is **not** among this package's declared dependencies — an app that passes a raw key
  pair declares it itself

## Related

- [[did]] — the wallet, key models and DID methods this service hosts
- [[client-resource]] — the storage the three dependency resources use
