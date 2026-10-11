# @owlmeans/planning

Runtime-free contracts for project planning: workcards (cards, projects, specifications), typed
relationships, assignees, teams, comments and mention caches, shareable status flows over three
intrinsic states, the transition event and its pure fold, the schema registry, the protocol tree and the models that behave identically on a
server and in a browser. An application depends on it from its shared contract package; it wires
the executor with `@owlmeans/server-planning` and reads remotely with `@owlmeans/client-planning`.

## Installation

```sh
bun add @owlmeans/planning@^0.1.18-rc.26 ajv ajv-formats
```

## Concepts

- **Transition** — the only way a workcard changes: an append-only event; a card is the fold of its
  transitions in `seq` order (`applyHelper.applyTransition`).
- **Workcard** — base fields at the top level (`title`, `status`, `parent`, `parents`, `labels`,
  `order`); a type's own fields under `fields`, validated by the type's schema.
- **Status flow** — shareable data declaring statuses (each mapped to `planned`, `in-progress` or
  `closed`) and named transitions; a type may run several flows.
- **Specification** — a document workcard held in a slot the parent type declares; a revisioned
  slot revises one record in place.
- **Wire query** — the scalar form a query travels in over HTTP (`wireHelper.encode*Query` /
  `wireHelper.decode*Query`).
- **Auxiliary resources** — assignees, teams, comments and mentions are separate organization
  resources with `version` compare-and-set. They reuse the schema and relationship stores.

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
  resources: true,
  definitions: true,
})
```

Encode a query on the client, decode it in a handler:

```ts
import { queryHelper, wireHelper } from '@owlmeans/planning'

const query = wireHelper.encodeWorkcardQuery({ parent: projectId, status: ['todo', 'doing'], sort: ['order'] })
const page = await context.entrypoint(planningProtocols.card.list).call({ query })

// server side
const where = queryHelper.criteriaOf(wireHelper.decodeWorkcardQuery(req.query), { entityId })
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
import { applyHelper } from '@owlmeans/planning'

const card = transitions.reduce((current, transition) => applyHelper.applyTransition(current, transition), undefined)
const links = transitions.reduce(applyHelper.applyRelationship, [])
```

## Participants, comments and hierarchy

An assignee has a stable id, an organization-unique normalized nickname, `kind: 'human' |
'non-human'`, a registered `type` and schema-validated `fields`. All links use the id.
`authentication: { provider, externalId }` may refer to any authentication system. Human types
require it by default; a type may explicitly declare `authentication: 'optional'`. Non-human
types default to optional authentication. Register `schemas.assigneeTypes` in a plugin, or use
`definitions.putAssigneeType` / `definitions.define({ assigneeTypes })` for organization-wide data
definitions. The optional `@owlmeans/planning-auth` adapter links verified identities and groups.

Cards have optional top-level single-choice `reporter` and `assignee` ids. Additional participant
fields use a type's `relationships` declaration with `field`, `toKind: PlanningResourceKind.Assignee`
and optional `to` type restrictions, `multiple` and `inverse`. The fields are authoritative;
planning maintains their derived relationship index. Assignee retirement preserves historical
attribution and prevents new assignments or memberships.

Use `facade.comments.create({ card, body })`; the host resolves the author from trusted
`PlanningScope.assigneeId`. `mentionHelper.encode(assigneeId, nickname)` embeds a stable mention
as `[@nickname](assignee:<encoded-id>)`. The separate `mentions` resource caches each mentioned
id and source comment revision. Comment updates maintain it; reads repair interrupted updates.

Teams exist independently of projects. `teams.addMember(teamId, assigneeId)` and
`teams.attach(teamId, projectId)` use canonical typed relationships. Multiple teams may attach to
one project, and a team may attach to multiple projects. `teams.assignees(projectId)` returns the
deduplicated union. An optional team `externalId` links an external permission group; access grants
and authentication membership remain the host's responsibility. Project `mode` is `opened` or
`closed`, defaults to `opened`, and is independent of flow status.

Hierarchy reuses `parent` and direct `parents`; `parentType` is derived from the primary parent.
Declare compatible `parents: { types?, required? }` and `children: { types }` on card schemas.
Planning rejects cycles, cross-organization parents, incompatible reparenting and ordinary-card
deletion with children. The nearest primary project selects schemas; project ancestry governs
access. Do not create another hierarchy or participant join store.

Enable `resources: true` to mount the assignee/team/comment/mention protocol branches and
`definitions: true` for writable schemas. Stock wire replies omit native organization `entityId`
metadata; the authenticated host derives scope from credentials and the organization `entitySlug`.
Custom fields and schema bodies remain opaque to wire projection.

## API

- Records and declarations: `Workcard`, `Card`, `Project`, `Specification`, `Relationship`,
  `Transition`, `StatusFlowSchema`, `WorkcardTypeSchema`, `ProjectTypeSchema`, `SpecificationSlot`,
  `CodePolicy`, `RelationshipType`, `PlanningSchemaBundle`.
- Resources: `Assignee`, `AssigneeAuthentication`, `AssigneeTypeSchema`, `Team`, `Comment`,
  `CommentMention`, `PlanningResourceFacade`, `PlanningRecordStore`, `PlanningWriteOptions`,
  resource drafts and queries; `AssigneeKind`, `ProjectMode`, `PlanningResourceKind`,
  `PLANNING_TEAM_MEMBER`, `PLANNING_PROJECT_TEAM`, `mentionHelper`, `planningReplyHelper`.
- Write path and feed: `TransitionExecution`, `WorkcardDraft`, `ExecuteRequest`,
  `TransitionReceipt`, `TransitionReceiptView`, `CommitEvent`, `CommitStatus`, `CommitSource`.
- Ports and seam: `TransitionStore`, `ProjectionStore`, `SpecificationStore`, `RelationshipStore`,
  `SchemaStore`, `PlanningStore`, `PlanningPlugin`, `PlanningScope`, `PlanningFacade`,
  `PlanningService`, `PlanningDefinitions`.
- Data-defined types and flows: `ScopedSchemaRecord`, `ScopedSchemaWhere`, `ScopedSchemaBundle`,
  `ScopedSchemaRegistry`, `SchemaDeclarations`, `SchemaWriteOptions`, `SchemaDefineRequest`,
  `SchemaDefineReply`, and `scopedSchemaHelper` (`resolveScopedBundle`, `scopedRegistryOf`,
  `assertTypeSchema`, `assertFlowSchema`, `assertOverridable`, `flowInUse`, `schemaRecordKey`,
  `schemaKeyOf`).
- Enums and constants: `WorkcardKind`, `IntrinsicStatus`, `IntrinsicPolicy`, `TransitionAction`,
  `CommitState`, `SpecificationFormat`, `CodeStyle`, `CodeScope`, `PlanningSchemaKind`,
  `SchemaOrigin`, `SchemaWriteMode`, `PLANNING_SERVICE`, `PLANNING_PATH`, `PLANNING_COMMIT_EVENT`,
  limits (`TITLE_MAX`, …); `planningAliasHelper` (`planningAliases`, `planningDefinitionAliases`).
- Helpers — each a ready object (`xxxHelper`) built by its `createXxxHelper()`, its interface
  exported beside it:
  - `applyHelper` — the fold: `applyTransition`, `applyRelationship`.
  - `changesHelper` — `computeChanges`, `isEmptyChange`, `assertMutable`, `mergeFields`,
    `applyUnset`, `sameValue`.
  - `cardHelper` — `isProject`, `isCard`, `isSpecification`, `normalizeParents`, `cardDefaults`,
    `isPending`, `parentOf`, `projectOf`.
  - `statusHelper` — `intrinsicOf`, `initialStatusOf`, `ruleOf`, `canTransit`, `transitionsFrom`,
    `initialFlowsOf`, `resolveIntrinsic`, `primaryFlowOf`, `flowIdsOf`, `statusDefinitionOf`,
    `isTerminal`.
  - `queryHelper` — `criteriaOf`, `listOptionsOf`, `specCriteriaOf`, `linkWhereOf`,
    `transitionWhereOf`, `summaryOf`.
  - `wireHelper` — `encode/decodeWorkcardQuery`, `encode/decodeSummaryQuery`,
    `encode/decodeTransitionQuery`, `encode/decodeSpecificationQuery`,
    `encode/decodeRelationshipQuery`, `encode/decodeList`, `encode/decodeSort`.
  - `codeHelper` — `mintCode`, `codeScopeOf`, `slugOf`.
  - `specificationHelper` — `slotOf`, `currentSpecification`, `nextRevision`, `isRevisioned`,
    `bodyCharsOf`, `specificationTypeOf`.
  - `validateHelper` — `validateFields`, `validateCard`, `validateSpecificationBody`,
    `invalidFieldKeys`, `ajvErrorText`; and `makeAjv`.
- The former plain functions (`applyTransition`, `criteriaOf`, `encodeWorkcardQuery`, …) remain as
  deprecated delegates to these helpers.
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
- Card types, flows and assignee types are data-defined, and a code key needs `overridable: true` to be
  overridden; a data-defined declaration's `version` is its compare-and-set token.
- Auxiliary updates/removals require the record's current `version`. Their `fields` replace the
  previous fields object; card `changes.fields` merge.

## Related packages

- `@owlmeans/server-planning` — executor, plugin registry, memory store, handlers
- `@owlmeans/client-planning` — remote facade, state mirror, commit waiting
- `@owlmeans/resource` — the criteria language
- `@owlmeans/planning-postgres` — the durable Postgres store
- `@owlmeans/planning-auth` — optional verified identity and group mapping

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
