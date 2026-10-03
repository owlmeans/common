# @owlmeans/planning

Runtime-free contracts for project planning: workcards (cards, projects, specifications), typed
relationships, shareable status flows over three intrinsic states, the transition event and its
pure fold, the schema registry, the protocol tree and the models that behave identically on a
server and in a browser. An application depends on it from its shared contract package; it wires
the executor with `@owlmeans/server-planning` and reads remotely with `@owlmeans/client-planning`.

## Installation

```sh
bun add @owlmeans/planning@^0.1.18-rc.15 ajv ajv-formats
```

## Concepts

- **Transition** — the only way a record changes: an append-only event; a card is the fold of its
  transitions in `seq` order (`applyTransition`).
- **Workcard** — base fields at the top level (`title`, `status`, `parent`, `parents`, `labels`,
  `order`); a type's own fields under `fields`, validated by the type's schema.
- **Status flow** — shareable data declaring statuses (each mapped to `planned`, `in-progress` or
  `closed`) and named transitions; a type may run several flows.
- **Specification** — a document workcard held in a slot the parent type declares; a revisioned
  slot revises one record in place.
- **Wire query** — the scalar form a query travels in over HTTP (`encode*Query` / `decode*Query`).

## Usage

Declare a flow and a type, and register them:

```ts
import { CodeScope, CodeStyle, IntrinsicStatus, WorkcardKind, makeSchemaRegistry } from '@owlmeans/planning'

const taskFlow = {
  id: 'app:task', version: 1,
  statuses: [
    { key: 'todo', intrinsic: IntrinsicStatus.Planned, initial: true },
    { key: 'doing', intrinsic: IntrinsicStatus.InProgress },
    { key: 'done', intrinsic: IntrinsicStatus.Closed, terminal: true },
  ],
  transitions: [
    { name: 'start', from: ['todo'], to: 'doing', explicit: true },
    { name: 'finish', from: ['doing'], to: 'done', explicit: true },
    { name: 'reset', from: '*' as const, to: 'todo' },
  ],
}

const registry = makeSchemaRegistry({
  flows: [taskFlow],
  types: [{
    type: 'app:task', kind: WorkcardKind.Card, version: 1, flows: ['app:task'], specifications: [],
    fields: { type: 'object', properties: { estimate: { type: 'number' } }, additionalProperties: false },
    code: { prefix: 'T-', style: CodeStyle.Random, length: 5, uppercase: true, uniqueWithin: CodeScope.Parent },
  }],
})
```

Declare the protocol tree once in the shared package:

```ts
import { makePlanningProtocols } from '@owlmeans/planning'

export const planningProtocols = makePlanningProtocols({
  base: { alias: 'app:api:planning', path: '/planning' },
  guards: 'guard:default',
})
```

Encode a query on the client, decode it in a handler:

```ts
import { criteriaOf, decodeWorkcardQuery, encodeWorkcardQuery } from '@owlmeans/planning'

const query = encodeWorkcardQuery({ parent: projectId, status: ['todo', 'doing'], sort: ['order'] })
const page = await context.entrypoint(planningProtocols.card.list).call({ query })

// server side
const where = criteriaOf(decodeWorkcardQuery(req.query), { entityId })
```

Create a card and read it back through a facade — in process the one of `@owlmeans/server-planning`
(`ctx.service<PlanningHostService>(PLANNING_SERVICE).for({ entityId, profileId })`), remotely the one
of `@owlmeans/client-planning`:

```ts
import { TransitionAction, WorkcardKind } from '@owlmeans/planning'

const drill = await planning.execute({
  action: TransitionAction.Create,
  card: { kind: WorkcardKind.Card, type: 'shed:tool', parent: shedId, title: 'Cordless drill' },
}, { wait: true })                     // the options are the SECOND argument
const again = await planning.cards.get(drill.card!.id!)
```

Work through a model — the same code on either side of the wire:

```ts
import { makeWorkcardModel } from '@owlmeans/planning'

const task = makeWorkcardModel(card, facade)
if (task.can('start')) {
  const receipt = await task.transit('start', undefined, { wait: true })
}
await task.update({ title: 'Renamed' }) // expectSeq defaults to the record's head
```

Fold transitions yourself (a mirror, a test, a store):

```ts
import { applyRelationship, applyTransition } from '@owlmeans/planning'

const card = transitions.reduce((current, transition) => applyTransition(current, transition), undefined)
const links = transitions.reduce(applyRelationship, [])
```

## API

- Records and declarations: `Workcard`, `Card`, `Project`, `Specification`, `Relationship`,
  `Transition`, `StatusFlowSchema`, `WorkcardTypeSchema`, `ProjectTypeSchema`, `SpecificationSlot`,
  `CodePolicy`, `RelationshipType`, `PlanningSchemaBundle`.
- Write path and feed: `TransitionExecution`, `WorkcardDraft`, `ExecuteRequest`,
  `TransitionReceipt`, `TransitionReceiptView`, `CommitEvent`, `CommitStatus`, `CommitSource`.
- Ports and seam: `TransitionStore`, `ProjectionStore`, `SpecificationStore`, `RelationshipStore`,
  `SchemaStore`, `PlanningStore`, `PlanningPlugin`, `PlanningScope`, `PlanningFacade`,
  `PlanningService`, `PlanningDefinitions`.
- Data-defined types and flows: `ScopedSchemaRecord`, `ScopedSchemaWhere`, `ScopedSchemaBundle`,
  `ScopedSchemaRegistry`, `SchemaDeclarations`, `SchemaWriteOptions`, `SchemaDefineRequest`,
  `SchemaDefineReply`, `resolveScopedBundle`, `scopedRegistryOf`, `assertTypeSchema`,
  `assertFlowSchema`, `assertOverridable`, `flowInUse`.
- Enums and constants: `WorkcardKind`, `IntrinsicStatus`, `IntrinsicPolicy`, `TransitionAction`,
  `CommitState`, `SpecificationFormat`, `CodeStyle`, `CodeScope`, `PlanningSchemaKind`,
  `SchemaOrigin`, `SchemaWriteMode`, `PLANNING_SERVICE`, `PLANNING_PATH`, `PLANNING_COMMIT_EVENT`,
  `planningAliases`, `planningDefinitionAliases`, limits (`TITLE_MAX`, …).
- Fold and changes: `applyTransition`, `applyRelationship`, `computeChanges`, `isEmptyChange`,
  `assertMutable`, `mergeFields`, `applyUnset`.
- Status: `intrinsicOf`, `initialStatusOf`, `ruleOf`, `canTransit`, `transitionsFrom`,
  `initialFlowsOf`, `resolveIntrinsic`, `primaryFlowOf`, `isTerminal`.
- Query: `criteriaOf`, `listOptionsOf`, `specCriteriaOf`, `linkWhereOf`, `transitionWhereOf`,
  `summaryOf`, `encode/decodeWorkcardQuery`, `encode/decodeSummaryQuery`,
  `encode/decodeTransitionQuery`, `encode/decodeSpecificationQuery`,
  `encode/decodeRelationshipQuery`.
- Codes, specifications, validation: `mintCode`, `codeScopeOf`, `slotOf`, `currentSpecification`,
  `nextRevision`, `specificationTypeOf`, `makeAjv`, `validateFields`, `validateCard`,
  `validateSpecificationBody`.
- Registry, protocols, models: `makeSchemaRegistry`, `makePlanningProtocols`, `makeWorkcardModel`,
  `makeProjectModel`, `makeSpecificationModel`, `modelOf`.
- Errors: `PlanningError`, `WorkcardNotFound`, `UnknownWorkcardType`, `UnknownStatusFlow`,
  `ParentNotFound`, `CardTypeNotAllowed`, `PlanningRefused`, `IllegalTransition`, `FieldsInvalid`,
  `LabelNotAllowed`, `SpecificationSlotUnknown`, `SpecificationRevisionConflict`,
  `RelationshipRefused`, `CodeTaken`, `WorkcardConflict`, `CommitTimeout`, `CommitFailed`,
  `PlanningScopeMismatch`, `SchemaConflict`, `SchemaInUse`, `SchemaSealed`, `SchemaInvalid`,
  `PlanningForbidden`, `PlanningUnsupported`.
- Schemas: `WorkcardSchema`, `SpecificationSchema`, `TransitionSchema`, `ExecuteRequestSchema`,
  `WorkcardQuerySchema`, … (every record, declaration, request and view).

## Common pitfalls

- A create's draft goes under `card` (never `draft`), and `{ wait, timeout }` is the second argument
  of `execute` — inside the execution an in-process facade ignores it.
- A type or flow declaration has no `name` or `key`: the display name is `label`, the key is `type`
  (a type) or `id` (a flow); a status has `key`, a transition rule `name`. The declaration schemas
  are closed — `definitions.define` refuses an extra key with `SchemaInvalid`.
- Pass a query through `encode*Query` before an HTTP call — arrays and objects do not survive a
  query string as they are.
- `status`, `intrinsic` and `flows` move only through `transit`; an `update` naming them is refused.
- `createdBy` is written once, by a create's draft: `changes` or `unset` naming it is refused on
  every action (`planning:immutable:createdBy`), so an ownership check can trust it.
- `fields` and `flows` in `changes` merge; every other key replaces. Clear with `null` or `unset`.
- A model's `expectSeq` is its record's head: a stale model refuses with `WorkcardConflict`.
- `WorkcardNotFound` is also the answer for another entity's card — never read it as "deleted".
- `CommitTimeout` leaves the transition pending; it will still commit.
- Keep schemas `$jsonSchema`-safe: no `integer`, every optional property nullable.
- Only card types and flows are data-defined, and a code key needs `overridable: true` to be
  overridden; a data-defined declaration's `version` is its compare-and-set token.

## Related packages

- `@owlmeans/server-planning` — executor, plugin registry, memory store, handlers
- `@owlmeans/client-planning` — remote facade, state mirror, commit waiting
- `@owlmeans/resource` — the criteria language
- `@owlmeans/planning-postgres` — the durable Postgres store

<!-- owlmeans:agent-guidance:start -->
## Agent guidance

This package ships embedded agent skills under `agent-meta/`. After installing your
`@owlmeans/*` packages, run the OwlMeans agent-skills installer to place them into
your project's skill store (`.agents/skills/`):

```sh
npx @owlmeans/agent-skills@^0.1.18-rc.46
```

The embedded files are version-matched to this package release. Do not edit them
directly — they are regenerated on each publish. To contribute guidance edits,
open a PR against the source monorepo.
<!-- owlmeans:agent-guidance:end -->
