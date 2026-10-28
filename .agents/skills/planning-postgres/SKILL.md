---
name: planning-postgres
description: How to use @owlmeans/planning-postgres — the durable Postgres PlanningStore for @owlmeans/server-planning — its eight native resources, organization transactions and card folds, versioned auxiliary writes, schema definitions, LISTEN/NOTIFY, recovery and ancestry-based purge. Use when wiring planning into a Postgres backend or diagnosing its persistence and commits.
user-invocable: false
---

# @owlmeans/planning-postgres

**Layer:** Infra extension
**Install:** `"@owlmeans/planning-postgres": "^0.1.18"` in `dependencies` (peers `pg`, `ajv`, `ajv-formats`)

A `PlanningStore` of `@owlmeans/server-planning` on Postgres. It owns no planning semantics: every
write still goes through the executor, every fold through `foldHelper.foldPending`, every query
through `queryHelper.criteriaOf` — this package supplies eight tables, the transaction a fold runs
in, and the bus that carries commits between processes. It implements every port, the
data-defined schema port included, so a facade over it has `definitions`. Its service options are
`server-planning`'s (`plugins`, `schemas`, `hooks`), so an application's own type/flow properties
and base card fields (`schemas.app`, `planning` → types part) need nothing here: they ride in the
`definition` and `fields` jsonb.

## Key Exports

| Export | Description |
|--------|-------------|
| `makePlanningCardPostgres` / `makePlanningTransitionPostgres` / `makePlanningLinkPostgres` / `makePlanningSchemaPostgres` | Makers of card, transition, link and schema resources |
| `makePlanningAssigneePostgres` / `makePlanningTeamPostgres` / `makePlanningCommentPostgres` / `makePlanningMentionPostgres` | Makers of the four versioned auxiliary resources |
| `makePlanningCardResource(alias?, dbAlias?, serviceAlias?)` (and the seven twins), `makePlanningPostgresResources(aliases)` | The same resources under custom aliases |
| `makePostgresPlanningService(opts?, alias?)` | The planning host service over a Postgres store — a target's `makeService()` |
| `appendPostgresPlanning(ctx, opts?, alias?)` | The eight resources (each unless present), the service and `ctx.planning()` in one call |
| `makePostgresPlanningStore({ context: () => ctx, ...opts })` | The store alone (its resources resolved on that context at the first call); `fold(card)`, `recover(opts?)`, `close()` beside the ports |
| `PlanningPostgresOptions` | `{ aliases?, bus?, limits?, ids?, now? }`; `PostgresPlanningServiceOptions` adds the service's own (`plugins`, `schemas`, `hooks`) |
| `DEFAULT_PLANNING_POSTGRES_LIMITS` | `{ foldBatch: 500, gapGraceMs: 30_000, healAfterMs: 1_000, recoverAfterMs: 60_000, lockTimeoutMs: 10_000 }` |
| `RES_PLANNING_CARD` · `RES_PLANNING_TRANSITION` · `RES_PLANNING_LINK` · `RES_PLANNING_SCHEMA` | Core resource aliases |
| `RES_PLANNING_ASSIGNEE` · `RES_PLANNING_TEAM` · `RES_PLANNING_COMMENT` · `RES_PLANNING_MENTION`, `PLANNING_POSTGRES_STORE` | Auxiliary aliases and `planning-postgres` store alias |
| `Planning*TableSchema` | The table schemas, derived from the planning record schemas |
| `PlanningPostgresError` | `planning-postgres:<what>` — a fault (500) |
| `planningChannel(qualified)`, `LOST_ALLOCATION` | The bus channel of a transition table; the cause of a gap's placeholder |

## Target wiring

**Backs:** projects, cards and documents, their transition log and typed relationships, data-defined card and assignee types and flows, and separate assignee, team, comment and mention resources

| Sub-project | Packages |
|---|---|
| backend | `@owlmeans/planning-postgres`, `@owlmeans/server-planning`, `@owlmeans/planning` |
| common | `@owlmeans/planning` |
| api | `@owlmeans/server-planning`, `@owlmeans/planning` |

The service resolves its eight resources by alias, so the registration order never matters. All
eight are required: the store keeps data-defined types and flows too, and a write reads their
layer.

```ts file=sources/backend/src/services/planning.ts
import { makePostgresPlanningService } from '@owlmeans/planning-postgres'
import type { Service } from '@owlmeans/context'
import { PLANNING } from '__APP_SLUG__-common/planning'

/**
 * The planning service over Postgres — resolves its eight resources
 * (`resources/planning/{card,transition,link,schema,assignee,team,comment,mention}.ts`) by alias, so registration order never
 * matters. The maker name is fixed — the generated service registry imports exactly this symbol.
 */
export const makeService = (): Service => makePostgresPlanningService({ plugins: [PLANNING] })
```

```ts file=sources/backend/src/resources/planning/card.ts
import { makePlanningCardPostgres } from '@owlmeans/planning-postgres'
import type { PlanningCardRecord, PlanningCardResource } from '@owlmeans/planning-postgres'
import type { ResourceMaker } from '@owlmeans/resource'

/**
 * Projects, cards and their documents — one table (`planning-card`), routed by `kind` at the
 * query layer. The maker is a thin wrapper: the schema and indexes are the package's own.
 */
export const makeResource: ResourceMaker<PlanningCardRecord, PlanningCardResource> =
  (dbAlias, serviceAlias) => makePlanningCardPostgres(dbAlias, serviceAlias)
```

```ts file=sources/backend/src/resources/planning/transition.ts
import { makePlanningTransitionPostgres } from '@owlmeans/planning-postgres'
import type { PlanningTransitionResource } from '@owlmeans/planning-postgres'
import type { Transition } from '@owlmeans/planning'
import type { ResourceMaker } from '@owlmeans/resource'

/** The append-only transition log (`planning-transition`) every card is folded from. */
export const makeResource: ResourceMaker<Transition, PlanningTransitionResource> =
  (dbAlias, serviceAlias) => makePlanningTransitionPostgres(dbAlias, serviceAlias)
```

```ts file=sources/backend/src/resources/planning/link.ts
import { makePlanningLinkPostgres } from '@owlmeans/planning-postgres'
import type { PlanningLinkResource } from '@owlmeans/planning-postgres'
import type { Relationship } from '@owlmeans/planning'
import type { ResourceMaker } from '@owlmeans/resource'

/** Typed links between cards (`planning-link`) — one row per from, to and type. */
export const makeResource: ResourceMaker<Relationship, PlanningLinkResource> =
  (dbAlias, serviceAlias) => makePlanningLinkPostgres(dbAlias, serviceAlias)
```

```ts file=sources/backend/src/resources/planning/schema.ts
import { makePlanningSchemaPostgres } from '@owlmeans/planning-postgres'
import type { PlanningSchemaResource, PlanningSchemaRow } from '@owlmeans/planning-postgres'
import type { ResourceMaker } from '@owlmeans/resource'

/** Card types and flows defined as data (`planning-schema`), per organization and per project. */
export const makeResource: ResourceMaker<PlanningSchemaRow, PlanningSchemaResource> =
  (dbAlias, serviceAlias) => makePlanningSchemaPostgres(dbAlias, serviceAlias)
```

```ts file=sources/common/src/planning.ts
import type { PlanningPlugin } from '@owlmeans/planning'

/**
 * This application's planning types and flows — see the `planning` skill for their shape. The
 * backend's planning service registers it; a client that reads a model loads the same bundle from
 * the server, so nothing else imports it.
 */
export const PLANNING: PlanningPlugin = {
  name: 'app-planning',
  schemas: {
    flows: [
      // owlmeans: add planning flows above this line
    ],
    types: [
      // owlmeans: add planning types above this line
    ],
  },
}
```

## Mounting in a target

This service is the store under a target's stock planning API (`planning` → Mounting in a target,
its `mounting` part).
Its `planning-schema` table is what lets the app's people override and extend the kit's
`overridable` card types and flows through `schema.define` — never drop it from a target that
mounts the tree.

## Gotchas

- `close()` the store in a process that should end on its own — the LISTEN connection keeps it
  alive.
- Two fold transactions of one card never run at once in a process (chained) or across processes
  (the advisory lock); a heal that finds the lock taken yields.
- A row appended by hand (`store.transitions.append`) is folded only by `project()`, a heal or
  `recover()` — nothing watches the table.

## Related

- `server-planning` — the executor, `foldHelper.foldPending`/`failPending`, the commit hub, the conformance suite
- `planning` — records, flows, scoped schemas, the query language
- `postgres-resource` — the table compiler, `pgCriteriaHelper.criteriaToSql`, `countBy`, `pgNameHelper.advisoryKey`
- `postgres` — the connection service these resources resolve through
- `marketing-consent-postgres` — the same resource-per-file wiring for another feature

## Parts

| Part | Load it when |
|---|---|
| [tables](parts/tables.md) | reading or changing the table shapes and indexes, or a query that selects differently than in memory |
| [example](parts/example.md) | declaring an application's planning types and flows over this store, or wiring a hand-written backend |
| [consistency](parts/consistency.md) | diagnosing a stuck, failed or lost commit, a purge, or concurrent writes |
| [testing](parts/testing.md) | running or adding tests of this store |
