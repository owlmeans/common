import { describe, expect, test } from 'bun:test'

import { planSync, schemaToTableSpec } from '@owlmeans/postgres-resource'
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
