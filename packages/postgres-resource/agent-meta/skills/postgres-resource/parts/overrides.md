---
name: overrides
description: The pg override keys for what JSON Schema cannot say, the AJV strict-mode keyword, and how index and unique specs are deduplicated.
metadata:
  purposes: data, migration
  mentions: pgKeyword, PgPropertyOverride, PgRootOverride, PgIndexSpec, PgUniqueSpec, PgCheckSpec, PgReferenceSpec, resource.index(
---
<!-- AUTO-GENERATED — do not edit. Regenerate via sync-agent-meta. -->

# @owlmeans/postgres-resource — The pg override vocabulary

## The `pg:` override vocabulary

For what JSON Schema can't say. Per property: `column`, `type`, `length`, `precision`, `scale`,
`nullable`, `default`/`defaultRaw`, `primaryKey`, `unique`, `index`, `references`, `jsonb`, `array`,
`check`, `using`, `managed`, `comment`. At the root: `table`, `schema`, `primaryKey`, `unique`,
`indexes`, `checks`, `unmanaged`, `autoSync`, `comment`.

```typescript
{
  type: 'object',
  properties: {
    email: { type: 'string', pg: { type: 'varchar', length: 320, unique: true } },
    ownerId: { type: 'string', pg: { references: { resource: 'users', onDelete: 'cascade' } } }
  },
  required: ['email'],
  pg: { indexes: [{ name: 'idx_owner_created', columns: ['ownerId', 'createdAt'] }] }
}
```

The compiler reads the raw schema object and never validates through AJV, so `pg:` costs nothing at
runtime — but a consumer compiling that schema in **strict mode** must `ajv.addKeyword(pgKeyword)`.

**Index and unique specs are deduplicated by resolved name, first declaration wins.** Three
declaration sites merge into one `TableSpec` — the schema root, a per-property override, and
`resource.index()` — and a consumer that declares one index in two of them is expressing a style,
not an error. Two entries under one name would emit the same `CREATE INDEX` twice in a single DDL
transaction, and Postgres answers the second with `42P07`, rolling back the plan that created the
table: the resource then fails every boot with an error naming an index that does not exist.
The compiler collapses the duplicates itself, keeps the first declaration and logs a warning.
