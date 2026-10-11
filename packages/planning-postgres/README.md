# @owlmeans/planning-postgres

A durable Postgres `PlanningStore` for `@owlmeans/server-planning`: projects, cards and
specifications in one table, the append-only transition log, typed links, data-defined card and
assignee types and flows, and separate assignee, team, comment and mention tables — eight tables
compiled from the planning record schemas by `@owlmeans/postgres-resource`. Card writes fold
inline under card and organization advisory locks; auxiliary resources and derived references
join the organization transaction. Commits reach other processes over LISTEN/NOTIFY. Use it for a backend that keeps
its planning data in Postgres; a Mongo deployment uses its own store, and tests and single-process
tools the in-memory store of `@owlmeans/server-planning`.

## Installation

```sh
bun add @owlmeans/planning-postgres@^0.1.18-rc.15
```

Peers: `pg`, `ajv`, `ajv-formats`.

## Concepts

- **Eight resources** — cards, transitions, typed links, schemas, assignees, teams, comments and
  mentions. All makers must be registered; `appendPostgresPlanning` registers all eight.
  Timestamps stay `text`, so ISO-8601 order is row order.
- **Inline fold** — `project()` folds at once, inside one transaction under
  `pg_advisory_xact_lock`; the settled events are delivered to waiters and `after` hooks only
  after it commits.
- **A gap is not a failure** — `nextSeq` and `append` are two round trips, so a fold waits for a
  young gap and fills an old one with a failed `lost-allocation` placeholder.
- **Every waiter heals** — a status read of a pending row older than `healAfterMs` folds its card
  in the background; `recover()` folds what nobody is folding.
- **Data-defined types and flows** — card types, assignee types and flows use the schema port, so the planning facade
  exposes `definitions`.

| Resource | Data |
|---|---|
| `planning-card` | Projects, cards and specifications |
| `planning-transition` | Append-only card transitions |
| `planning-link` | Typed card references, team membership and project teams |
| `planning-schema` | Scoped card/flow definitions and organization assignee types |
| `planning-assignee` | Schema-validated participants and external identity metadata |
| `planning-team` | Reusable organization teams and external group ids |
| `planning-comment` | Card comments with immutable trusted authors |
| `planning-mention` | Derived stable assignee mentions and source revisions |

## Usage

```ts
import { appendPostgres } from '@owlmeans/postgres'
import { TransitionAction, WorkcardKind } from '@owlmeans/planning'
import { appendPostgresPlanning } from '@owlmeans/planning-postgres'

appendPostgres(context)
appendPostgresPlanning(context, { plugins: [libraryPlugin] })   // eight resources + the service

const planning = context.planning().for({ entityId, profileId })
const receipt = await planning.execute({
  action: TransitionAction.Create,
  card: { kind: WorkcardKind.Project, type: 'library:branch', title: 'Riverside branch' },
}, { wait: true })                     // the options are the SECOND argument
const branch = await planning.cards.get(receipt.card!.id!)
```

A generated target registers each piece from its own file instead — `resources/planning/card.ts`
exporting `makeResource = makePlanningCardPostgres` (and `transition.ts`, `link.ts`, `schema.ts`),
plus `assignee.ts`, `team.ts`, `comment.ts` and `mention.ts` exporting their corresponding makers,
and `services/planning.ts` exporting `makeService = () => makePostgresPlanningService({ plugins })`.
That registers a plain service, so `context.planning()` does not exist there; reach it by alias:

```ts
import { PLANNING_SERVICE } from '@owlmeans/planning'
import type { PlanningHostService } from '@owlmeans/server-planning'

const planning = ctx.service<PlanningHostService>(PLANNING_SERVICE).for({ entityId, profileId })
```

## API

`makePlanningCardPostgres`, `makePlanningTransitionPostgres`, `makePlanningLinkPostgres`,
`makePlanningSchemaPostgres` (and `make*Resource(alias, dbAlias?, serviceAlias?)`,
`makePlanningPostgresResources`); `makePostgresPlanningStore`, `makePostgresPlanningService`,
`appendPostgresPlanning`; `PostgresPlanningStore` (`fold`, `recover`, `close`);
`DEFAULT_PLANNING_POSTGRES_LIMITS`, `RES_PLANNING_*`, `PLANNING_POSTGRES_STORE`;
`PlanningPostgresError`; the table schemas `Planning*TableSchema`; the statement helpers
`sqlHelper` and, bound to one `SqlContext` (a runner and the tables), `cardSqlOf(sql)`,
`linkSqlOf(sql)`, `transitionSqlOf(sql)`, `schemaSqlOf(sql)`. The former plain statement functions
(`insertOf`, `readCard`, `listTransitions`, …) remain as deprecated delegates.

Auxiliary makers: `makePlanningAssigneePostgres`, `makePlanningTeamPostgres`,
`makePlanningCommentPostgres`, `makePlanningMentionPostgres`, their `make*Resource` variants,
resource types and `RES_PLANNING_ASSIGNEE`, `RES_PLANNING_TEAM`, `RES_PLANNING_COMMENT`,
`RES_PLANNING_MENTION`. Native resource ports are available through the scoped planning facade.

## Consistency and deletion

Resource versions and scoped schema versions compare-and-set in SQL. Native unique indexes
protect normalized nicknames, provider/subject identities, optional team external ids and
comment/assignee mention pairs within an organization entity. Relationship uniqueness includes
endpoint resource kinds; legacy omitted kinds mean workcards.

Organization units use an advisory transaction lock shared by card folds and schema writes.
Auxiliary ports join the current runner, so validation, field-backed references, comment content
and derived mentions commit together. Commit delivery and `after` hooks run after the transaction
and its locks are released.

Card deletion removes its comments and mention cache. Project purge follows current ancestry,
including nested projects and project-local schemas, and preserves organization assignees and
reusable teams. A reparented survivor keeps its complete history, documents and edges even when
their cached project id names the deleted project. Deletion does not rely on stale cache ownership.

## Common pitfalls

- All eight resources must be registered — the first call names the missing file.
- `close()` the store when a process ends on its own: the LISTEN connection keeps it alive.
- Do not aim `commits.subscribe` at hooks: `after` hooks run where the fold ran, once.
- A create's draft goes under `card` (`draft` is refused as `planning:malformed:create-without-draft`),
  and `wait` goes in the second argument — inside the execution it is ignored.
- A type or flow declaration has no `name` or `key`: the display name is `label`, the key is
  `type` (a type) or `id` (a flow); `definitions.define` refuses anything else with `SchemaInvalid`.

## Related packages

`@owlmeans/planning`, `@owlmeans/server-planning`, `@owlmeans/client-planning`,
`@owlmeans/postgres-resource`, `@owlmeans/postgres`.

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.53
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
