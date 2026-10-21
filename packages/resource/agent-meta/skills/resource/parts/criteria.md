---
name: criteria
description: The criteria language (equality, any-of arrays, operators, branches, nested keys), sort and where absent values land, and paging per backend.
metadata:
  purposes: query, list
  mentions: Criteria, FieldCriteria, FieldOperators, $or, $in, $ilike, $contains, $overlaps, Sort, ListOptions, ListResult, DEFAULT_PAGE_SIZE, page-without-size
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/resource — Criteria, sort and paging

## The criteria language

`Criteria<T>` is keyed by the record's own fields, so a typo is a compile error. A dotted key
reaches into a nested value (or a jsonb column) and stays open.

| Written as | Means |
|---|---|
| `{ status: 'open' }` | equality |
| `{ status: ['open', 'done'] }` | **any of these** — a bare array is never exact-array equality (that is `{ $eq: [...] }`) |
| `{ archivedAt: null }` | the absence of a value |
| `{ status: undefined }` | **skipped** — an untouched filter must never empty a list |
| `{ 'profile.city': 'Kraków' }` | reach into a nested value or a jsonb column |

Operators go in an object under the field: `$eq $ne $gt $gte $lt $lte $in $nin $exists $null
$like $ilike $regex $startsWith $endsWith $between $contains $contained $overlaps`. Branches
combine with `$and` / `$or` / `$not`, each taking criteria of the same shape.

```typescript
await projects.list({
  entityId: 'abc',
  createdAt: { $gte: since },
  $or: [{ name: { $ilike: 'owl%' } }, { tags: { $overlaps: ['pinned'] } }]
})
```

Every backend answers the same object the same way — that is the point of the vocabulary. An
operator a store cannot express raises `UnsupportedArgumentError` rather than being quietly
dropped.

`Sort<T>` is a bare field name (ascending) or `{ field, order: 'asc' | 'desc' }`, and `sort` takes
a list of them. Where an **absent** value lands is the store's own rule, not the vocabulary's: the
in-memory sorter puts it last ascending, Postgres emits a bare `ASC` and so leaves it last (the
server's `NULLS LAST` default), and Mongo hands the sort document to the driver untouched, so BSON
ordering puts null and missing first. Sort on a field the schema requires when the position of an
absent value matters.

## Paging is a property of the backend

`ListResult<T>` is `{ items, total, page?, size? }` — `total` always counts every match. Whether a
missing `size` means "everything" depends on what the store can afford:

| Backend | `list(where)` with no `size` |
|---|---|
| mongo, postgres | a page of `DEFAULT_PAGE_SIZE` (100) — an unbounded read of a growing table is an incident waiting to happen |
| redis, static, client-resource, config, state | every match — answering the criteria already read the whole namespace, so an implied window would only hide records without saving work |

`size: 0` means **no limit** on every backend — the explicit, greppable way to ask for a whole
result set. `page` without `size` against an unpaged backend throws
`UnsupportedArgumentError('page-without-size')`: there is no implied default to take a window of.
