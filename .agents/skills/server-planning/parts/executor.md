---
name: executor
description: The transition executor step by step (refusal order, actor and createdBy stamping) and the plugin seam (registration, order, store routing, before/after hooks).
metadata:
  purposes: planning, server-api
  mentions: executeTransition, creatorHelper, makePluginRegistry, ensurePlanningService, PlanningRefused, mintCode, WorkcardConflict
---

# @owlmeans/server-planning — The executor and the plugin seam

## The executor, step by step

Nothing is appended before step 11 — every refusal leaves the log untouched.

1. **Normalize** — deep copy, trimmed text, `parents ∋ parent` (first); a create's draft without
   `createdBy` gets `creatorHelper.creatorOf(scope)` (below).
2. **Scope** — `entityId` must be present.
3. **Idempotency** — a `key` already in the entity's log answers ITS receipt, before any
   validation or middleware.
4. **Resolve** — the card (`WorkcardNotFound`; another entity's card is `PlanningScopeMismatch`;
   a `retype`'s new type too — `Resolved.target`, in the same layer, a retired one refused;
   one outside the scope's `projects` is `WorkcardNotFound`), its type and flow, every draft parent
   (`ParentNotFound` — loaded through the facade, so an invisible parent is absent) and the parent
   project's `cardTypes`/`projectTypes` (`CardTypeNotAllowed`), the specification slot. Where the
   default store holds data-defined schemas, the card's project is found first and everything
   after reads that project's resolved layer (`Resolved.schemas`): a data-defined type of a
   project with `scopedCardTypes` is admitted, a retired type creates nothing
   (`UnknownWorkcardType('retired:…')`). Without the port `Resolved.schemas` IS the code registry.
5. **`before` chain** — in plugin order; re-resolved once when it changed the card, type, parent or a
   retype's `toType`.
6. **Validate** — shape (`planning:malformed:*`: a `retype` without `toType`, `toType` on another
   action), the flow rule (`IllegalTransition`), immutables
   (`planning:immutable:*`, `createdBy` among them — `creatorHelper.assertCreatorFixed`; a retype never
   names `code`), a `retype`'s own checks (below), merged `fields` against the
   type's `fieldsSchema` — its own `fields` plus the app's base card fields; a retype's against the NEW
   type, the `formerCodes` the code step appends included (`FieldsInvalid`; the fold re-checks it), labels (`LabelNotAllowed`; a retype's kept labels against the new type), a moved
   parent, the slot (`SpecificationSlotUnknown`, `SpecificationRevisionConflict`, JSON body schema
   → `FieldsInvalid`), relationships (`RelationshipRefused`: undeclared type, `from` not the card,
   missing target, type constraints, `single`, unlinking an absent edge).
7. **Card id** — `store.newId?.() ?? options.ids?.() ?? idHelper.uuid()`. Ids are the store's.
8. **Code** — a supplied code is checked; else the plugins' `mintCode` (first answer wins, checked);
   else the type's `CodePolicy` (a slug policy derives from the title) → `CodeTaken`. A `retype`
   keeps the code when the new type has no policy, or when the code carries the new policy's prefix
   and is free in the new type's scope; otherwise it mints one the same way (a draft of the new type)
   and appends the old code to `fields.formerCodes` (`FORMER_CODES_FIELD`, at most `MAX_FORMER_CODES`).
9. **Changes** — `changesHelper.computeChanges`. An `update` that changes nothing answers the card's latest
   receipt and appends nothing.
10. **Seq** — `transitions.nextSeq(card, expectSeq)`, a CAS against `head` (`WorkcardConflict`).
11. **Append** — `commit: pending`. A lost race on the key answers the winner's receipt.
12. **Project** — `store.cards.project(card)`: a sync store folds now, a queued one enqueues.
13. **Receipt** — `{ transition, card? (once committed), committed(opts) }`.
14. **`wait: true`** — `committed()` before returning (`CommitTimeout`, `CommitFailed`).

**A `retype`'s own checks** (step 6, before the fields): another type (`RetypeNotAllowed('same:…')`)
of the same kind (`kind:…`) that the CURRENT type lists in `retypes` (opt-in per type — a type listing
none is never retyped), routed to the same store (`store:…`); no `parent`/`parents` in it
(`malformed:retype-moves-parent`); every flow of the new type declaring the status the card holds in
it (`status:<flow>:<status>`); every parent admitting the new type (`CardTypeNotAllowed`); every
document's slot declared by the new type with the same format (`document:<category>`); every card
link fitting the rules from either end — an outgoing one declared by the new type (`from`/`to`), an
incoming one whose owner's rule `to` admits the new type (`RelationshipRefused('retype:…')`; field-
derived edges are recomputed by the fold). The children are checked by the projection invariants: a
card whose `type` changed re-validates everything under it as a moved one does (`CardTypeNotAllowed`).
The appended row carries the NEW type; the fold writes it onto the record (`planning` → fold part).

`actor` is the SCOPE's: `profileId`/`userId`/`service`/`channel` come from the scope only; an
in-process caller may add `agent`/`runId` on the execution. A handler never passes a wire `actor`.

A create's `createdBy` is the scope's subject too — `creatorHelper.creatorOf(scope)`: `profileId`, else `userId`,
else the same two of `scope.actor`. The executor stamps it on every path, so an in-process facade
create and the HTTP `execute` produce the same owner. An in-process draft that names `createdBy`
keeps it (explicit wins — a manager creating on someone's behalf); a scope naming nobody (a service
or system scope) leaves it unset; the wire drops a draft's `createdBy` before the stamp.

`createdBy` never moves after the create (the rule is `planning` → The record model). The executor
enforces it itself with `creatorHelper.assertCreatorFixed` at step 6, after the `before` chain, so a wire body, an
in-process caller and a plugin are refused alike, whatever `@owlmeans/planning` build the host
resolves. The conformance suite checks a store folds a stored row naming it as the pure fold does.

## The plugin seam

| Concern | Rule |
|---|---|
| Registration | `use(plugin)` replaces by `name`; schemas are contributed at `use` time (later type/flow id wins); `schemas.app` is re-merged from the service's own and every registered plugin's in plugin order on each `use` (`appSchemaHelper.merge`) — a malformed one refuses the plugin (`SchemaInvalid`) and changes nothing |
| Order | `order ?? 50` ascending, registration order among equals |
| Store routing | `store(type)` = the first plugin whose `owns(type)` is true AND that supplies a `store`; else the default store. A store factory is resolved once |
| Reads | By id: the default store, then each owned store. A list naming one owned type (or several owned by one store) goes there; any other list — a cross-type query — is the default store's alone |
| `mintCode` | First non-`undefined` answer wins |
| `before` | Every plugin in order; may return a replaced execution; a `ResilientError` passes through, anything else becomes `PlanningRefused('<plugin>:<message>')` |
| `after` | Every plugin in order, once per COMMITTED transition; errors logged, never rethrown |

**Where `after` runs.** The service's `committed(event)` runs the chain, and it is called by the
process that FOLDS the transition — the memory store inside `project()`, a queued store's projection
job after marking the commit. Never subscribe a process to the commit bus to run hooks: that fires
once per subscribed process. Every process that folds registers the same plugins; each commit is
folded by one of them, so each hook fires once. `hooks: false` makes a process fold without running
them. A hook sees `ctx.transition` (read back, so `actor.channel` is available) and a facade scoped
to the event's entity acting as this process's `cfg.service`.

The service hands `committed` to a store through `store.bind?.(listener)` the first time it resolves
the store; `bind` replaces the listener, so a store has exactly one.
