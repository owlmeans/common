---
name: planning-postgres
description: How to use @owlmeans/planning-postgres — the durable Postgres PlanningStore for @owlmeans/server-planning — its eight native resources, organization transactions and card folds, versioned auxiliary writes, schema definitions, LISTEN/NOTIFY, recovery and ancestry-based purge. Use when wiring planning into a Postgres backend or diagnosing its persistence and commits.
user-invocable: false
---

# @owlmeans/planning-postgres

**Layer:** Infra extension
**Install:** `"@owlmeans/planning-postgres": "^0.1.18-rc.15"` in `dependencies` (peers `pg`, `ajv`, `ajv-formats`)

A `PlanningStore` of `@owlmeans/server-planning` on Postgres. It owns no planning semantics: every
write still goes through the executor, every fold through `foldHelper.foldPending`, every query
through `queryHelper.criteriaOf` — this package supplies eight tables, the transaction a fold runs
in, and the bus that carries commits between processes. It implements every port, the
data-defined schema port included, so a facade over it has `definitions`.

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

## The eight tables

| Resource | Holds | Indexes |
|---|---|---|
| `planning-card` | projects, cards AND specifications (routed by `kind` at the query layer) | `(entityId, kind, type)`, `(parent, order)`, GIN `(parents)`, `(parent, status)`, `(entityId, intrinsic, updatedAt)`, GIN `(labels)`, `(entityId, parent, code) WHERE code IS NOT NULL`, `(parent, category) WHERE kind = 'specification'` |
| `planning-transition` | the append-only log | UNIQUE `(card, seq)`, UNIQUE `(entityId, key) WHERE key IS NOT NULL`, `(project, at)`, `(at) WHERE (commit->>'state') = 'pending'` |
| `planning-link` | typed edges | UNIQUE `(entityId, from, to, type, COALESCE(fromKind, 'workcard'), COALESCE(toKind, 'workcard'))`, `(to, type)`, `(entityId, type)`, `(project)` |
| `planning-schema` | data-defined card/assignee types and flows, plus each organization's private `kind: 'head'` revision row | UNIQUE `("entityId", COALESCE(project, ''), kind, key)`, `(entityId, rev)` |
| `planning-assignee` | schema-validated participants and external authentication links | UNIQUE `(entityId, nicknameKey)`, UNIQUE organization/provider/subject when authenticated, `(entityId, type, retired)` |
| `planning-team` | reusable teams and external group links | UNIQUE `(entityId, externalId) WHERE externalId IS NOT NULL`, `(entityId)` |
| `planning-comment` | card comments with immutable trusted authors | `(entityId, card, createdAt)`, `(entityId, author)` |
| `planning-mention` | derived stable assignee mentions with source revisions | UNIQUE `(entityId, comment, assignee)`, `(entityId, assignee)`, `(entityId, card)` |

- The DDL comes from `AnyWorkcardSchema`, `TransitionSchema`, `RelationshipSchema` and
  `ScopedSchemaRecordSchema` and the four auxiliary record schemas. **Every timestamp stays `text`**: the `date-time` format would compile
  to `timestamptz` and marshal through `Date`, which rewrites the ISO string a record carries and
  breaks the lexicographic order `updatedSince`, `at` sorts and gap ages rely on. `seq`, `head`,
  `revision` and `bodyChars` (and a schema record's `version` and `rev`) are `integer`; `body` is
  `text`.
- The card table carries one private column, `headAt` — when `head` last moved — that no read
  ever returns.
- A card list includes specifications only when it asks for `kind: 'specification'` or names a
  `category` (`wantsSpecifications`, the rule every store routes by); a summary never counts them.
- Every maker declares each index once, however often it runs.

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

This service is the store under a target's stock planning API (`planning` → Mounting in a target).
Its `planning-schema` table is what lets the app's people override and extend the kit's
`overridable` card types and flows through `schema.define` — never drop it from a target that
mounts the tree.

## A worked example

The api binds the tree the shared package declares (an api's own `entrypoints.ts`, outside the
wiring above); a hand-written backend may register everything in one call instead —
`appendPostgres(context); appendPostgresPlanning(context, { plugins: [PLANNING] })`.

```ts
// common: a lending library's branches (projects) and books (cards)
export const PLANNING: PlanningPlugin = {
  name: 'app-planning',
  schemas: {
    flows: [{
      id: 'library:circulation', version: 1,
      statuses: [
        { key: 'shelved', intrinsic: IntrinsicStatus.Planned, initial: true },
        { key: 'lent', intrinsic: IntrinsicStatus.InProgress },
        { key: 'retired', intrinsic: IntrinsicStatus.Closed },
      ],
      transitions: [
        { name: 'lend', from: ['shelved'], to: 'lent', explicit: true },
        { name: 'return', from: ['lent'], to: 'shelved', explicit: true },
      ],
    }],
    types: [
      { type: 'library:branch', kind: WorkcardKind.Project, version: 1, fields: { type: 'object' },
        flows: ['library:circulation'], specifications: [], cardTypes: ['library:book'], scopedCardTypes: true },
      { type: 'library:book', kind: WorkcardKind.Card, version: 1, fields: { type: 'object' },
        flows: ['library:circulation'], specifications: [] },
    ],
  },
}
export const planningProtocols = makePlanningProtocols({
  base: { alias: 'library:planning', path: '/planning' }, guards: DEFAULT_GUARD, definitions: true,
})

// api: the protocol bindings
...servePlanningEntrypoints(planningProtocols)
```

Writing and reading from backend code is `server-planning` → Creating and reading a card (the
call, the read back, `define`, and the wrong forms). A target registers the service as a plain
service (`services/planning.ts` above), so there is NO `ctx.planning()`: reach it as
`ctx.service<PlanningHostService>(PLANNING_SERVICE).for({ entityId, profileId })`, with `entityId`
taken in the HANDLER (`server-planning` → Scope and security) and passed down. This store keeps
schemas, so `definitions` is always present.

The first store call into a missing resource throws
`PlanningPostgresError('resource-missing:planning-schema: add src/resources/planning/schema.ts')`,
naming the file to add.

## The fold

`project()` folds inline — there is no queued mode. One fold is ONE transaction:

1. `SET LOCAL lock_timeout` (`limits.lockTimeoutMs`), then `pg_advisory_xact_lock` on
   `pgNameHelper.advisoryKey('planning:<qualified card table>:<card id>')`.
2. **The prelude** walks the rows past `card.seq` (at most `foldBatch`): a FAILED row at the cursor
   moves the cursor past it; the PENDING rows from the cursor on are the run the fold takes; a GAP
   — a row past the expected seq, or `head > seq` with no row at all — is an append still in
   flight while younger than `gapGraceMs` (the fold stops; the appender's own `project()` folds
   it), and a lost allocation after that: a failed `lost-allocation` placeholder per missing seq.
   `nextSeq` and `append` are two round trips, so without it a transient gap or an already-failed
   row would turn the next write into a spurious `fold:out-of-order`.
3. `foldHelper.foldPending` of `@owlmeans/server-planning` over a view of the ports bound to the transaction,
   limited to that run, each transition's writes in a SAVEPOINT (`FoldOptions.unit`) — so a write
   the database refuses fails that transition alone and the fold goes past it. Prelude and fold
   repeat within the transaction until the log is folded or a young gap stops it.
4. A `pg_notify` per settled event (no record).
5. COMMIT — and only then the events reach the commit hub and the `after` hooks, in order, outside
   the transaction and the lock. A hook may therefore write to the card it saw commit.

A statement that fails outside a savepoint **poisons** the transaction: it is never committed
(the "transaction is aborted" answers after it are not the cause — the first failure is). The
fold is retried once; failing again, `foldHelper.failPending` fails the card's pending transitions
in a fresh transaction, so no waiter hangs to its timeout. A lock that cannot be taken within
`lockTimeoutMs` means another process is folding the card: nothing is failed, a heal follows.

Allocation: `nextSeq` is a compare-and-set of `head` on the card row, stamping `headAt`; a card
whose create has not folded counts `max(seq) + 1` from the log and the unique `(card, seq)` index
refuses a repeat. A card write never lowers `head` (`GREATEST`) and never touches `headAt`; a write
after the create is an UPDATE of a row that must still exist, so a card purged with its project is
not resurrected by a fold that was already under way.

## Healing and recovery

- **Every waiter heals**: a status read of a pending row older than `healAfterMs` starts a
  background fold of its card (try-lock, deduplicated per card).
- `recover({ olderThanMs = recoverAfterMs, limit = 100 })` folds each card whose oldest pending
  row is older than the threshold (the partial pending index), and runs once in the background on
  the store's first use.
- A lost allocation with no later row is released by the next fold of the card.

## The commit bus

`makeCommitHub` is the commit source; LISTEN/NOTIFY feeds it across processes. The channel is
`planning_<16 hex>` of the qualified transition table, so two schemas in one database never hear
each other. The frame is `{ p: <process id>, t: 'c', e: <CommitEvent without record> }`; a process
ignores its own (`p`) — it delivered it itself, after its commit. LISTEN holds one dedicated
`pg.Client` built from the pool's own configuration (no pool slot), opened on the first subscribe,
wait or schema watch, reconnecting 1 s → 30 s; meanwhile the hub's poll ladder answers every
waiter. A schema write sends `{ t: 's', e: <entityId> }` on the same channel. `bus: false` sends
and hears nothing — waits poll, layers re-read the revision.

## Data-defined types and flows

`planning-schema` holds one record per `(organization, project layer, kind, key)`; a write is one
transaction that bumps the organization's `head` row, writes under the compare-and-set on `version`
(an INSERT for version 1, an UPDATE guarded on `version - 1` after) and NOTIFYs. `revision()` is a
primary read of the head row, so the service's cached layers are never served stale. The rules —
what may be defined, sealing, retiring — are `planning`'s and `server-planning`'s.

## Purge

A project's delete purges in the fold's own transaction. Current card ancestry selects doomed
cards and nested projects; their comments, mentions, documents, links, transitions, project-local
schema layers and projections are removed. Organization assignees and reusable teams survive.
The project's own delete transition stays as its tombstone, so a waiter still reads it committed.

A reparented survivor retains its complete history, documents and edges even when their cached
project id names its former project. Cached project values may select orphaned records, but must
never delete surviving records.

## Querying

Lists, counts and summaries go through `@owlmeans/postgres-resource` (`pgCriteriaHelper.criteriaToSql`),
so a `WorkcardQuery` selects here what it selects in memory: `within` is `parents @> $1::varchar[]`,
`labels` `&&`, `flows.<id>` / `fields.<key>` typed jsonb paths (a list is membership), `q` `ILIKE` +
code prefix. A summary is one `countBy(parent, intrinsic)`. Paging is Postgres's — 100 rows unless
`size` says otherwise.

## Gotchas

- `close()` the store in a process that should end on its own — the LISTEN connection keeps it
  alive.
- Two fold transactions of one card never run at once in a process (chained) or across processes
  (the advisory lock); a heal that finds the lock taken yields.
- A row appended by hand (`store.transitions.append`) is folded only by `project()`, a heal or
  `recover()` — nothing watches the table.

## Testing

`bun test ./tests` — `schema.spec.ts`, `sql.spec.ts` and `created-by.spec.ts` (the statements
around the `createdBy` column ownership checks read) need no database; `conformance.spec.ts`
(the `@owlmeans/server-planning/conformance` cases, read from that package's BUILT output — a new
case runs here only after `server-planning` is rebuilt), `fold.spec.ts`, `bus.spec.ts` and
`sync.spec.ts` are gated on `POSTGRES_URL` (`gateHelper.postgresGate()`) and skip cleanly without
it. Each spec file owns a throwaway schema (`makeSuite`); a fault is injected with a real trigger,
never a mock.

## Native auxiliary resources and transactional consistency

Register stock `makePlanningAssigneeResource`, `makePlanningTeamResource`,
`makePlanningCommentResource` and `makePlanningMentionResource` alongside card, transition, link
and schema resources, or use `appendPostgresPlanning` to register all eight. The default makers
are `makePlanningAssigneePostgres`, `makePlanningTeamPostgres`, `makePlanningCommentPostgres` and
`makePlanningMentionPostgres`. Use one maker per application resource wrapper so discovery sees
each alias. Aux timestamps stay text and versions are native CAS integers.

Assignee nickname and provider/subject, team externalId, and comment/assignee mention pairs have
organization-scoped native unique indexes. Edges include resource kinds; legacy null kinds mean
workcards. All organization units acquire a transaction advisory lock, shared by card folds and
schema writes. Native ports join the current transaction runner. Domain validation, card projection,
field-authoritative links, comment content and derived mention maintenance commit together.
Schema versions and resource versions are compared in SQL, not only before writing.

Deleting a card removes its comments and mention cache. Project purge includes descendants and
project-scoped schema rows, and preserves organization assignees and teams. The shared resource
conformance suite executes against real PostgreSQL, including concurrent CAS and hierarchy checks.


## Related

- `server-planning` — the executor, `foldHelper.foldPending`/`failPending`, the commit hub, the conformance suite
- `planning` — records, flows, scoped schemas, the query language
- `postgres-resource` — the table compiler, `pgCriteriaHelper.criteriaToSql`, `countBy`, `pgNameHelper.advisoryKey`
- `postgres` — the connection service these resources resolve through
- `marketing-consent-postgres` — the same resource-per-file wiring for another feature
