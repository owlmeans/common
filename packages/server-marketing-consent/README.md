# @owlmeans/server-marketing-consent

The server half of `@owlmeans/marketing-consent`: a database-agnostic `MarketingConsentService`
(status, save, terms acceptance, the `isGranted` send gate, purge, observers) over two resources it
resolves by alias, plus the `status` / `save` / `terms` handlers for the protocol tree from
`makeMarketingConsentProtocols`. A backend uses it when people record marketing or data-use consent
and terms acceptance through the API, or when server code must check a consent before sending or
sharing. It stores nothing by itself: register the resources with
`@owlmeans/marketing-consent-mongo` or `@owlmeans/marketing-consent-postgres`. Pure catalogue and
status logic without a server lives in `@owlmeans/marketing-consent`; the screens are
`@owlmeans/web-marketing-consent`.

## Installation

```bash
bun add @owlmeans/server-marketing-consent@^0.1.18-rc.17
```

## Concepts

- **Subject** — `MarketingConsentSubject` `{ userId, profileId?, entityId? }`, read from an
  authenticated request. `entityId` comes only from `req.entity?.id`; an app without organization
  entities simply has none.
- **Subject key** — `` `${entityId ?? ''}|${userId}|${profileId ?? ''}` ``, stored in the state
  record's `subject` field. Records are addressed by `subject`, never by `id` (the backend mints
  `id`).
- **State record** — `MarketingConsentStateRecord` at `RES_MARKETING_CONSENT_STATE`: one row per
  subject holding the latest decision per key (`decisions` is an array) and the last terms
  acceptance.
- **Log record** — `MarketingConsentLogRecord` at `RES_MARKETING_CONSENT_LOG`: append-only evidence
  of every decision (`kind: 'consent'`) and terms acceptance (`kind: 'terms'`). Never updated or
  deleted.
- **Send gate** — `isGranted(subject, key)` trusts only a saved, unrevised (`current`) answer; the
  display `granted` from `status()` defaults unanswered opt-out items to `true` and must not gate a
  send.

## Usage

### Register storage, the service and the handlers

```typescript
import { makeMarketingConsentProtocols } from '@owlmeans/marketing-consent'
import { appendMarketingConsentPostgres } from '@owlmeans/marketing-consent-postgres'
import { appendMarketingConsentService, serveMarketingConsentEntrypoints } from '@owlmeans/server-marketing-consent'

// shared package
export const marketingConsentProtocols = makeMarketingConsentProtocols({ parent: appProtocols.account.base })

// backend context
appendMarketingConsentPostgres(context)              // the two resources
appendMarketingConsentService(context, {             // no-op when the alias is already registered
  config: { standard: { 'marketing.phone': false } },
})

// API process
context.registerEntrypoints(serveMarketingConsentEntrypoints(marketingConsentProtocols))
```

`serveMarketingConsentEntrypoints` binds `status`, `save` and `terms` only. A `base` declared without
a `parent` must still be bound by the app, or boot fails with `Entrypoint marketing-consent not found`.

### Gate a send on a consent

```typescript
import { MC_EMAIL, MARKETING_CONSENT_SERVICE } from '@owlmeans/marketing-consent'
import type { MarketingConsentService } from '@owlmeans/server-marketing-consent'

const consents = context.service<MarketingConsentService>(MARKETING_CONSENT_SERVICE)

if (await consents.isGranted({ userId, profileId, entityId }, MC_EMAIL)) {
  await sendNewsletter(userId)
}
```

### Record a decision from server code

```typescript
import { marketingConsentSubjectHelper } from '@owlmeans/server-marketing-consent'

const subject = marketingConsentSubjectHelper.subjectOf(req)   // AuthForbidden without a user
await consents.save(subject, { decisions: [{ key: MC_EMAIL, granted: false }], source: 'api' })
```

`source: 'api'` is accepted only by the service, never by the HTTP `save` schema. It is meant for a
server withdrawing a consent on a caller's behalf.

### React to decisions

```typescript
consents.observe(async ({ subject, decisions }) => {
  await mailingList.sync(subject.userId, decisions)
})
```

Listeners run in registration order after each `save`; a throwing listener is logged and never fails
the write.

### Custom handler options

```typescript
import { saveMarketingConsent } from '@owlmeans/server-marketing-consent'
import { bind } from '@owlmeans/server-entrypoint'

bind(protocols.save, saveMarketingConsent(protocols.save, { allowAccessTokens: true, serviceAlias: 'my-consents' }))
```

## API

### Functions

| Symbol | Purpose |
|---|---|
| `makeMarketingConsentService(opts?)` | Builds the lazy `MarketingConsentService` |
| `appendMarketingConsentService(ctx, opts?)` | Registers it unless the alias already exists |
| `serveMarketingConsentEntrypoints(protocols, opts?)` | `[bind(status), bind(save), bind(terms)]` |
| `marketingConsentStatus(protocol, opts?)` | `status` handler; reads `Sec-GPC: 1` as `gpc` |
| `saveMarketingConsent(protocol, opts?)` | `save` handler; refuses access-token auth unless `allowAccessTokens` |
| `recordTermsAcceptance(protocol, opts?)` | `terms` handler; refuses access-token auth unless `allowAccessTokens` |
| `marketingConsentSubjectHelper.subjectOf(req)` | `MarketingConsentSubject`; throws `AuthForbidden` without `req.auth.userId` |
| `marketingConsentSubjectHelper.subjectKey(subject)` | The `subject` string a state record is addressed by |
| `createMarketingConsentSubjectHelper()` | Builds a `MarketingConsentSubjectHelper` |

### `MarketingConsentService`

| Method | Purpose |
|---|---|
| `definitions()` | Effective catalogue from `opts.config`, memoized |
| `status(subject, { gpc? }?)` | `MarketingConsentStatusView` for a screen |
| `save(subject, request)` | Validates every key (`UnknownMarketingConsentError` on any unknown), appends one log row per decision, replaces those keys in the state record, notifies observers |
| `recordTerms(subject, acceptance, { source? }?)` | Appends a `terms` log row and sets the state record's `terms`; `source` defaults to `sign-in` |
| `isGranted(subject, key, { gpc? }?)` | `true` only for a `current` item whose saved answer is granted |
| `purge(subject)` | Deletes the state record; log rows stay |
| `observe(listener)` | Adds a `MarketingConsentObserver` |

### Constants, schemas and types

| Symbol | Kind | Purpose |
|---|---|---|
| `RES_MARKETING_CONSENT_STATE` | const | `'marketing-consent-state'` |
| `RES_MARKETING_CONSENT_LOG` | const | `'marketing-consent-log'` |
| `MarketingConsentStateSchema`, `MarketingConsentLogSchema` | AJV schema | Shared with the storage packages |
| `MakeMarketingConsentServiceOptions` | type | `{ alias?, state?, log?, config? }` |
| `MarketingConsentHandlerOptions` | type | `{ serviceAlias?, allowAccessTokens? }` |
| `MarketingConsentServedProtocols` | type | `status`, `save`, `terms` of the protocol tree |
| `MarketingConsentStateRecord`, `MarketingConsentLogRecord` | type | Stored records |
| `MarketingConsentSubject`, `MarketingConsentSubjectHelper` | type | Who a decision is recorded for |
| `MarketingConsentService`, `MarketingConsentObserver`, `MarketingConsentContext` | type | Service, listener, `ServerContext<ServerConfig>` |

## Testing

`bun test ./tests` runs against `@owlmeans/static-resource` stores for both aliases; no database is
needed. The suites cover the in-place upsert, `isGranted` versus display `granted`, `purge` leaving
the log intact, a throwing observer, the access-token refusal on `save` / `terms`, and a request
without an organization entity.

## Common pitfalls

- Gating a send on `status(...).items[n].granted` instead of `isGranted` — that sends to people who
  opened the settings screen and changed nothing.
- Storing `decisions` as an object keyed by consent key — dotted keys (`marketing.email`) become
  paths in Mongo and Postgres jsonb queries.
- Creating a state record with a caller-supplied `id` — Mongo and Postgres refuse it; the service
  addresses rows by `subject`.
- Expecting `purge` to remove the log — the log is GDPR Art. 7(1) evidence and is never deleted
  here.
- Reading `entityId` from a slug or `requireEntityKey` — the subject takes `req.entity?.id` only.
- Forgetting a storage package — the service resolves its resources by alias on first call and fails
  there.

The `server-marketing-consent` skill covers these rules in depth; the `marketing-consent` skill
covers the catalogue and status table.

## Related packages

- [`@owlmeans/marketing-consent`](../marketing-consent) — catalogue, status resolution, protocol tree, errors
- [`@owlmeans/marketing-consent-mongo`](../marketing-consent-mongo) — MongoDB resources for the two aliases
- [`@owlmeans/marketing-consent-postgres`](../marketing-consent-postgres) — PostgreSQL resources for the two aliases
- [`@owlmeans/web-marketing-consent`](../web-marketing-consent) — the screens that call these handlers
- [`@owlmeans/server-auth-token`](../server-auth-token) — `refuseTokenAuth`, used by `save` and `terms`
- [`@owlmeans/server-api`](../server-api) — the `handlers()` builder the handlers use

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.52
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
