---
name: server-marketing-consent
description: How to use @owlmeans/server-marketing-consent — the database-agnostic MarketingConsentService (status/save/terms/purge/isGranted/observe over two resources resolved by alias) plus the guarded status/save/terms entrypoint handlers for @owlmeans/marketing-consent's protocol tree. Auto-invoked when registering the marketing-consent service, writing a Mongo/Postgres extension that stores its two records, saving or reading a person's consent decisions server-side, or gating a send/share on a consent.
user-invocable: false
---

# @owlmeans/server-marketing-consent

**Layer:** Server
**Install:** `"@owlmeans/server-marketing-consent": "^0.1.18-rc.2"` in `dependencies`
**Contracts:** `@owlmeans/marketing-consent` — the catalogue, `consentStatus`, the protocol tree, the error family

## Key Exports

| Export | Description |
|--------|-------------|
| `RES_MARKETING_CONSENT_STATE` (`marketing-consent-state`) · `RES_MARKETING_CONSENT_LOG` (`marketing-consent-log`) | Resource aliases — never rename, a later Mongo/Postgres extension's generated resource file names derive from these exact strings |
| `MarketingConsentStateRecord` · `MarketingConsentLogRecord` · `MarketingConsentStateSchema` · `MarketingConsentLogSchema` | The two record shapes and their AJV `JSONSchemaType` schemas — shared with the (not yet built) `@owlmeans/marketing-consent-mongo` / `@owlmeans/marketing-consent-postgres` extensions, which import them rather than redeclaring |
| `subjectOf(req)` · `subjectKey(subject)` · `MarketingConsentSubject` | Who a decision is recorded for, and its one string record id |
| `makeMarketingConsentService(opts?)` · `appendMarketingConsentService(ctx, opts?)` | Build/register the `MarketingConsentService` |
| `MarketingConsentService` | `definitions`, `status`, `save`, `recordTerms`, `isGranted`, `purge`, `observe` |
| `marketingConsentStatus` · `saveMarketingConsent` · `recordTermsAcceptance` | Handler makers for `makeMarketingConsentProtocols().status/save/terms` |
| `serveMarketingConsentEntrypoints(protocols, opts?)` | Binds `status`/`save`/`terms` — `base` and `screen` carry no server handler of their own |

## Wiring

```ts
import { appendMarketingConsentService, serveMarketingConsentEntrypoints } from '@owlmeans/server-marketing-consent'
import { makeMarketingConsentProtocols } from '@owlmeans/marketing-consent'

// shared package
export const marketingConsentProtocols = makeMarketingConsentProtocols({ parent: appProtocols.account.base })

// backend context — after the Mongo/Postgres extension has registered the two resources
appendMarketingConsentService(context, { config: appMarketingConsentConfig })

// API process
context.registerEntrypoints(serveMarketingConsentEntrypoints(marketingConsentProtocols))
```

`appendMarketingConsentService` is the same "an app that cares provides its own; this is the
working default" shape as `AUTH_CACHE`/`appendOAuthServer`: it registers nothing but the
`MarketingConsentService` itself (LazyService, `createLazyService`) and is a no-op if the alias is
already registered. The TWO RESOURCES it reads and writes (`RES_MARKETING_CONSENT_STATE`,
`RES_MARKETING_CONSENT_LOG`) are resolved BY ALIAS from the context lazily, inside each method call
— this package never imports `mongo-resource`/`postgres-resource` and never constructs them. A
Mongo or Postgres extension package registers the concrete resources at those two aliases
separately, and `appendMarketingConsentService` must run after that registration (resource lookup
is lazy per call, so registration order relative to `init()` does not matter — only "resource
exists under this alias before the first `status`/`save`/`terms` call" does).

## Why `decisions` is an ARRAY, never an object keyed by consent key

This is the single most important gotcha in this package. `MarketingConsentStateRecord.decisions`
holds `MarketingConsentDecision[]`, one entry per key, folded down to the latest per key on read
(`consentStatus`). It is never stored as `{ [key]: MarketingConsentDecision }`, because every
standard consent key is DOTTED (`marketing.email`, `trackers.advertising`) and a dotted key inside
an object field is read as a PATH by both Mongo's dot-notation queries (`{'decisions.marketing.email':
...}` reaches into a nested `email` field under a nested `marketing` field, not a literal key) and
Postgres jsonb path operators (`->` chains on segments). An object-keyed shape works in a quick
manual test with one key and breaks the moment a second dotted key is added — the two fields
silently merge into one nested tree instead of staying two siblings. Keep it an array in every
storage backend; fold by key only in memory, in `consentStatus` or in a resource's own read path.

## `subjectOf` never uses the slug

```ts
export const subjectOf = (req: AbstractRequest): MarketingConsentSubject => {
  if (req.auth?.userId == null || req.auth.userId === '') throw new AuthForbidden(...)
  return { userId: req.auth.userId, profileId: req.auth.profileId, entityId: req.entity?.id }
}
```

`entityId` reads `req.entity?.id` ONLY — never `requireEntityKey(req)`, never a slug off the token.
A deployment with no organization concept at all (a generated target app serving its own end users,
say) registers no entity resolver, so `req.entity` stays `undefined` and `entityId` is simply
absent — a valid, expected shape this package must never throw on. `subjectKey(subject)` —
`` `${entityId ?? ''}|${userId}|${profileId ?? ''}` `` — is the state record's own `id`: one record
per subject, looked up with a plain `load(id)`, no secondary index needed for the common read path.

## `isGranted` is not `consentStatus`'s display `granted`

`status(subject)` returns what `consentStatus` computes for a settings screen: an unanswered
`opt-out` item (e.g. `data.partners`) reads `granted: true` there — the "on until you turn it off"
copy an unauthenticated-feeling first visit shows. `isGranted(subject, key)` is a DIFFERENT
question — the SERVER-SIDE gate a send/share actually checks before doing something — and it must
never honor that display default: an item whose `status` is `'new'` or `'revised'` has never been
affirmatively answered by this person, so `isGranted` answers `false` for it regardless of what
`consentStatus.granted` says, and `false` too for a key `definitions()` does not carry at all
(unknown or disabled). Only a `'current'` (i.e. actually saved, unrevised) item's `granted` is
trusted. Getting this backwards — wiring a send to `status(...).items.find(...).granted` instead of
`isGranted(...)` — sends to people who opened the settings screen and changed nothing.

## `save` / `recordTerms` — the upsert and the log

- `save` rejects the whole request (`UnknownMarketingConsentError`) if ANY submitted key is not in
  `definitions()` — never silently drops one; a dropped decision is a decision the person believes
  they made and did not (`@owlmeans/marketing-consent`'s own skill).
- Each submitted decision becomes ONE `MarketingConsentLogRecord` (`kind: 'consent'`), appended —
  never updated, never deleted — then the state record's `decisions` array has that key's entry
  REPLACED in place (by key) and the rest left untouched; a second save for the same key never
  duplicates it, it supersedes it. `recordTerms` mirrors this for the state record's single `terms`
  field, without touching `decisions`.
- The state record's create-vs-update race is handled the same way
  `@owlmeans/server-auth-session`'s Redis manager handles a natural-id create race: try `create`,
  and on `RecordExists` reload and `save` instead.

## The append-only log as GDPR Art. 7(1) evidence

`MarketingConsentLogRecord` rows are never updated or deleted, including by `purge()` — `purge`
clears only the current-state record (so future `status`/`isGranted` reads see a fresh subject);
the log keeps every decision and terms acceptance ever recorded, because that history is what
"demonstrates consent" under GDPR Art. 7(1) and is grounds for the whole design (`@owlmeans/
marketing-consent`'s own skill's legal matrix). A retention/erasure policy for the log itself is a
product decision this package does not make.

## `observe`

`save`/`recordTerms` call every registered listener, in registration order, each awaited and each
wrapped in its own try/catch — one listener's failure never blocks the write or stops the next
listener (the same shape `@owlmeans/server-auth-identity`'s `IdentityEventsService.
propagateEntityCreated` uses). Use it to sync a `MarketingConsentBridge` (a cookie-consent widget) or
to fan a decision out to a downstream system; never to do work the write itself depends on.

## Testing

Category B: `bun test ./tests` with real `@owlmeans/static-resource` stores for both resources, no
Mongo/Postgres (`tests/context.ts` builds the context and calls `appendMarketingConsentService`
directly — the app never calls `context.init()`/`configure()` in this style of test, since a
`Resource` lookup is synchronous and a `LazyService`'s `lazyInit` fires the first time
`context.service(alias)` is read). `tests/service.spec.ts` covers the upsert-in-place save, the
`isGranted` vs display-`granted` distinction (the single most important test in the package),
`purge` leaving the log untouched, and a throwing observer never blocking a write.
`tests/handlers.spec.ts` binds the three handlers and asserts `save`/`terms` refuse an
`AuthroizationType.AuthToken` request (`refuseTokenAuth`) while `status` never does.
`tests/subject.spec.ts` covers the no-`entity`-resolver case explicitly.

## Related

- `@owlmeans/marketing-consent` — the catalogue, `consentStatus`, the protocol tree (read its skill
  first; this package builds on it and repeats nothing it already documents)
- `@owlmeans/server-oauth`, `@owlmeans/server-auth-token` — `refuseTokenAuth`, the session-guarded
  handler shape this package's `save`/`terms` copy
- `@owlmeans/server-auth-identity` — `IdentityEventsService`, the `observe`/listener idiom this
  package's `observe` mirrors
- `@owlmeans/marketing-consent-mongo`, `@owlmeans/marketing-consent-postgres` — later workstreams,
  not built yet, that register the two resources this service reads by alias
