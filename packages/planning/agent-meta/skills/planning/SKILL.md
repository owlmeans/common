---
name: planning
description: How to use @owlmeans/planning — the runtime-free workcard model (cards, projects, specifications), typed relationships, shareable status flows with three intrinsic states, the Transition event and its pure fold, the schema registry, the query language and its wire encoding, the protocol tree, and the models that work identically on a server and in a browser. Auto-invoked when importing a Workcard type, a status flow, applyTransition, computeChanges, criteriaOf, encodeWorkcardQuery, makePlanningProtocols or a planning model.
user-invocable: false
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/planning

**Layer:** Cross-cutting domain
**Install:** `"@owlmeans/planning": "^0.1.18-rc.8"` in `dependencies` (`ajv` and `ajv-formats` are peers)

The contracts of project planning: record shapes, schemas, refusals, the protocol tree, the pure
fold and the models. No database, no fastify, no React. The executor, the plugin registry, the
memory store and the handlers are `@owlmeans/server-planning`; the remote facade and the state
mirror are `@owlmeans/client-planning`; a durable store implements the ports declared here.

## The one idea

Every change is a **transition** — an append-only event — and a card IS the fold of its
transitions in `seq` order. There is one write path (`facade.execute(exec)`), one fold
(`applyTransition`) and one query translation (`criteriaOf`), shared by every store and both sides
of the wire, so one log always means one card.

## Key exports

| Export | What it is |
|---|---|
| `Workcard`, `Card`, `Project`, `Specification`, `Relationship`, `Transition` | The records |
| `StatusFlowSchema`, `WorkcardTypeSchema`, `ProjectTypeSchema`, `SpecificationSlot`, `CodePolicy`, `RelationshipType`, `PlanningSchemaBundle` | Type declarations — data, not code |
| `TransitionExecution`, `WorkcardDraft`, `TransitionReceipt`, `CommitEvent`, `CommitSource` | The write path and its commit feed |
| `TransitionStore`, `ProjectionStore`, `SpecificationStore`, `RelationshipStore`, `PlanningStore` | Ports a store implements (only `cards` is required) |
| `PlanningPlugin`, `PlanningScope`, `PlanningFacade`, `PlanningService` | The plugin seam and the facade, typed here so a plugin and a client can name them |
| `WorkcardKind`, `IntrinsicStatus`, `IntrinsicPolicy`, `TransitionAction`, `CommitState`, `SpecificationFormat`, `CodeStyle`, `CodeScope` | Enums |
| `PLANNING_SERVICE` (`'planning'`), `PLANNING_PATH`, `PLANNING_COMMIT_EVENT` (`'planning-commit'`), `planningAliases(base)` | Names both sides share |
| `TITLE_MAX` 2048, `DESCRIPTION_MAX` 16384, `CODE_MAX` 64, `BODY_MAX` 1048576, `MAX_LABELS` 32, `MAX_PARENTS` 32, `DEFAULT_COMMIT_TIMEOUT` 30 s, `DEFAULT_COMMIT_POLL` 20 s, `MAX_COMMIT_POLL` 55 s, `CODE_MINT_ATTEMPTS` 8 | Limits |
| `applyTransition`, `applyRelationship` | The fold |
| `computeChanges`, `isEmptyChange`, `assertMutable`, `mergeFields`, `applyUnset`, `sameValue` | What a transition records |
| `intrinsicOf`, `initialStatusOf`, `ruleOf`, `canTransit`, `transitionsFrom`, `initialFlowsOf`, `resolveIntrinsic`, `primaryFlowOf`, `isTerminal` | Status helpers |
| `criteriaOf`, `listOptionsOf`, `specCriteriaOf`, `linkWhereOf`, `transitionWhereOf`, `summaryOf` | Querying |
| `encode*Query` / `decode*Query` (Workcard, Summary, Transition, Specification, Relationship), `encodeSort`, `decodeSort`, `encodeList`, `decodeList` | The wire form of a query |
| `mintCode`, `codeScopeOf`, `slugOf` | Codes |
| `slotOf`, `currentSpecification`, `nextRevision`, `specificationTypeOf`, `bodyCharsOf` | Specifications |
| `makeAjv`, `validateFields`, `validateCard`, `validateSpecificationBody`, `invalidFieldKeys`, `ajvErrorText` | Validation |
| `makeSchemaRegistry(bundle?)` | Types, flows, cached field validators; `bundle()` / `load()` |
| `makePlanningProtocols(opts)` | The protocol tree |
| `makeWorkcardModel`, `makeProjectModel`, `makeSpecificationModel`, `modelOf`, `executeFor` | Models |
| `*Schema` | AJV schemas of every record, declaration, request and view |

## The record model

- **Base fields at the top level, provider fields under `fields`.** `title`, `description`, `code`,
  `status`, `labels`, `order`, `parent` are generic and indexable; everything a type adds lives in
  `fields` and is validated by the type's `fields` JSON schema. Generic code reads only the top.
  A `fields` key never holds `.` or `$` at any depth (`invalidFieldKeys`).
- **`entityId` is the organization's stable id**, never a slug. Every read is scoped by it.
- **Membership is `parent` + `parents`, never a relationship.** `parents` always contains `parent`
  (first), so many-to-many membership needs no junction row. `within` queries `parents`.
- **Specification is a workcard** (`kind: specification`) with `category`, `format`, `body`, `ref`,
  `revision`, `version`, `bodyChars`. The SLOT — category, format, `multiple`, `revisioned`,
  `keepRevisions`, a JSON body `schema` — is declared on the PARENT's type. One record per
  `(parent, category)` unless the slot is `multiple`; a revisioned slot increments `revision` on the
  same record, and earlier bodies come back from the transition log.
- **`seq` is the last folded transition, `head` the highest allocated.** `head > seq` means a write
  is in flight (`isPending`); optimistic concurrency (`expectSeq`) compares against the head.
- `order` is a double: a card may sit between two others (`3.5`).
- Timestamps are ISO-8601 UTC strings (`toISOString()`), so lexicographic order is chronological.

## Status flows

- Every status maps onto one of three intrinsic states: `planned`, `in-progress`, `closed`.
  Summaries, gates and boards read the intrinsic state; the status key is the provider's vocabulary.
- A flow is shareable across types, and a type may run several (`flows[0]` is primary).
  `flows` on the record is authoritative for every flow; `status`/`intrinsic` mirror the primary.
- A rule name may repeat with different `from` sets (`start` from `planned`, `start` from
  `failed`). `ruleOf` picks the rule naming the current status; a `'*'` rule of that name answers
  only when none does, wherever it is declared. `'*'` includes the target status itself, so
  `reset` from `planned` is legal.
- `transitionsFrom(flow, status)` answers one rule per name in declaration order;
  `{ explicit: true }` keeps the ones offered to a person.
- `IntrinsicPolicy.Primary` (default) reads the primary flow; `IntrinsicPolicy.All` takes the least
  advanced flow — closed only when every flow is closed. A status a flow does not declare reads as
  planned.

## Declaring a type

A `WorkcardTypeSchema` / `ProjectTypeSchema` is plain data registered through a plugin's `schemas`
or `makeSchemaRegistry({ types, flows })`:

- `fields` — the AJV schema of `fields`; the registry compiles and caches it (`validator(type)`).
- `specifications` — the slots this type's cards carry as children. A slot may name its
  specification `type`; otherwise `specificationTypeOf` takes the only registered specification
  type, then the one sharing the parent type's prefix (`viable:project` → `viable:spec`).
- `code` — `CodePolicy { prefix?, style: random|sequential|slug, length?, uppercase?, uniqueWithin:
  parent|entity, mutable? }`. A code is fixed once minted unless `mutable`.
- `relationships` — the edge types a card may start (`single` = at most one per card).
- `labels` — the allowed labels (any when omitted).
- A project type lists `cardTypes` (and `projectTypes` for nesting) its children may have.

## The fold

`applyTransition(card | undefined, transition)` is pure and total:

- an already-applied seq (`seq <= card.seq`) returns the same card — re-folding is safe;
- anything but `card.seq + 1` (or seq 1 for a create with no card) throws
  `PlanningError('fold:out-of-order')`;
- `create` builds the whole record from `changes` + `id`/`kind`/`type`/`entityId`/`createdAt`/`seq`;
- `update`/`transit` write `changes` — **`fields` and `flows` merge shallowly, every other key
  replaces** — and clear `unset` (`key`, `fields.key`, `flows.id`); identity and required keys are
  never written or cleared;
- `link`/`unlink` move only `seq`/`head`/`updatedAt`; `delete` answers `null`;
- every result carries `seq = transition.seq`, `head = max(head, seq)`, `updatedAt = transition.at`.

`applyRelationship(links, transition)` folds the edges: a create's `links`, `link`, `unlink`, and a
`delete` dropping every edge touching the card. An existing edge is kept, so re-folding adds nothing.

`computeChanges(card, exec, type, registry, at, { slot? })` is what the executor records:

- create — the whole initial record: normalized `parents`, every flow at its initial status (the
  draft's `status` for the primary), mirrored `status`/`intrinsic`, `closedAt` when it starts
  closed; a specification gets its format, `bodyChars` and revision 1 when the slot is revisioned.
  The code must already be on the draft (the executor mints first);
- update — only differing values; `null` or `exec.unset` clears a field that has one; a moved
  `parent` replaces the old one in `parents`; changed content of a revisioned document sets
  `revision + 1`. An update that changes nothing is `isEmptyChange` and must append nothing;
- transit — `flows[flow] = rule.to`, `status` on the primary flow, `intrinsic` when it moves,
  `closedAt` set on entering closed and cleared on leaving; throws `IllegalTransition`;
- link/unlink/delete — nothing.

`assertMutable(exec, type)` refuses (`planning:immutable:<field>`) identity keys, `revision` /
`bodyChars`, `status`/`intrinsic`/`flows`/`closedAt` outside a create (they move only through
`transit`), `category`, a fixed `code`, and clearing a required field.

## Querying

`criteriaOf(query, scope)` is the ONE translation from `WorkcardQuery` to `Criteria<Workcard>`:
bare values and arrays pass through (`kind`, `type`, `status`, `intrinsic`, `code`, `category`),
`parent` is direct children, `within` → `parents: { $contains }`, `labels` → `$overlaps`, `ids` →
`id: { $in }`, `flow` → `flows.<id>`, `fields` → `fields.<key>` equality, `q` → `$or` of title /
description `$ilike` (wildcards escaped) and code `$startsWith`, `updatedSince` → `updatedAt: {
$gte }`. `entityId` always comes from the scope; `undefined` is omitted. Paging and sort are
`listOptionsOf` (`size: 0` = no limit). `summaryOf(cards, parents)` counts DIRECT children by
intrinsic state and gives no key to a parent with none.

**A query crosses HTTP in its wire form.** The OwlMeans transport cannot carry arrays or nested
objects in a query string (the client writes `key[]=`, the server reads that key literally), so
the list, summary, transitions, specifications and links protocols take `*QueryWire` shapes: lists
comma-joined (a JSON array when an entry holds a comma), objects as JSON, sort as `field,-field`.
A client calls `encodeWorkcardQuery(query)` before `call({ query })`; a handler calls
`decodeWorkcardQuery(req.query)` — tolerant of arrays and of the rich form — and then
`criteriaOf`. A value that does not decode throws `PlanningError('malformed:query:<key>')`.

## The protocol tree and mounting

`makePlanningProtocols({ base: { alias, path?, parent?, service? }, guards, gate?, socketBase? })`:

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

- Aliases derive from the base alias (`planningAliases(base)` → `<base>:card:list`, …); two mounts
  are two base aliases.
- The guards and the gate sit on the base alone; every HTTP leaf inherits them. `path` defaults to
  `/planning`.
- Static `/cards/summary` is declared before parametric `/cards/:id`.
- The commit socket hangs under `socketBase` when given and then inherits THAT base's guards —
  pass an update/socket base that authenticates; otherwise it hangs under the planning base.
- `actor` in an execute body is ignored on the wire: the server fills it from the request.
- Responses carry no runtime schema (typed only), so a serializer never strips `fields`.

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
| `CommitTimeout` / `CommitFailed` | `commit-timeout:` (still pending, nothing undone) / `commit-failed:` | 500 |
| `PlanningScopeMismatch` / `PlanningUnsupported` | `scope-mismatch:` / `unsupported:` | 404 / 500 |

Type names are `PlanningError<Suffix>` (`PlanningErrorWorkcardNotFound`).

**The HTTP column is each class's `static httpStatus`** (the `error` skill's principle; 500 = none
declared): an addressed card that is absent or another entity's is 404, a card whose state or head
refuses the write is 409, a body naming what the registry, the parent or a schema refuses is 422.
Faults declare nothing, and so does `PlanningError` itself — its three causes share one class, and
a base's static would reach every subclass. A new refusal declares on its own leaf class, and
`tests/error-status.spec.ts` refuses an exported refusal whose status was not decided. A plugin's
plain `throw` inside `before` becomes `PlanningRefused` and answers 422, so a plugin FAULT must
throw a `ResilientError` that declares nothing.

## i18n

Importing the package registers, in all seven languages, `lib:planning.*` labels (`kind.*`,
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
- [[resource]] — the criteria language `criteriaOf` targets
- [[server-planning]] — executor, projection implementations, plugin registry and memory store
