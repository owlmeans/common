---
name: marketing-consent-mongo
description: How to use @owlmeans/marketing-consent-mongo — Mongo storage for @owlmeans/server-marketing-consent's two resources (marketing-consent-state, marketing-consent-log). Auto-invoked when registering marketing-consent resources on a Mongo-backed platform context, or touching the two Mongo indexes/schemas this package builds.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/marketing-consent-mongo

**Layer:** Infra
**Install:** `"@owlmeans/marketing-consent-mongo": "^0.1.18-rc.6"` in `dependencies` (peers `mongodb`, `ajv`)

Mongo storage for `@owlmeans/server-marketing-consent`'s two resources —
`marketing-consent-state` (`RES_MARKETING_CONSENT_STATE`) and `marketing-consent-log`
(`RES_MARKETING_CONSENT_LOG`) — the same relationship `@owlmeans/server-auth-identity` has to
its own Mongo resources. Use it on the platform itself (Viable runs Mongo); a generated target
project uses the Postgres sibling, `@owlmeans/marketing-consent-postgres`, instead.

## Key Exports

| Export | Description |
|--------|-------------|
| `appendMarketingConsentMongo(ctx, opts?)` | Registers both resources — a no-op per resource if it is already registered (`ctx.hasResource`), so a second call never throws or re-registers |
| `makeMarketingConsentStateMongo(dbAlias?, serviceAlias?)` | Mongo resource for `MarketingConsentStateRecord` |
| `makeMarketingConsentLogMongo(dbAlias?, serviceAlias?)` | Mongo resource for `MarketingConsentLogRecord` |

```ts
import { appendMarketingConsentMongo } from '@owlmeans/marketing-consent-mongo'
import { appendMarketingConsentService } from '@owlmeans/server-marketing-consent'

appendMarketingConsentMongo(context)       // register the two resources first
appendMarketingConsentService(context)     // then the service that resolves them by alias
```

## Why the schema is imported, not duplicated

Both makers assign `resource.schema` from `MarketingConsentStateSchema`/`MarketingConsentLogSchema`
— `@owlmeans/server-marketing-consent`'s own AJV schemas — never a local redeclaration. That
package's skill already explains why `decisions` is an ARRAY and not an object keyed by consent
key (a dotted key like `marketing.email` is read as a PATH by Mongo dot-notation); this package
just stores that shape, it does not reshape it.

## The one adjustment: `id` is dropped from the Mongo validator's `required`

`MarketingConsentStateSchema`/`MarketingConsentLogSchema` correctly list `id` in `required` — that
is the right contract for `@owlmeans/server-marketing-consent`'s own AJV validation of a
fully-formed record, where `id` is always present after `mongo-resource` demarshals `_id`. Handed
to `mongo-resource` **as-is**, though, that same `required: ['id', ...]` becomes the collection's
`$jsonSchema` validator — and a Mongo document never carries a literal `id` field, only `_id`.
Verified against a real (embedded) MongoDB while building this package: assigning the schema
unmodified makes every `create()` fail with `MongoServerError: Document failed validation`
(`missingProperties: ["id"]`), because the document `mongo-resource` actually inserts has no `id`
key for the validator to find.

`resource.ts`'s private `forMongoValidator(schema)` fixes this the same way
`@owlmeans/server-payment`'s own hand-written Mongo schemas already do it — keep `id` in
`properties` (nullable/optional there is fine) but drop it from `required` — by shallow-cloning
the schema and filtering `required`. `properties` stays the exact same object the shared schema
exports; nothing about the record shape is duplicated or reinterpreted, only the Mongo-specific
`required` list is narrowed. `tests/schema.spec.ts` asserts this precisely: `resource.schema.
properties` is reference-equal to the shared schema's `properties`, and `required` equals the
shared list minus `id`.

This is a general gap in `@owlmeans/mongo-resource`'s schema→validator conversion (`schemaToMongoSchema`
carries `required` through verbatim, with no special case for `id`), not something specific to
marketing-consent — any future package that assigns a shared "full record" AJV schema straight to
a `MongoResource.schema` will hit the same failure. This package works around it locally; it does
not fix `mongo-resource` itself.

## The two indexes

- `idx_mc_state_subject` on `{ subject: 1 }`, **unique** — one current-state record per person.
  The service addresses a person's row by `subject` (Mongo mints `_id`), so this index is what
  makes that address unique, and what a racing first save collides on.
- `idx_mc_state_user` on `{ userId: 1 }` — lookups by account, independent of `subject`'s
  entity-scoping.
- `idx_mc_log_subject_key` on `{ subject: 1, key: 1, decidedAt: -1 }` — the log's one real read,
  "the latest decision for this subject and key", served straight off the index.
- `idx_mc_log_user` on `{ userId: 1, decidedAt: -1 }` — an account's decision history in order.

## Testing

`tests/schema.spec.ts` needs no live Mongo — the schema-wiring assertions above. `tests/
resource.spec.ts` is Category C (`/testing-integration`): gated on `MONGO_URL`, self-skips
cleanly when unreachable. It boots a real `ServerContext` through `tests/context.ts` (mirrors
`@owlmeans/mongo`'s and `@owlmeans/server-payment`'s own harness), registers both resources via
`appendMarketingConsentMongo`, and covers: a state record with a dotted key inside `decisions`
round-tripping verbatim, the unique index rejecting a second state record for the same `subject`,
a log record, and `appendMarketingConsentMongo` being a true no-op — `hasResource` true and the
same resource instances — the second time it runs.

## Related

- `@owlmeans/server-marketing-consent` — the two record shapes/schemas, the service that resolves
  these resources by alias, and why `decisions` is an array
- `@owlmeans/mongo-resource` — the maker (`makeMongoResource`), `index()`, schema→validator
  conversion
- `@owlmeans/server-auth-identity` — the `appendXResources(ctx, dbAlias?)` shape this package's
  `appendMarketingConsentMongo` copies
- `@owlmeans/marketing-consent-postgres` — the Postgres sibling for generated target projects
