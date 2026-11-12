# @owlmeans/test-payment

The test harness of `@owlmeans/server-payment` and its payment providers: a real server context over
in-memory resources, the neutral catalogue fixture, and a fake paygate that records every call. A
provider package's tests build on it (registering their own provider instead of the fake); the
host's own specs run on the fake paygate. Dev dependency only.

## Installation

```bash
bun add -d @owlmeans/test-payment@^0.2.0-alpha.1
```

## Usage

```typescript
import { makeFakeContext, makeFakePaygate, PRO, PLANS_PRODUCT } from '@owlmeans/test-payment'

// the default: one fake paygate (id `fake`), an unmanaged gateway, managed consumer rights
const fake = await makeFakeContext()
fake.paygate?.state.calls            // every paygate call, with its arguments

// a managed gateway on a paygate without subscriptions
const paygate = makeFakePaygate({ without: ['subscriptions'], state: { settlementCurrency: 'eur' } })
const managed = await makeFakeContext({ providers: [paygate.provider], gateway: { manage: true, bootstrap: false } })

// a provider package's own context
const provider = await makeFakeContext({ providers: [makeMyProvider({ client })], configure: cfg => declareMySettings(cfg) })
```

## Concepts

- **`makeFakeContext(opts)`** — the real catalogue, payment service, observer, gateway (unmanaged
  unless `gateway` says otherwise), gates, entitlement and consumer-rights services, over in-memory
  resources; a console mailer (`mails`); every observer recorded (`observed`, with `fail…` counters
  that make the next callbacks throw). `providers` (default: one `makeFakePaygate()`), `pricing`,
  `consumerRights`, `meter`, `seed` (rows before init — a database shared by two processes),
  `service` / `host` / `base` / `services` (the deployment's addresses), `configure` (a provider's own
  records), `gatewayFirst`, `rights`, `wire`.
- **`memoryResource(resource)`** — turns a real Mongo resource (its indexes kept) into an in-memory
  one: unique and sparse-unique indexes, the criteria engine, raw conditional updates
  (`findOneAndUpdate`, `updateOne` with `$set` / `$inc` / `$unset`, `deleteOne`), `distinct`, and the
  `$match` + `$group` aggregation the usage ledger runs.
- **`makeFakePaygate(opts)`** — every paygate capability in memory (or the ones `without` leaves out:
  `subscriptions`, `payments`, `creditNotes`, `webhook`, `catalogue`, `portal`, `tax`, `fx`,
  `listCompleted`), `features` over the defaults, `state` to seed: customers, prices by lookup key,
  subscriptions, invoices, charges, FX quotes, the tax answer, completed sessions, the events the next
  verified delivery answers (`pending`, signed with the `x-fake-signature: ok` header), and `failures`
  that make a method's next calls throw.
- **`declareTestCatalogue(cfg, opts)`** — a consumable credits product (amount-priced, USD) and a
  plans product with a free, a pro and a team plan; `future(days)` / `past(days)`.

## Related

- `@owlmeans/server-payment` — the host under test
- `@owlmeans/payment` — the contracts

## License

MIT

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.2.0-alpha.2
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
