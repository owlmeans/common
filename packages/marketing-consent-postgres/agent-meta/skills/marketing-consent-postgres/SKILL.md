---
name: marketing-consent-postgres
description: How to use @owlmeans/marketing-consent-postgres — the Postgres extension that registers the two @owlmeans/server-marketing-consent resources (marketing-consent-state, marketing-consent-log) for a GENERATED TARGET PROJECT. Auto-invoked when wiring marketing-consent storage into a target project's Postgres backend, or touching the state/log table shape.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/marketing-consent-postgres

**Layer:** Infra extension
**Install:** `"@owlmeans/marketing-consent-postgres": "^0.1.18-rc.4"` in `dependencies` (peers `pg`, `ajv`)

The Postgres counterpart to `@owlmeans/server-marketing-consent`'s two resources. This package is
for a **generated target project**, which runs Postgres — the platform's own equivalent for
projects that stayed on Mongo is `@owlmeans/marketing-consent-mongo` (a separate, not-yet-built
package); Viable itself runs Mongo and never needs this one.

## Key Exports

| Export | Description |
|--------|-------------|
| `makeMarketingConsentStatePostgres(dbAlias?, serviceAlias?)` | `PostgresResource<MarketingConsentStateRecord>` at `RES_MARKETING_CONSENT_STATE` |
| `makeMarketingConsentLogPostgres(dbAlias?, serviceAlias?)` | `PostgresResource<MarketingConsentLogRecord>` at `RES_MARKETING_CONSENT_LOG` |
| `appendMarketingConsentPostgres(ctx, opts?)` | Registers both, each guarded by `ctx.hasResource(...)` — safe to call more than once |

## The schema is imported, never redeclared

Both makers set `resource.schema` to `MarketingConsentStateSchema` / `MarketingConsentLogSchema`
from `@owlmeans/server-marketing-consent` — this package owns no AJV schema of its own. The two
record shapes are shared with the (not yet built) `@owlmeans/marketing-consent-mongo` sibling;
duplicating the schema here would let the two extensions drift apart from what
`MarketingConsentService` actually reads and writes.

## `decisions` / `terms` / `documents` / `notices` are one jsonb column each — never split

`MarketingConsentStateRecord.decisions` is an ARRAY, never an object keyed by consent key —
`server-marketing-consent`'s own skill explains why: a dotted key like `"marketing.email"` is read
as a PATH by Postgres jsonb operators, so an object-keyed shape breaks the moment a second key is
added. This package does nothing to make that safe by itself — it relies on
`@owlmeans/postgres-resource`'s **default** schema-to-table rule: any `array` of objects (or any
nested `object` property) compiles to a single opaque `jsonb` column, never a child table and never
one column per field. No `pg:` override is applied here, and none is needed — `tests/schema.spec.ts`
asserts this directly against `schemaToTableSpec`, which is the one test that would catch a
regression here (in this package, in `postgres-resource`'s compiler, or in a future schema edit
that accidentally reshapes `decisions` into something path-addressable).

## Indexes

- `idx_mc_state_subject` — `{ columns: ['subject'], unique: true }`: one state row per subject.
  The service addresses a person's row by `subject` (the row's `id` is minted by Postgres), so
  this index is what makes that address unique, and what a racing first save collides on.
- `idx_mc_state_user` — `{ columns: ['userId'] }`: lookups across a user's profiles/entities.
- `idx_mc_log_subject_key` — `{ columns: ['subject', 'key', 'decidedAt'] }`: a subject's history
  for one consent key, newest first.
- `idx_mc_log_user` — `{ columns: ['userId', 'decidedAt'] }`: a user's whole consent/terms history.

## Wiring

```ts
import { appendMarketingConsentPostgres } from '@owlmeans/marketing-consent-postgres'
import { appendMarketingConsentService } from '@owlmeans/server-marketing-consent'

appendMarketingConsentPostgres(context) // register the two Postgres resources first
appendMarketingConsentService(context)  // the service resolves them by alias, lazily, per call
```

Registration order relative to the service append only matters for the resources needing to exist
by the first `status`/`save`/`terms` call — `server-marketing-consent`'s own skill covers this.

## Testing

`bun test ./tests` — `tests/schema.spec.ts` needs no live database (the jsonb-shape assertion
above); `tests/resource.spec.ts` is env-gated on `POSTGRES_URL` exactly like
`@owlmeans/postgres-resource`'s own integration suites (`@owlmeans/test-integration`'s
`postgresGate()`), and skips cleanly with no server reachable.

## Related

- `@owlmeans/server-marketing-consent` — the service, the record types, the AJV schemas this
  package imports (read its skill first)
- `@owlmeans/postgres-resource` — the resource factory, the schema-to-table compiler, `PgIndexSpec`
- `@owlmeans/marketing-consent-mongo` — the Mongo counterpart for the platform's own database (not
  yet built)
