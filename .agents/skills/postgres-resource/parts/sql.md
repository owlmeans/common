---
name: sql
description: Custom SQL with {{alias}} placeholders (identifiers only) and how criteria compile against a table, jsonb paths and array operators included.
metadata:
  purposes: query, data
  mentions: criteriaToSql, sortToSql, resolvePlaceholders, refOf, PostgresPlaceholderError, selectOne, queryOne, $contains, $overlaps, $contained
---

# @owlmeans/postgres-resource — Custom SQL and criteria

## Custom SQL: identifiers interpolate, values never

| Placeholder | Resolves to |
|---|---|
| `{{}}` / `{{self}}` | the owning resource's `"schema"."table"` |
| `{{alias}}` | another registered Postgres resource's qualified table |
| `{{alias.property}}` | that resource's qualified column |
| `{{#alias}}` | the bare quoted table name (`ON CONFLICT ON CONSTRAINT`) |
| `{{$}}` | the owning resource's quoted schema |

```typescript
await projects.select(
  `SELECT {{}}.* FROM {{}} JOIN {{users}} u ON u.id = {{self.ownerId}} WHERE u.active = $1`, [true]
)
```

**Do not alias a table a placeholder still names.** Every `{{…}}` expands to the *qualified*
`"schema"."table"` — `{{self.ownerId}}` to `"schema"."table"."ownerId"` — so aliasing the same table
as `p` in the `FROM` makes Postgres reject the expansion with `invalid reference to FROM-clause
entry`. Either write the qualified form throughout, as above, or alias the table and stop using
`{{self.…}}` for its columns.

Postgres cannot bind an identifier as a parameter — that is the entire reason this mechanism exists.
Values have no such excuse: they stay in `params` as `$1..$n`. An unknown alias or property raises
`PostgresPlaceholderError` at parse time.

**Registration order matters here, unlike Mongo.** `{{alias}}` reads the other resource's
*initialized* `table` spec, where mongo's `ref` derives a collection name from config alone. A
foreign key whose target hasn't initialized is queued with `service.defer()` and drained by the
middleware `appendPostgres` installs — use that rather than reordering registrations.

## Criteria against a table

`criteriaToSql` answers the shared vocabulary ([[resource]], its `criteria` part) in SQL, so one criteria object selects
the same rows here as it does against a collection or in memory. What is specific to a table:

- **A key naming no column raises `UnsupportedArgumentError`.** A typo that silently widened a
  query to the whole table is worth being loud about — the schemaless stores cannot detect one.
- **A dotted key reaches into a jsonb column** as `col #> $n::text[]` — the path ONE bound
  parameter, so a segment holding a comma stays one segment — and reads the way the same value
  reads on a column: a bare value is TYPED JSON equality (`= $m::jsonb`: `30` is not `'30'`, `true`
  not `'true'`), a bare list is membership (`= ANY(ARRAY[…]::jsonb[])`), `null` is absence (`IS NULL`
  or a JSON `null`), operators apply as on a column (comparisons against jsonb, the text operators
  over `#>>`, `$in`/`$nin` with the null widening, `$exists`/`$null`, the array operators below),
  and a plain object is containment. A criteria object against a jsonb column itself is
  containment (`@>`). A dotted key over a non-jsonb column is refused, and `sort` refuses dotted
  paths outright: ORDER BY names a column the caller actually declared.
- `$contains`/`$contained`/`$overlaps` take a list or a scalar (the one-element list). On a native
  array column they are `@>`/`<@`/`&&` against ONE bound array parameter cast to the column's type —
  a bare JS array inside a drizzle `sql` template expands into a row constructor `($1, $2)`, which
  no array operator accepts. On jsonb, `@>`/`<@` compare JSON (an object as an object, anything
  else as the array it is), and `$overlaps` is element-wise over an array value (a scalar value
  overlaps when it is one of the operands).
- `$like`/`$ilike` are `LIKE`/`ILIKE`; `$exists: true` and `$null: false` are `IS NOT NULL`, their
  negations `IS NULL`.
- **`{ $in: [null, …] }` is widened explicitly.** SQL `IN` never matches NULL, so a null in the
  list would silently disappear; the condition becomes `IN (…) OR IS NULL` (and the `$nin` form
  `NOT IN (…) AND IS NOT NULL`), which is what the other stores answer.
