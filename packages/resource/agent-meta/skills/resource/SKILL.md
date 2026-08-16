---
name: resource
description: How to use @owlmeans/resource — generic resource abstraction (CRUD over records) plus the storage-agnostic migration framework (MigratableResource, migration registry/store/runner) used by mongo-resource, postgres-resource, redis-resource, state, storage-resource, etc. Auto-invoked when importing from this package, implementing a custom resource type, or adding migration support to a database backend.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/resource

**Layer:** Core
**Install:** `"@owlmeans/resource": "^0.1.18-rc.0"` in `dependencies`

## Key Exports

| Export | Description |
|--------|-------------|
| `Resource<T>` | Generic resource contract: `get`/`load`/`list`/`save`/`create`/`update`/`delete`/`pick`. |
| `MigratableResource<Tx>` | **Optional migration capability** — `migration(name, apply, stage?)` (chainable) + `migrations()`. Optional the way pub/sub is on redis resources: mongo and postgres extend it, backends with nothing to migrate don't. |
| `Migration`, `MigrationRegistry`, `MigrationStore`, `MigrationReport`, `MigrationRunOptions` | The framework's contracts. `MigrationStore` is the *migration register* a database implements to track applied migrations (`ensure`/`applied`/`baseline`/`run`). |
| `createMigrationRegistry<Tx>()` | Storage-agnostic ledger of code-registered migrations per alias. Declaration order = application order; re-registering an identical body is a no-op, a changed body under a used name throws `MigrationConflict`. |
| `runMigrations(alias, registry, store, opts?)` | Apply one stage's pending migrations through a store. `baseline: true` records instead of running (fresh structures); `strictChecksum` (default on) rejects edited applied bodies. |
| `MigrationStage` | `Pre` (before structure reconciliation — renames, casts, rescues) / `Post` (after — backfills into new structure). |
| `createDbService` | Base for `ResourceDbService` implementations (config/alias/name/client plumbing). |
| `prepareListOptions`, `filterObject`, `createListSchema` | List/criteria helpers. |
| Errors | `ResourceError`, `UnknownRecordError`, `MisshapedRecord`, `RecordExists`, `RecordUpdateFailed`, `UnsupportedArgumentError`, `UnsupportedMethodError`, `MigrationError`, `MigrationConflict`. |
| `DbConfig`, `Config`, `Context` | Database config (`cfg.dbs`) types. |

## Usage

A resource is a typed CRUD-over-records abstraction. Concrete implementations come from
`@owlmeans/mongo-resource`, `@owlmeans/postgres-resource`, `@owlmeans/redis-resource`,
`@owlmeans/state`, etc. Consumers register with the context and access via
`ctx.resource<T>(alias)`.

```typescript
import type { Resource } from '@owlmeans/resource'

interface Project { id: string; name: string; entityId: string }
const projects = ctx.resource<Resource<Project>>('projects')
const { items } = await projects.list({ entityId: 'abc' })
```

## The migration framework

Migrations are **automatic on app setup**: a backend runs them inside the resource's
`init()` — registering one is all an app ever does. Every migration self-describes when it
applies: the registry skips names the store has recorded, `baseline` covers structures
created already at head, and bodies are written idempotent so an interrupted run can repeat.

Adding migration support to a new database backend:

1. Extend the concrete resource interface with `MigratableResource<YourTx>` and design the
   `Tx` façade a migration receives.
2. Keep registrations in a **module-scope declaration keyed by alias** (see either
   implementation's `declarations.ts`) — `reinitializeContext` rebuilds resource objects, and
   a registry lost to a rebuild silently loses data transformations.
3. Implement `MigrationStore` over a durable ledger when the database can store one
   (`_owlmeans_migrations` in both mongo and postgres); a store-less backend may run
   migrations unconditionally if its bodies are self-checking.
4. In the resource's `init()`: probe structure → absent: `runMigrations(..., { baseline: true })`;
   present: run `Pre` → reconcile structure → run `Post`.
5. Make `run` atomic with the ledger write where the database allows it (postgres: same
   transaction). Where it doesn't (mongo: no multi-doc transactions on standalone), use
   claim-then-complete on a unique `(alias, name)` key and require idempotent bodies.

## Depends On

- `@owlmeans/context` — service/resource lifecycle
- `@noble/hashes` — migration body checksums

## Related

- [[mongo-resource]] · [[postgres-resource]] — the two `MigratableResource` implementations
- [[redis-resource]] — a non-migratable backend (pub/sub capability instead)
