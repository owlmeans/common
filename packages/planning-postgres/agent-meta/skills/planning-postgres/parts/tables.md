---
name: tables
description: The eight tables with their columns and indexes, the data-defined schema table, and how planning queries compile to SQL.
metadata:
  purposes: data, query, migration
  mentions: PlanningCardTableSchema, PlanningTransitionTableSchema, planning-card, planning-transition, planning-schema, headAt, pgCriteriaHelper, countBy
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/planning-postgres — Tables and queries

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

## Data-defined types and flows

`planning-schema` holds one record per `(organization, project layer, kind, key)`; a write is one
transaction that bumps the organization's `head` row, writes under the compare-and-set on `version`
(an INSERT for version 1, an UPDATE guarded on `version - 1` after) and NOTIFYs. `revision()` is a
primary read of the head row, so the service's cached layers are never served stale. The rules —
what may be defined, sealing, retiring — are `planning`'s and `server-planning`'s.

## Querying

Lists, counts and summaries go through `@owlmeans/postgres-resource` (`pgCriteriaHelper.criteriaToSql`),
so a `WorkcardQuery` selects here what it selects in memory: `within` is `parents @> $1::varchar[]`,
`labels` `&&`, `flows.<id>` / `fields.<key>` typed jsonb paths (a list is membership), `q` `ILIKE` +
code prefix. A summary is one `countBy(parent, intrinsic)`. Paging is Postgres's — 100 rows unless
`size` says otherwise.
