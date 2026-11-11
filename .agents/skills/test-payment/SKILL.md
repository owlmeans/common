---
name: test-payment
description: How to test @owlmeans/server-payment and its payment providers with @owlmeans/test-payment — makeFakeContext (a real server context over in-memory resources, observers and mails recorded, providers registered), makeFakePaygate (every paygate capability in memory, recorded calls, failures, capabilities left out), memoryResource (unique indexes, raw conditional updates, aggregation) and the neutral catalogue fixture. Use when writing or changing a payment spec in common (host logic on the fake paygate) or in a provider package (its own provider on the shared context).
user-invocable: false
---

# @owlmeans/test-payment

**Install:** `bun add -d @owlmeans/test-payment@^0.2.0-alpha.0` (dev dependency only)

The one harness every payment test builds on. The host's specs (`@owlmeans/server-payment`) run on
the fake paygate, so "the host asked the paygate for exactly this" is an assertion; a provider
package (connect) registers its own provider on the same context and tests its SDK calls there.
Nothing here names a provider.

## The context

`makeFakeContext(opts)` builds a real server context — the real catalogue, payment service, completion
observer, gateway, both gates, the entitlement and the consumer-rights services — over in-memory
resources, then configures and initializes it.

| Option | Default | Use |
|---|---|---|
| `providers` | one `makeFakePaygate()` (returned as `paygate`) | the payment providers registered before the gateway; `[]` registers none |
| `gateway` | `{ manage: false }` | the gateway's options — `{ manage: true, bootstrap: false }` to check out without a boot bootstrap |
| `rights` | `{ manage: true, usage: meter }` | the application's consumer-rights options |
| `pricing`, `consumerRights` | none | `declarePaymentPricing` / `declareConsumerRights` |
| `configure` | none | further declarations after the catalogue — a provider's own records |
| `catalogue` / `declare` | `declareTestCatalogue` | the catalogue fixture's options, or your own declarations |
| `service`, `host`, `base`, `services` | `app`, `api.example.com` | the deployment's addresses (the webhook URL, the deployment key) |
| `seed` | none | rows per resource alias before init — a database another process already wrote |
| `mailer` | `true` | a console mailer under `MAILER_SERVICE`; its messages are `mails` |
| `gatewayFirst`, `wire` | — | registration order, a pre-init hook |

It answers `{ ctx, stores, observed, mails, mailer, paygate? }`: `stores[alias].rows` are the
in-memory rows; `observed` records every observer callback, and `failTopUp` / `failSubscription` /
`failWithdrawal` / `failGrant` make the next `n` callbacks throw.

## The fake paygate

`makeFakePaygate({ id?, features?, without?, state? })` → `{ provider, state }`:

- every call is recorded in `state.calls` (`method`, `args` — functions left out), so an empty list
  is "no paygate call";
- `state.failures[method]` throws on the next call (a message, an error, or a list — one per call);
- `without` leaves capabilities out (`subscriptions`, `payments`, `creditNotes`, `webhook`,
  `catalogue`, `portal`, `tax`, `fx`, `listCompleted`) — how a spec drives the host's reaction to an
  absent capability;
- `features` overrides the defaults (every feature on, sessions 30 min – 24 h, no text limit);
- `state` seeds customers, `prices` by lookup key, `subscriptions`, `invoices`, `charges`, FX
  `quotes` (`<from>:<to>`), the `tax` answer (or a function of the input), `completed` sessions,
  `settlementCurrency`, the customer `locks`, `sessionUrl` (`null`: a session without a URL);
- a verified delivery (header `FAKE_SIGNATURE: 'ok'`) answers the queued `state.pending` events; any
  other signature is `PaygateSignatureError`.

The sessions the host asked for are `state.sessions` (`SessionInput`), portal sessions
`state.portalSessions`, endpoints and configurations the bootstrap ensured `state.endpoints` /
`state.configurations`.

## Rules

- A host spec asserts what the host asks the paygate (`state.sessions`, `state.calls`) and what it
  stores and tells observers — never a provider's SDK parameters; those belong to the provider's
  own specs (and its golden records).
- A provider spec registers its provider through `providers` and declares its records through
  `configure`, keeping `makeFakeContext`'s other options, so its specs move between packages with
  only their imports changed.
- Mongo-backed behaviour (validators, concurrent admission) is an integration spec gated on
  `MONGO_URL` (`@owlmeans/test-integration`), not this harness.

## Related

- [[server-payment]] — the host under test
- [[testing-overview]] — the test categories
