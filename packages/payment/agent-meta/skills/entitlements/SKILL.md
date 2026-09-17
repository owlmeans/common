---
name: entitlements
description: "The OwlMeans entitlement model across @owlmeans/payment, @owlmeans/server-payment and @owlmeans/web-payment — ranked plans with a real free plan, capabilities versus counted limits, the three limit kinds, promos and grandfathering, the admission-first usage ledger and its may-over-count-never-over-admit invariant, the entitlement view the server gate and the browser both read, the two gate services, and the refusal errors. Use when deciding what a plan grants, gating a route on a feature or a quota, consuming or releasing a limit, or rendering plan state in a UI."
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# Entitlements — what a plan lets an entity do

An entity (the organization) always holds exactly one **effective plan**. The plan grants
**capabilities** (may it do X?) and **limits** (how many X may it do?). A route declares what it
needs; a gate refuses before the handler runs; the handler consumes. The browser renders the same
answer from the same pure functions, so a disabled button and a 403 cannot disagree.

## Where each half lives

| Layer | Package | Owns |
|---|---|---|
| Contracts | `@owlmeans/payment` | Plan declarations, `LimitKind`/`LimitWindow`, promos, the param grammars, the view builders, the refusal errors, `ENTITLEMENT_GATE`/`LIMIT_GATE` |
| Server | `@owlmeans/server-payment` | The subscription store, plan resolution, the usage ledger and its counters, the two gate services, reconciliation, the paygate lifecycle |
| Browser | `@owlmeans/web-payment` | Hooks over a served entitlement view (`useEntitlementView`, `useCapability`, `useLimit`, `usePortal`) and presentational pieces |

## Plans

- **Rank orders a product's plans.** A higher `rank` is an upgrade; a plan change is classified
  as upgrade/downgrade by rank. No two paid plans of one product share a rank.
- **The free plan is a real plan** — `free: true`, `price: 0`, `gateways: []`, lowest rank. The
  application grants it as an internal subscription row (`paygate: INTERNAL_PAYGATE`) when an
  entity is created, and plan resolution falls back to it when no entitling row exists. With no
  free plan declared and no entitling row, resolution throws `PlanRequired` — a setup fault, not a
  refusal.
- **The effective plan** is the highest-ranked subscription in `ENTITLING_STATUSES`
  (`Active`, `Trial`, `PastDue`). `PastDue` still entitles and is flagged; `Suspended` revokes
  until resumed; terminal statuses fall back to the free plan.
- A plan names its keys, never a product's copy: every limit key an application gates on appears
  on every plan (with `limit: 0` where not included), so "not included" is an answer, not a
  missing row.

## Capabilities versus limits

| | Capability | Limit |
|---|---|---|
| Declared as | `PlanCapability` (a permission set) | `LimitDeclaration` under a key in `plan.limits` |
| Asked as | `[scope:]permission[>=n]` | `limit:<key>[>=n]` |
| Gate alias | `ENTITLEMENT_GATE` | `LIMIT_GATE` |
| Answer | granted or not | room left in the current window |
| Changes when | the plan changes | something is consumed or released |

- `limit` is a reserved capability scope: no capability can answer a limit parameter.
- The two gates are different aliases because an entrypoint's gates are collected per gate
  service; one alias would let one requirement hide the other.
- Several parameters on one gate are OR'd.

## The three limit kinds

| Kind | Counter window | Renews |
|---|---|---|
| `window` (`day` / `month`) | `YYYY-MM-DD` / `YYYY-MM`, calendar UTC | at the UTC boundary; `resetsAt` is the exclusive start of the next window |
| `lifetime` | `lifetime` | never — the count belongs to the entity and survives plan changes, so an upgrade reads "1 of 4 used" |
| `occupancy` | `occupancy` | never — a held count, `+1` on acquire and `-1` on release, reconciled against what actually exists |

Windows are calendar UTC, never rolling and never local.

## Promos and grandfathering

`promo: { until, grandfather? }` on a capability set or a limit is plan metadata resolved per
subscription:

- in force while `now < until` (`now === until` is over);
- with `grandfather`, also for a subscription created before `until`, for as long as it lasts;
- lapsed: the capability is listed `granted: false`, the limit reads `limit: 0`, and the promo
  view says `active: false` — the UI says the promotion ended.

The server must put the subscription's creation date on the plan view (`subscribedAt`); without it
nothing is grandfathered.

## The usage ledger — admission first

Limits are event-sourced with synchronous admission:

- **The ledger of usage events is the source of truth; the counter per (entity, key, window) is a
  projection.**
- **Consume** increments the counter FIRST with an atomic conditional update (only while
  `used <= limit - amount`), then appends the event keyed by an idempotency `eventKey`. No update
  ⇒ `LimitExhausted`. A duplicate `eventKey` undoes the increment and replays the earlier outcome.
- **Release** appends first, then decrements (never below zero), and is idempotent.
- **Invariant: the counter may over-count, never over-admit.** A crash between the increment and
  the event leaves a unit counted that nothing spent — the periodic reconciliation recomputes
  counters from the ledger (and occupancy from reality). The opposite order would let two
  concurrent requests both pass a read-then-write check.
- **Key a consumption by the record it pays for** (`eventKey = <purpose>:<recordId>`,
  `ref = recordId`). A retry, a resumed run or a second attempt on the same record replays the same
  event instead of spending a second unit, and "was a unit already spent on this record?" is a
  ledger read rather than a marker written onto the record.
- Occupancy is reconciled against the live count; an entity over its ceiling is flagged
  (`overSince`) and the application decides what to do after a grace period — a cron never
  silently deletes customer work.

## The gates — the gate refuses, the handler consumes

- The **capability gate** passes when the effective plan grants any parameter. The subscription
  is the authority: a token's explicit `false` for a permission denies, a token's own grant never
  allows, and requiring the token permission as well is an opt-in gate option. Store errors
  refuse.
- The **limit gate** passes when any declared parameter has `remaining >= atLeast`. It **never
  consumes** — checking room and spending it are different moments, and only the handler knows
  whether the work actually started. Unparseable parameters are skipped; none left ⇒ refuse.
- The **handler consumes** with a record-keyed `eventKey` right before the paid work starts, and
  releases (or relies on the key's replay) when the work is undone.
- Declare the requirement on the protocol, never inside a handler, so the route table states what
  a feature costs.

## The entitlement view

One read of an entity's position, built by `entitlementViewOf(plan, planView, usage, at)`:

- `plan` — sku, rank, free, status, paygate, period, trial, cancel-at-period-end, past-due,
  fallback plan;
- `capabilities` — one row per granted permission, `param` exactly as the gate takes it;
- `limits` — one row per declared key with `limit`, `used`, `remaining` (floored at 0), and
  `windowStart`/`resetsAt` for window limits;
- `at` — when it was computed.

The server serves it; the browser reads it with the same `capabilityOf` / `limitOf` /
`hasLimitRoom` the gate logic uses. On the wire every date is an ISO string — revive
(`reviveEntitlementView`) before using a date. In the browser `null` means "not known yet": render
paid controls disabled rather than enabled-then-refused, and an application with its own store
reads the view through the pure selectors rather than polling it a second time.

## Refusals

| Error | Means | HTTP | Fields (rebuilt after a hop) |
|---|---|---|---|
| `CapabilityRequired` | none of the capability parameters is granted | 403 | `params` |
| `LimitExhausted` | no room in the current window | 403 | `limitKey`, `used`, `limit`, `resetsAt?` |
| `LimitUnknown` · `LimitMisdeclared` · `PlanRequired` · `PlanRankConflict` | configuration faults | 500 | — |

- Both refusals extend `AuthForbidden` through `EntitlementRefusal` — that is what turns them into
  a 403 at the HTTP boundary.
- Only `type` and `message` cross a service hop; the refusals pack their fields into the message
  and rebuild them on unmarshal. Catch the class after `ResilientError.ensure`.
- A UI phrases a refusal from `errors.<type>` and its fields (the reset date of an exhausted
  window), never from the message text.

## Related

- [[payment]] — the contracts in detail: grammars, window algebra, schemas
- [[server-payment]] — the Stripe lifecycle, the subscription store, the ledger and gates
- [[web-payment]] — the hooks and pieces
- [[error]] — marshalling and the error registry
