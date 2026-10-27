---
name: migrations
description: The migration framework — automatic on init — and the five steps of adding migration support to a new database backend.
metadata:
  purposes: migration
  mentions: MigratableResource, MigrationStore, createMigrationRegistry, runMigrations, MigrationStage, mongoDeclarationHelper, pgDeclarationHelper, _owlmeans_migrations
---

# @owlmeans/resource — Migrations

## The migration framework

Migrations are **automatic on app setup**: a backend runs them inside the resource's
`init()` — registering one is all an app ever does. Every migration self-describes when it
applies: the registry skips names the store has recorded, `baseline` covers structures
created already at head, and bodies are written idempotent so an interrupted run can repeat.

Adding migration support to a new database backend:

1. Extend the concrete resource interface with `MigratableResource<YourTx>` and design the
   `Tx` façade a migration receives.
2. Keep registrations in a **module-scope declaration keyed by alias** — the shape mongo and
   postgres both expose as `mongoDeclarationHelper` / `pgDeclarationHelper` with
   `.getDeclaration(alias)` / `.resetDeclarations(alias?)`. A maker that runs more than once for the
   same alias (a custom maker, a test) then re-declares the same entries and loses nothing, where a
   registry held on the resource object would silently lose data transformations.
3. Implement `MigrationStore` over a durable ledger when the database can store one
   (`_owlmeans_migrations` in both mongo and postgres); a store-less backend may run
   migrations unconditionally if its bodies are self-checking.
4. In the resource's `init()`: probe structure → absent: `runMigrations(..., { baseline: true })`;
   present: run `Pre` → reconcile structure → run `Post`.
5. Make `run` atomic with the ledger write where the database allows it (postgres: same
   transaction). Where it doesn't (mongo: no multi-doc transactions on standalone), use
   claim-then-complete on a unique `(alias, name)` key and require idempotent bodies.
