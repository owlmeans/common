---
name: fold
description: The pure fold (applyTransition, applyRelationship), what computeChanges records and assertMutable refuses, and the one query translation with its wire form.
metadata:
  purposes: query, state
  mentions: applyHelper, applyTransition, applyRelationship, changesHelper, computeChanges, assertMutable, isEmptyChange, queryHelper, criteriaOf, listOptionsOf, summaryOf, wireHelper, encodeWorkcardQuery, decodeWorkcardQuery, WorkcardQuery
---

# @owlmeans/planning — The fold and querying

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
