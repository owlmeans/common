---
name: planning
description: How to use @owlmeans/planning — the runtime-free workcard model (cards, projects, specifications), typed relationships, shareable status flows with three intrinsic states, the Transition event and its pure fold, the schema registry, the query language and its wire encoding, the protocol tree, and the models that work identically on a server and in a browser. Auto-invoked when importing a Workcard type, a status flow, applyHelper, changesHelper, queryHelper, wireHelper, makePlanningProtocols or a planning model.
user-invocable: false
---

# @owlmeans/planning

**Layer:** Cross-cutting domain
**Install:** `"@owlmeans/planning": "^0.1.18-rc.20"` in `dependencies` (`ajv` and `ajv-formats` are peers)

The contracts of project planning: record shapes, schemas, refusals, the protocol tree, the pure
fold and the models. No database, no fastify, no React. The executor, the plugin registry, the
memory store and the handlers are `@owlmeans/server-planning`; the remote facade and the state
mirror are `@owlmeans/client-planning`; a durable store implements the ports declared here.

## The one idea

Every change is a **transition** — an append-only event — and a card IS the fold of its
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
- **Membership is `parent` + `parents`, never a relationship.** `parents` always contains `parent`
  (first), so many-to-many membership needs no junction row. `within` queries `parents`.
- **Specification is a workcard** (`kind: specification`) with `category`, `format`, `body`, `ref`,
  `revision`, `version`, `bodyChars`. The SLOT — category, format, `multiple`, `revisioned`,
  `keepRevisions`, a JSON body `schema` — is declared on the PARENT's type. One record per
  `(parent, category)` unless the slot is `multiple`; a revisioned slot increments `revision` on the
  same record, and earlier bodies come back from the transition log.
- **`createdBy` is written once, from a create's draft, and never moves.** Named in `changes` or
  `unset` it is refused on every action (`planning:immutable:createdBy`), so an ownership check
  (`card.createdBy === profileId`) can trust it. A card that changes hands keeps that in a field of
  its own type (`fields.assignee`); who made each later write is the transition's `actor`.
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

## Declaring a type

A `WorkcardTypeSchema` / `ProjectTypeSchema` is plain data registered through a plugin's `schemas`
or `makeSchemaRegistry({ types, flows })`. **Every declaration schema is closed** — these are ALL
the keys:

| Declaration | Required | Optional |
|---|---|---|
| card / specification type | `type` (its key), `kind`, `version`, `fields`, `flows` (at least one), `specifications` | `intrinsic`, `relationships`, `labels`, `code`, `label`, `overridable` |
| project type | the same, plus `cardTypes` | `projectTypes`, `scopedCardTypes` |
| flow | `id` (its key), `version`, `statuses` (at least one), `transitions` | `label`, `overridable` |
| status | `key`, `intrinsic` | `initial`, `terminal`, `label`, `tone` |
| transition rule | `name`, `from` (status keys or `'*'`), `to` | `label`, `explicit` |

The display name is `label` everywhere; a type or a flow has no `name`, `key` or `description`
(`key` belongs to a status, `name` to a rule). As data, `definitions` refuses an extra key with
`SchemaInvalid`; in code the registry does not validate a declaration, so only TypeScript's
excess-property check catches it — keep the literal typed.

- `fields` — the AJV schema of `fields`; the registry compiles and caches it (`validator(type)`).
- `specifications` — the slots this type's cards carry as children. A slot may name its
  specification `type`; otherwise `specificationHelper.specificationTypeOf` takes the only registered specification
  type, then the one sharing the parent type's prefix (`viable:project` → `viable:spec`).
- `code` — `CodePolicy { prefix?, style: random|sequential|slug, length?, uppercase?, uniqueWithin:
  parent|entity, mutable? }`. A code is fixed once minted unless `mutable`.
- `relationships` — the edge types a card may start (`single` = at most one per card).
- `labels` — the allowed labels (any when omitted).
- A project type lists `cardTypes` (and `projectTypes` for nesting) its children may have;
  `scopedCardTypes: true` also admits card types defined as data (below).
- `overridable: true` on a code type or flow opens it to a data-defined override.

## Data-defined types and flows

Card types and status flows may also be DATA — `ScopedSchemaRecord`s a store keeps behind the
optional `PlanningStore.schemas` port — layered **code → entity → project**:

- `code` is the plugin registry (the default), `entity` an organization-wide record
  (`project` absent), `project` a record of one project card. A project record overrides an
  organization one of the same key.
- **Only card types and flows are data.** A code key is sealed unless its declaration says
  `overridable: true`; project and specification types are always code's (`scopedSchemaHelper.assertOverridable` →
  `SchemaSealed`).
- A record's `version` is its compare-and-set token and is written into the declaration's own
  `version`: a write lands only at its layer's next version, 1 for a new key (`SchemaConflict`).
- The closed-form checks are shared by every store: `scopedSchemaHelper.assertFlowSchema` (the declaration's schema,
  unique status keys, every `to` declared, `from` `'*'` or declared statuses) and
  `scopedSchemaHelper.assertTypeSchema` (the `card` kind, a compiling `fields` schema, unique flows that resolve) —
  `SchemaInvalid`.
- **Retired** means offered for nothing new, still resolved for what uses it: a retired record
  gives way to a live declaration below it, and a key retired in every layer resolves retired —
  present in the bundle's `types`/`flows`, listed in `retired`. A flow cannot be retired while a
  live type of an affected layer still runs it (`scopedSchemaHelper.flowInUse` → `SchemaInUse`).
- `scopedSchemaHelper.resolveScopedBundle(code, records, scope)` is the ONE resolution (pure);
  `scopedRegistryOf` is its read-only registry (`originOf`, `isRetired`; `register*`/`load` refuse). A
  `ScopedSchemaBundle` extends the plain bundle with `scope`, `revision`, `origins`, `retired`, so a
  reader of the plain bundle is unaffected.
- `SchemaStore`: `list(where)`, `put(record)` (the CAS), `purge({ entityId, project })`,
  `revision(entityId)` (monotonic per organization), optional `watch(listener)`.
- `PlanningFacade.definitions` (present only where the store has the port): `bundle(project?)`,
  `registry(project?)`, `records`, `putType`/`putFlow` (CAS on the declaration's version),
  `define` (each at its layer's next version, flows first), `seed` (only the keys the layer lacks),
  `retire(kind, key, { project? })`. The declaration still carries its own `version` (any number
  ≥ 1 for `define`/`seed`, which assign the layer's next one; the exact next one for `put*`), and
  a project layer is `{ project: <project card id> }` in the second argument (a `define` call:
  `server-planning` → Creating and reading a card).

## The fold

`applyHelper.applyTransition(card | undefined, transition)` is pure and total:

- an already-applied seq (`seq <= card.seq`) returns the same card — re-folding is safe;
- anything but `card.seq + 1` (or seq 1 for a create with no card) throws
  `PlanningError('fold:out-of-order')`;
- `create` builds the whole record from `changes` + `id`/`kind`/`type`/`entityId`/`createdAt`/`seq`;
- `update`/`transit` write `changes` — **`fields` and `flows` merge shallowly, every other key
  replaces** — and clear `unset` (`key`, `fields.key`, `flows.id`); identity and required keys are
  never written or cleared;
- `link`/`unlink` move only `seq`/`head`/`updatedAt`; `delete` answers `null`;
- every result carries `seq = transition.seq`, `head = max(head, seq)`, `updatedAt = transition.at`;
- the log is replayed AS WRITTEN: a stored row admission would refuse (an update naming
  `createdBy`) still folds. Guards live at admission (`changesHelper.assertMutable`, the executor), never in the
  fold, so a stored log never stops projecting.

`applyHelper.applyRelationship(links, transition)` folds the edges: a create's `links`, `link`, `unlink`, and a
`delete` dropping every edge touching the card. An existing edge is kept, so re-folding adds nothing.

`changesHelper.computeChanges(card, exec, type, registry, at, { slot? })` is what the executor records:

- create — the whole initial record: normalized `parents`, every flow at its initial status (the
  draft's `status` for the primary), mirrored `status`/`intrinsic`, `closedAt` when it starts
  closed; a specification gets its format, `bodyChars` and revision 1 when the slot is revisioned.
  The code must already be on the draft (the executor mints first);
- update — only differing values; `null` or `exec.unset` clears a field that has one; a moved
  `parent` replaces the old one in `parents`; changed content of a revisioned document sets
  `revision + 1`. An update that changes nothing is `changesHelper.isEmptyChange` and must append nothing;
- transit — `flows[flow] = rule.to`, `status` on the primary flow, `intrinsic` when it moves,
  `closedAt` set on entering closed and cleared on leaving; throws `IllegalTransition`;
- link/unlink/delete — nothing.

`changesHelper.assertMutable(exec, type)` refuses (`planning:immutable:<field>`) identity keys (`createdAt`
among them), `createdBy` in `changes` or `unset` on any action (a create included),
`revision` / `bodyChars`, `status`/`intrinsic`/`flows`/`closedAt` outside a create (they move only
through `transit`), `category`, a fixed `code`, and clearing a required field.

## Querying

`queryHelper.criteriaOf(query, scope)` is the ONE translation from `WorkcardQuery` to `Criteria<Workcard>`:
bare values and arrays pass through (`kind`, `type`, `status`, `intrinsic`, `code`, `category`),
`parent` is direct children, `within` → `parents: { $contains }`, `labels` → `$overlaps`, `ids` →
`id: { $in }`, `flow` → `flows.<id>`, `fields` → `fields.<key>` equality, `q` → `$or` of title /
description `$ilike` (wildcards escaped) and code `$startsWith`, `updatedSince` → `updatedAt: {
$gte }`. `entityId` always comes from the scope; `undefined` is omitted. Paging and sort are
`queryHelper.listOptionsOf` (`size: 0` = no limit). `queryHelper.summaryOf(cards, parents)` counts DIRECT children by
intrinsic state and gives no key to a parent with none. A scope naming `projects` is narrowed by
the SERVER facade on top of this translation (`server-planning` → The access resolver);
`TransitionWhere.project` and `RelationshipWhere.project` take one id or a list.

**A query crosses HTTP in its wire form.** The OwlMeans transport cannot carry arrays or nested
objects in a query string (the client writes `key[]=`, the server reads that key literally), so
the list, summary, transitions, specifications and links protocols take `*QueryWire` shapes: lists
comma-joined (a JSON array when an entry holds a comma), objects as JSON, sort as `field,-field`.
A client calls `wireHelper.encodeWorkcardQuery(query)` before `call({ query })`; a handler calls
`wireHelper.decodeWorkcardQuery(req.query)` — tolerant of arrays and of the rich form — and then
`queryHelper.criteriaOf`. A value that does not decode throws `PlanningError('malformed:query:<key>')`.

## The protocol tree and mounting

`makePlanningProtocols({ base: { alias, path?, parent?, service? }, guards, gate?, socketBase?, definitions? })`:

| Leaf | Route | Request → reply |
|---|---|---|
| `schema.list` | GET `/schemas` | → `PlanningSchemaBundle` |
| `card.list` | GET `/cards` | query `WorkcardQueryWire` → `ListResult<Workcard>` |
| `card.summary` | GET `/cards/summary` | query `SummaryQueryWire` → `SummaryView` |
| `card.get` | GET `/cards/:id` | → `Workcard` |
| `card.transitions` | GET `/cards/:id/transitions` | query `TransitionQueryWire` |
| `card.specifications` | GET `/cards/:id/specifications` | query `SpecificationQueryWire` |
| `spec.get` / `spec.revisions` | GET `/specifications/:id` / `…/revisions` | query `RevisionsQuery` |
| `link.list` | GET `/links` | query `RelationshipQueryWire` |
| `transition.get` | GET `/transitions/:transition` | → `Transition` |
| `execute` | POST `/execute` | body `ExecuteRequest` → `TransitionReceiptView` |
| `commit.get` | GET `/commits/:transition` | query `CommitQuery { wait? }` → `CommitStatus` |
| `commit.events` | SOCKET `/commits` | query `CommitFeedQuery` → `CommitEvent` frames |
| `schema.define` (with `definitions: true`) | POST `/schemas` | body `SchemaDefineRequest { project?, mode?, types?, flows?, retire? }` → `SchemaDefineReply { records, bundle }` |

- Aliases derive from the base alias (`planningAliasHelper.planningAliases(base)` → `<base>:card:list`, …); two mounts
  are two base aliases. `definitions: true` adds `schema.define` (its alias from
  `planningAliasHelper.planningDefinitionAliases(base)`, kept apart so a tree without it names no undeclared alias)
  and gives `schema.list` a `SchemaListQuery { project? }` answered with that layer's scoped bundle.
  Without it the tree declares exactly the other leaves.
- The guards and the gate sit on the base alone; every HTTP leaf inherits them. `path` defaults to
  `/planning`.
- Static `/cards/summary` is declared before parametric `/cards/:id`.
- The commit socket hangs under `socketBase` when given and then inherits THAT base's guards —
  pass an update/socket base that authenticates; otherwise it hangs under the planning base.
- `actor` in an execute body is ignored on the wire: the server fills it from the request.
- Responses carry no runtime schema (typed only), so a serializer never strips `fields`.

## Mounting in a target

A generated target serves this tree as it is — no hand-written card, transition, schema or document
routes; domain rules are `before` plugins. This section is the hub; each package skill has its half.

- **common** declares the one tree the api and the web share: `makePlanningProtocols({ base: {
  alias: 'api:planning' }, guards: DEFAULT_GUARD, definitions: true })`, in its own module beside
  the `PLANNING` plugin (`sources/common/src/planning.ts`).
- **api** — `server-planning` → Mounting in a target (stock handlers, no commit socket, the
  resolver answering `writes`). **web** — `client-planning` → Mounting in a target. **store** —
  `planning-postgres`.
- **Kit literals**: card types and flows are LITERAL objects in `PLANNING.schemas.flows` / `.types`,
  above the `// owlmeans: add planning flows|types above this line` sentinels — a spread or an
  imported constant hides them from the library's registration checks. Card types and flows carry
  `overridable: true` with open `fields` (`additionalProperties: true`); the container project type
  (always sealed) carries `scopedCardTypes: true`, so the app's people override and extend them as
  data through `schema.define`.

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

## Errors

Every refusal is a registered `ResilientError` whose message is `planning:<marker>:<detail>` —
the marker survives a hop where the class is unknown, so match on it there:

| Class | Marker | HTTP |
|---|---|---|
| `PlanningError` | `planning:` (`fold:out-of-order`, `immutable:<field>`, `malformed:<what>`) | 500 |
| `WorkcardNotFound` | `workcard-not-found:` — also the answer for another entity's card | 404 |
| `UnknownWorkcardType` / `UnknownStatusFlow` | `unknown-type:` / `unknown-flow:` | 422 |
| `ParentNotFound` / `CardTypeNotAllowed` | `parent-not-found:` / `card-type-not-allowed:` | 422 |
| `PlanningRefused` | `refused:` — a plugin middleware said no | 422 |
| `IllegalTransition` | `illegal-transition:<flow>:<transition>:<from>` | 409 |
| `FieldsInvalid` / `LabelNotAllowed` | `fields-invalid:` / `label-not-allowed:` | 422 |
| `SpecificationSlotUnknown` / `SpecificationRevisionConflict` | `specification-slot-unknown:` / `specification-revision-conflict:` | 422 / 409 |
| `RelationshipRefused` / `CodeTaken` | `relationship-refused:` / `code-taken:` | 422 / 409 |
| `WorkcardConflict` | `workcard-conflict:` — stale `expectSeq` | 409 |
| `SchemaConflict` / `SchemaInUse` | `schema-conflict:` (lost version CAS) / `schema-in-use:` (retiring a flow a live type runs) | 409 |
| `SchemaSealed` / `SchemaInvalid` | `schema-sealed:` / `schema-invalid:` | 422 |
| `PlanningForbidden` | `forbidden:<grant>:<target>` — the request's access lacks a grant; `forbidden:writes:<id>` — the card or project is outside its `writes` | 403 |
| `CommitTimeout` / `CommitFailed` | `commit-timeout:` (still pending, nothing undone) / `commit-failed:` | 500 |
| `PlanningScopeMismatch` / `PlanningUnsupported` | `scope-mismatch:` / `unsupported:` | 404 / 500 |

Type names are `PlanningError<Suffix>` (`PlanningErrorWorkcardNotFound`).

**The HTTP column is each class's `static httpStatus`** (the `error` skill's principle; 500 = none
declared): an addressed card that is absent or another entity's is 404, a write the request's
access does not grant is 403, a card whose state or head (or a schema record whose version)
refuses the write is 409, a body naming what the registry, the parent or a schema refuses is 422.
Faults declare nothing, and so does `PlanningError` itself — its three causes share one class, and
a base's static would reach every subclass. A new refusal declares on its own leaf class, and
`tests/error-status.spec.ts` refuses an exported refusal whose status was not decided. A plugin's
plain `throw` inside `before` becomes `PlanningRefused` and answers 422, so a plugin FAULT must
throw a `ResilientError` that declares nothing.

## i18n

Importing the package registers, in eight languages (en, pl, ru, be, uk, es, de, fr), `lib:planning.*` labels (`kind.*`,
`intrinsic.*`, `action.*`, `commit.*`, `format.*`) and one text per refusal type under the shared
`errors` resource (`errors.<TypeName>`), where a panel's error lookup finds it.

## Schema rules

A record schema may become a Mongo `$jsonSchema`, so every exported schema keeps two rules: **no
`integer`** (`number` only) and **every optional property `nullable: true`** (an enum then admits
`null` too). No `oneOf`/`anyOf` inside a record schema. Build type arrays per schema, never share
one object between schemas — ajv may extend a `type` array while compiling. The walk that pins this
is part of the package's own tests.

## Depends On

- `@owlmeans/resource` — `Criteria`, `ListOptions`, `ListResult`, `createListSchema`
- `@owlmeans/entrypoint`, `@owlmeans/route` — the protocol tree
- `@owlmeans/error`, `@owlmeans/i18n`, `@owlmeans/auth` (`IdValueSchema`), `@owlmeans/basic-ids`, `@owlmeans/context`

## Related

- [[server-planning]] — the executor, the plugin registry, the memory store, the handlers
- [[client-planning]] — the remote facade, the state mirror, waiting for a commit
- [[resource]] — the criteria language `queryHelper.criteriaOf` targets
- [[planning-postgres]] — a durable store implementing every port, the schema port included
