---
description: "How to use @owlmeans/resource — generic resource abstraction (CRUD over records) plus the storage-agnostic migration framework (MigratableResource, registry/store/runner). Use when implementing a custom resource or adding migration support to a database backend."
applyTo: "**/*.ts, **/*.tsx"
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/resource

**Layer:** Core
**Install:** `"@owlmeans/resource": "^0.1.16-rc.0"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `Resource<T>` | Generic contract: get/load/list/save/create/update/delete/pick |
| `MigratableResource<Tx>` | Optional migration capability — `migration(name, apply, stage?)` + `migrations()`. Optional like pub/sub on redis: mongo/postgres extend it, others don't |
| `MigrationRegistry`, `MigrationStore`, `createMigrationRegistry`, `runMigrations`, `MigrationStage` | The framework: per-alias registry (declaration order = application order), the applied-tracking register a db implements, the storage-agnostic runner (`baseline` for fresh structures, strict checksums) |
| Errors | `UnknownRecordError`, `MisshapedRecord`, `RecordExists`, `RecordUpdateFailed`, `UnsupportedArgumentError`, `MigrationError`, `MigrationConflict` |
| `createDbService`, `prepareListOptions`, `DbConfig` | Service base, list helpers, `cfg.dbs` config type |

## Usage

```typescript
import type { Resource } from '@owlmeans/resource'
const projects = ctx.resource<Resource<Project>>('projects')
const { items } = await projects.list({ entityId: 'abc' })
```

## Migration framework rules

- Migrations run **automatically on app setup** inside resource `init()` — apps only register.
- Each migration self-checks: registry skips ledger-recorded names; `baseline: true` records
  instead of running on just-created structures; bodies are written idempotent.
- New backend support: extend the concrete interface with `MigratableResource<YourTx>`; keep
  registrations in a module-scope declaration keyed by alias (context rebuilds must not lose
  them); implement `MigrationStore` over a durable ledger; in `init()` probe → baseline|Pre →
  reconcile structure → Post; make `run` atomic with the ledger where the db allows
  (postgres tx), claim-then-complete where it doesn't (mongo).

## Depends On

- `@owlmeans/context`, `@noble/hashes` (body checksums)
