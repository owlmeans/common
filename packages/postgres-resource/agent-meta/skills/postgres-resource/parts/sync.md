---
name: sync
description: Authoritative structure reconciliation (PgAutoSync modes, canonical definition comparison, drops and retypes) and the code migrations that bracket it.
metadata:
  purposes: migration, data, ops
  mentions: PgAutoSync, autoSync, planSync, introspectTable, canonicalDefinition, PostgresCastRequired, MigrationStage, MigrationConflict, MigrationError, unmanaged
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/postgres-resource — Reconciliation and migrations

## Reconciliation is authoritative — `PgAutoSync`

At `init()`: take a **session** advisory lock on the qualified table name → introspect → diff →
apply the whole `DdlPlan` in one transaction → release the lock. The lock is session level, not
`xact`, because it has to span the migrations as well as the DDL, and those run in transactions of
their own inside it — only the plan itself is one `BEGIN`/`COMMIT`. Concurrent replicas therefore
serialize on the whole initialization, not just on the DDL. `DbConfig.meta.autoSync`:

| Value | Behaviour |
|---|---|
| `Full` (default) | add / retype+backfill / drop columns, reconcile indexes and constraints |
| `Additive` | add only — never retypes, never drops |
| `Off` | **no table DDL** — the structure is never diffed and no statement is emitted, so a missing table is never created and the first query dies with `42P01`. Only for a table something else already provisions |

The schema root override `pg: { autoSync }` is a boolean and wins per table: it turns reconciliation
back on for one table under `meta.autoSync: 'off'`, and off for one table under the other two modes.
`Full` versus `Additive` still comes from the config.

**A table at its declared shape plans nothing.** Postgres reports what it stores in its own
rendering — identifiers unquoted, every literal cast (`''::text`), a `varchar` column cast inside
an expression, a partial predicate and each operator expression parenthesized, `IN (…)` as
`= ANY (ARRAY[…])`, a default as `(gen_random_uuid())::character varying`. Index, constraint and
default definitions are therefore compared in `canonicalDefinition` form (case, quotes, casts,
whitespace and parentheses dropped), never as raw text — raw comparison dropped and recreated every
declared index and enum `CHECK` on every boot. Declare expressions and `where` predicates in plain
SQL; a change that differs from the old definition only in how its operators group is invisible
to the comparison, so give it a new index name.

**`Full` DROPs columns the schema doesn't declare.** Adopting a table this package didn't create:
boot once with `Additive`, confirm the plan comes out empty, then flip to `Full`. Columns listed in
`pg.unmanaged` stay outside reconciliation's authority permanently. A cast Postgres cannot perform
raises `PostgresCastRequired` instead of truncating.

**A retype drops the column's default first and restores it after.** Postgres refuses
`ALTER COLUMN … TYPE` outright when the column carries a DEFAULT it cannot cast to the new type
(`42804 default for column "x" cannot be cast automatically`), and it refuses before reading a
single row, so `USING` never gets a chance to help. Since the plan is one transaction, that refusal
aborts the whole reconciliation and the resource then fails *every* boot with an error naming the
column it is trying to fix. The plan therefore emits `DROP DEFAULT` → `ALTER … TYPE … USING` →
`SET DEFAULT`, restoring the default from the spec rather than from what the column was carrying.
The `id` column is where this shows up in practice: it is created with a `gen_random_uuid()::text`
default, so any change to its declared type takes this path.

## Migrations bracket the sync

`migration`/`migrations()` implement the shared `MigratableResource` capability from
[[resource]] (its `migrations` part) — same contract as mongo.

```typescript
resource.migration('0001-rescue-legacy', async tx => {
  await tx.execute(`UPDATE {{}} SET slug = legacy WHERE slug IS NULL`)
}, MigrationStage.Pre)
```

- `Pre` runs **before** the table is reshaped — the only place to rescue data reconciliation is
  about to drop. `Post` runs **after**, so it can use the new columns.
- On a table this package just created, every declared migration is **baselined** (recorded, not
  executed) — a fresh table is already at head.
- Applied once, in registration order, each in its own transaction, ledgered in
  `_owlmeans_migrations` in the same Postgres schema.
- The checksum fingerprints the function's **source text**. Keep bodies at module scope; a body
  closed over a loop variable fingerprints the wrapper and drifts. An edited applied body raises
  `MigrationConflict`; a throwing one raises `MigrationError` and aborts `init()`.
