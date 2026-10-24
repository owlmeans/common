---
name: planning
description: How to use @owlmeans/planning — the runtime-free workcard model (cards, projects, specifications), typed relationships, shareable status flows with three intrinsic states, the Transition event and its pure fold, the schema registry, the query language and its wire encoding, the protocol tree, and the models that work identically on a server and in a browser. Auto-invoked when importing a Workcard type, a status flow, applyHelper, changesHelper, queryHelper, wireHelper, makePlanningProtocols or a planning model.
user-invocable: false
---

# @owlmeans/planning

**Layer:** Cross-cutting domain
**Install:** `"@owlmeans/planning": "^0.1.18-rc.29"` in `dependencies` (`ajv` and `ajv-formats` are peers)

The contracts of project planning: record shapes, schemas, refusals, the protocol tree, the pure
fold and the models. No database, no fastify, no React. The executor, the plugin registry, the
memory store and the handlers are `@owlmeans/server-planning`; the remote facade and the state
mirror are `@owlmeans/client-planning`; a durable store implements the ports declared here.

## The one idea

Every workcard change is a **transition** — an append-only event — and a card IS the fold of its
transitions in `seq` order. There is one write path (`facade.execute(exec)`), one fold
(`applyHelper.applyTransition`) and one query translation (`queryHelper.criteriaOf`), shared by every store and both sides
of the wire, so one log always means one card.

## The write call

`facade.execute(execution, options?)` — the same signature on the server facade
(`@owlmeans/server-planning`, reached as `ctx.service<PlanningHostService>(PLANNING_SERVICE).for({
entityId, profileId })`) and the remote one (`@owlmeans/client-planning`).

- The **execution** has exactly these keys — `TransitionExecutionSchema` is closed, but only the
  wire validates against it; in process an unknown key is silently ignored: `card` — the `WorkcardDraft` of a
  create (`kind`, `type`, `title` required; `parent`/`parents`, `description`, `code`, `labels`,
  `order`, `fields`, `status`, and a specification's `category`/`format`/`body`), the card id
  otherwise — and `action` (`TransitionAction`), then per action `transition`, `flow`, `changes`,
  `unset`, `link` / `links`, and `cause`, `key`, `expectSeq`.
- The **options** are `{ wait?, timeout? }`, always the second argument. Only the wire body
  (`ExecuteRequest`) carries them beside the execution.

The worked example (facade, create, read back, transit, a data-defined type and flow) and the wrong
forms generated code keeps writing are `server-planning` → Creating and reading a card.

## Key exports

| Export | What it is |
|---|---|
| `Workcard`, `Card`, `Project`, `Specification`, `Relationship`, `Transition` | The records |
| `StatusFlowSchema`, `WorkcardTypeSchema`, `ProjectTypeSchema`, `SpecificationSlot`, `CodePolicy`, `RelationshipType`, `PlanningSchemaBundle` | Type declarations — data, not code |
| `TransitionExecution`, `WorkcardDraft`, `TransitionReceipt`, `CommitEvent`, `CommitSource` | The write path and its commit feed |
| `TransitionStore`, `ProjectionStore`, `SpecificationStore`, `RelationshipStore`, `SchemaStore`, `PlanningStore` | Ports a store implements (only `cards` is required) |
| `PlanningPlugin`, `PlanningScope`, `PlanningFacade`, `PlanningService`, `PlanningDefinitions` | The plugin seam and the facade, typed here so a plugin and a client can name them |
| `ScopedSchemaRecord`, `ScopedSchemaWhere`, `ScopedSchemaBundle`, `ScopedSchemaRegistry`, `SchemaDeclarations`, `SchemaWriteOptions`, `SchemaScope`, `SchemaKey`, `SchemaListQuery`, `SchemaDefineRequest`, `SchemaDefineReply` | Data-defined types and flows |
| `WorkcardKind`, `IntrinsicStatus`, `IntrinsicPolicy`, `TransitionAction`, `CommitState`, `SpecificationFormat`, `CodeStyle`, `CodeScope`, `PlanningSchemaKind`, `SchemaOrigin`, `SchemaWriteMode` | Enums |
| `PLANNING_SERVICE` (`'planning'`), `PLANNING_PATH`, `PLANNING_COMMIT_EVENT` (`'planning-commit'`), `planningAliasHelper.planningAliases(base)`, `planningAliasHelper.planningDefinitionAliases(base)` | Names both sides share |
| `TITLE_MAX` 2048, `DESCRIPTION_MAX` 16384, `CODE_MAX` 64, `BODY_MAX` 1048576, `MAX_LABELS` 32, `MAX_PARENTS` 32, `DEFAULT_COMMIT_TIMEOUT` 30 s, `DEFAULT_COMMIT_POLL` 20 s, `MAX_COMMIT_POLL` 55 s, `CODE_MINT_ATTEMPTS` 8 | Limits |
| `applyHelper` — `applyTransition`, `applyRelationship` | The fold |
| `changesHelper` — `computeChanges`, `isEmptyChange`, `assertMutable`, `mergeFields`, `applyUnset`, `sameValue` | What a transition records |
| `statusHelper` — `intrinsicOf`, `initialStatusOf`, `ruleOf`, `canTransit`, `transitionsFrom`, `initialFlowsOf`, `resolveIntrinsic`, `primaryFlowOf`, `isTerminal` | Status helpers |
| `queryHelper` — `criteriaOf`, `listOptionsOf`, `specCriteriaOf`, `linkWhereOf`, `transitionWhereOf`, `summaryOf` | Querying |
| `wireHelper` — `encode*Query` / `decode*Query` (Workcard, Summary, Transition, Specification, Relationship), `encodeSort`, `decodeSort`, `encodeList`, `decodeList` | The wire form of a query |
| `codeHelper` — `mintCode`, `codeScopeOf`, `slugOf` | Codes |
| `specificationHelper` — `slotOf`, `currentSpecification`, `nextRevision`, `specificationTypeOf`, `bodyCharsOf` | Specifications |
| `makeAjv`, `validateHelper` — `validateFields`, `validateCard`, `validateSpecificationBody`, `invalidFieldKeys`, `ajvErrorText` | Validation |
| `makeSchemaRegistry(bundle?)` | Types, flows, cached field validators; `bundle()` / `load()` |
| `scopedSchemaHelper` — `resolveScopedBundle`, `scopedRegistryOf`, `assertTypeSchema`, `assertFlowSchema`, `assertOverridable`, `flowInUse`, `schemaRecordKey`, `schemaKeyOf` | Data-defined layers: resolution, the read-only view, the closed-form checks |
| `makePlanningProtocols(opts)` | The protocol tree |
| `makeWorkcardModel`, `makeProjectModel`, `makeSpecificationModel`, `modelOf`, `executeFor` | Models |
| `*Schema` | AJV schemas of every record, declaration, request and view |

## The record model

- **Base fields at the top level, provider fields under `fields`.** `title`, `description`, `code`,
  `status`, `labels`, `order`, `parent` are generic and indexable; everything a type adds lives in
  `fields` and is validated by the type's `fields` JSON schema. Generic code reads only the top.
  A `fields` key never holds `.` or `$` at any depth (`validateHelper.invalidFieldKeys`).
- **`entityId` is the organization's stable record id** — never the wire `entitySlug`, never a body
  value. Every read is scoped by it; where a request's comes from is `server-planning` → Scope and
  security.
- **Card containment is `parent` + `parents`.** `parents` always contains `parent` (first), so
  multiple direct parents need no junction row. `within` queries those direct parents. Team
  membership and project-team assignment use canonical typed relationships instead.
- **Specification is a workcard** (`kind: specification`) with `category`, `format`, `body`, `ref`,
  `revision`, `version`, `bodyChars`. The SLOT — category, format, `multiple`, `revisioned`,
  `keepRevisions`, a JSON body `schema` — is declared on the PARENT's type. One record per
  `(parent, category)` unless the slot is `multiple`; a revisioned slot increments `revision` on the
  same record, and earlier bodies come back from the transition log.
- **`createdBy` is written once, from a create's draft, and never moves.** Named in `changes` or
  `unset` it is refused on every action (`planning:immutable:createdBy`), so an ownership check
  (`card.createdBy === profileId`) can trust it. Responsibility uses the optional top-level
  `assignee` planning ID; additional participant fields belong in the type's `fields` schema.
  The optional `reporter` also references an assignee ID. Who made each later write is the
  transition's `actor`.
- **`seq` is the last folded transition, `head` the highest allocated.** `head > seq` means a write
  is in flight (`cardHelper.isPending`); optimistic concurrency (`expectSeq`) compares against the
  head.
- `order` is a double: a card may sit between two others (`3.5`).
- Timestamps are ISO-8601 UTC strings (`toISOString()`), so lexicographic order is chronological.

## Status flows

- Every status maps onto one of three intrinsic states: `planned`, `in-progress`, `closed`.
  Summaries, gates and boards read the intrinsic state; the status key is the provider's vocabulary.
- A flow is shareable across types, and a type may run several (`flows[0]` is primary).
  `flows` on the record is authoritative for every flow; `status`/`intrinsic` mirror the primary.
- A rule name may repeat with different `from` sets (`start` from `planned`, `start` from
  `failed`). `statusHelper.ruleOf` picks the rule naming the current status; a `'*'` rule of that name answers
  only when none does, wherever it is declared. `'*'` includes the target status itself, so
  `reset` from `planned` is legal. A status the flow does NOT declare (a card whose flow changed
  under it) matches every rule of the name, the first declared answering — such a card can always
  move back onto the flow it now runs.
- `statusHelper.transitionsFrom(flow, status)` answers one rule per name in declaration order;
  `{ explicit: true }` keeps the ones offered to a person.
- `IntrinsicPolicy.Primary` (default) reads the primary flow; `IntrinsicPolicy.All` takes the least
  advanced flow — closed only when every flow is closed. A status a flow does not declare reads as
  planned.

## Models

`makeWorkcardModel(record, facade)` (and `makeProjectModel`, `makeSpecificationModel`, `modelOf`
by kind) is the same object on a server and in a browser. `schema`, `flow`, `statusOf`,
`intrinsicOf`, `can`, `available`, `pending` answer from the registry with no I/O; `transit`,
`update`, `remove`, `link`, `unlink`, `write` build a `TransitionExecution` and call
`facade.execute`.

- `expectSeq` defaults to `record.head ?? record.seq`; pass `null` to opt out, a number to pin.
  A stale model therefore refuses with `WorkcardConflict` — `reload()` and retry.
- `write(category, body)` creates the slot's document when the slot is empty and updates it when
  filled (expecting the DOCUMENT's head, not the parent's). The model never computes a revision;
  the executor does.
- `ProjectModel` adds `cards`, `projects` (by `within`), `summary` (zero counts when empty) and
  `purge` (a delete of the project — the store removes everything under it).
- `SpecificationModel` adds `body`, `revise`, `history` (from the log).

## Depends On

- `@owlmeans/resource` — `Criteria`, `ListOptions`, `ListResult`, `createListSchema`
- `@owlmeans/entrypoint`, `@owlmeans/route` — the protocol tree
- `@owlmeans/error`, `@owlmeans/i18n`, `@owlmeans/auth` (`IdValueSchema`), `@owlmeans/basic-ids`, `@owlmeans/context`

## Related

- [[server-planning]] — the executor, the plugin registry, the memory store, the handlers
- [[client-planning]] — the remote facade, the state mirror, waiting for a commit
- [[resource]] — the criteria language `queryHelper.criteriaOf` targets
- [[planning-postgres]] — a durable store implementing every port, the schema port included

## Parts

Load a part on top of this core when its job is in play.

| Part | Load it when |
|---|---|
| [types](parts/types.md) | Declaring a type or a status flow, data-defined types and flows (`scopedSchemaHelper`), or a new record schema |
| [fold](parts/fold.md) | Folding transitions (`applyHelper`, `changesHelper`) or translating a `WorkcardQuery` (`queryHelper`, `wireHelper`) |
| [mounting](parts/mounting.md) | Declaring or mounting the protocol tree (`makePlanningProtocols`), or serving it in a generated target |
| [errors](parts/errors.md) | Throwing, matching or phrasing a planning refusal (marker, HTTP status, i18n text) |
| [collaboration](parts/collaboration.md) | Assignees, reporters, comments and mentions, teams, card hierarchy, the `resources` branches or `PlanningReply` |
