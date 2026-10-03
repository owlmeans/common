import { describe, expect, test } from 'bun:test'

import { canonicalDefinition, planSync, schemaToTableSpec } from '@owlmeans/postgres-resource'
import type { LiveColumn, LiveTable, TableSpec } from '@owlmeans/postgres-resource'

const specOf = (idType: 'string' | 'integer'): TableSpec =>
  schemaToTableSpec('tasks', {
    type: 'object',
    properties: {
      id: idType === 'string' ? { type: 'string' } : { type: 'integer' },
      title: { type: 'string' },
    },
    required: ['id'],
  } as never, 'app', 'task_entry', true)

const columnOf = (over: Partial<LiveColumn> & { name: string, type: string }): LiveColumn => ({
  notNull: true, defaultExpr: null, identity: '', generated: '', ordinal: 1, ...over,
})

const liveOf = (columns: LiveColumn[]): LiveTable =>
  ({ exists: true, columns, indexes: [], constraints: [] })

const kinds = (spec: TableSpec, live: LiveTable): string[] =>
  planSync(spec, live).statements
    .filter(statement => statement.target === 'id')
    .map(statement => `${statement.kind}:${statement.sql.includes('DROP DEFAULT') ? 'drop' : statement.sql.includes('SET DEFAULT') ? 'set' : ''}`)

describe('@owlmeans/postgres-resource — retyping a column that carries a default', () => {
  test('drops the default before the type change and restores it after', () => {
    // Postgres refuses `ALTER COLUMN … TYPE` while the column has a DEFAULT it cannot cast, and
    // the whole plan is one transaction — so without the drop the entire reconciliation aborts and
    // the resource fails every boot.
    const live = liveOf([
      columnOf({ name: 'id', type: 'integer', defaultExpr: `gen_random_uuid()::text` }),
      columnOf({ name: 'title', type: 'text', notNull: false }),
    ])

    expect(kinds(specOf('string'), live)).toEqual(['set-default:drop', 'alter-type:', 'set-default:set'])
  })

  test('a retype of a column without a default emits no default statements', () => {
    const live = liveOf([
      columnOf({ name: 'id', type: 'integer', defaultExpr: null }),
      columnOf({ name: 'title', type: 'text', notNull: false }),
    ])

    expect(kinds(specOf('string'), live)).toEqual(['alter-type:', 'set-default:set'])
  })

  test('a column already on the right type keeps its default untouched', () => {
    const spec = specOf('string')
    const desired = spec.columns.find(column => column.column === 'id')!
    const live = liveOf([
      columnOf({ name: 'id', type: desired.sqlType, defaultExpr: desired.defaultRaw ?? null }),
      columnOf({ name: 'title', type: 'text', notNull: false }),
    ])

    expect(kinds(spec, live)).toEqual([])
  })
})

/**
 * What Postgres reports (`pg_indexes.indexdef`, `pg_get_constraintdef`) for objects created from the
 * statements the plan emits — captured from a live server. Each pair must compare equal, or every
 * boot drops and recreates the object.
 */
const RENDERED: Array<[string, string]> = [
  ['CREATE INDEX "t_a" ON "app"."t" USING btree ("garden", "season")', 'CREATE INDEX t_a ON app.t USING btree (garden, season)'],
  ['CREATE UNIQUE INDEX "t_b" ON "app"."t" USING btree ("garden", COALESCE("bed", \'\'), "season")',
    'CREATE UNIQUE INDEX t_b ON app.t USING btree (garden, COALESCE(bed, \'\'::text), season)'],
  ['CREATE INDEX "t_c" ON "app"."t" USING btree ("garden", "crop") WHERE "crop" IS NOT NULL',
    'CREATE INDEX t_c ON app.t USING btree (garden, crop) WHERE (crop IS NOT NULL)'],
  ['CREATE INDEX "t_d" ON "app"."t" USING btree ("garden") WHERE ("soil"->>\'state\') = \'wet\'',
    'CREATE INDEX t_d ON app.t USING btree (garden) WHERE ((soil ->> \'state\'::text) = \'wet\'::text)'],
  ['CREATE INDEX "t_f" ON "app"."t" USING btree ("entityId", "crop") WHERE "kind" = \'a\'',
    'CREATE INDEX t_f ON app.t USING btree ("entityId", crop) WHERE (kind = \'a\'::text)'],
  ['CREATE INDEX "t_g" ON "app"."t" USING btree (lower("crop"))', 'CREATE INDEX t_g ON app.t USING btree (lower((crop)::text))'],
  ['CHECK (("season" IN (\'spring\', \'summer\')))', 'CHECK ((season = ANY (ARRAY[\'spring\'::text, \'summer\'::text])))'],
  ['CHECK (("kind" IS NULL OR "kind" IN (\'a\', \'b\')))', 'CHECK (((kind IS NULL) OR (kind = ANY (ARRAY[\'a\'::text, \'b\'::text]))))'],
]

describe('@owlmeans/postgres-resource — comparing a declared default with the live one', () => {
  test('a varchar id\'s generated default, stored with its casts, is no drift', () => {
    const spec = schemaToTableSpec('shelves', {
      type: 'object', properties: { id: { type: 'string', maxLength: 128 } }, required: ['id'],
    } as never, 'app', 'shelf', true)
    const live = liveOf([columnOf({ name: 'id', type: 'character varying(128)', defaultExpr: '(gen_random_uuid())::character varying' })])

    expect(planSync(spec, live).statements).toEqual([])
  })
})

describe('@owlmeans/postgres-resource — comparing a declared definition with the live one', () => {
  test('a definition Postgres re-rendered compares equal to the statement that created it', () => {
    for (const [declared, live] of RENDERED) {
      expect([declared, canonicalDefinition(declared)]).toEqual([declared, canonicalDefinition(live)])
    }
  })

  test('a real change still differs: columns, uniqueness, method and predicate', () => {
    const base = 'CREATE INDEX t_a ON app.t USING btree (garden, season)'
    for (const changed of [
      'CREATE INDEX t_a ON app.t USING btree (season, garden)',
      'CREATE UNIQUE INDEX t_a ON app.t USING btree (garden, season)',
      'CREATE INDEX t_a ON app.t USING gin (garden, season)',
      'CREATE INDEX t_a ON app.t USING btree (garden, season) WHERE (season IS NOT NULL)',
    ]) {
      expect(canonicalDefinition(changed)).not.toBe(canonicalDefinition(base))
    }
  })
})
