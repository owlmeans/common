import { describe, expect, test } from 'bun:test'
import { schemaToTableSpec } from '@owlmeans/postgres-resource'
import { IntrinsicStatus, WorkcardKind } from '@owlmeans/planning'
import type { Workcard } from '@owlmeans/planning'

import { PlanningCardTableSchema, RES_PLANNING_CARD, readCard, writeCard } from '../src/index.js'
import type { SqlContext } from '../src/index.js'

/**
 * No database: what the card statements do with `createdBy` — the column ownership checks read.
 * A real round trip is the `@owlmeans/server-planning/conformance` createdBy case, which
 * `conformance.spec.ts` runs when the Postgres gate is open.
 */
const card = schemaToTableSpec(RES_PLANNING_CARD, PlanningCardTableSchema, 'app', 'planning_card', true)

const recording = (rows: Record<string, unknown>[] = []) => {
  const calls: { text: string, params: unknown[] }[] = []
  const sql = {
    runner: { query: async (text: string, params: unknown[] = []) => { calls.push({ text, params }); return rows } },
    tables: { card },
  } as unknown as SqlContext

  return { sql, calls }
}

const folded = (seq: number): Workcard => ({
  id: 'card-1', kind: WorkcardKind.Card, type: 'library:book', entityId: 'library-1', title: 'Stamped',
  parent: 'branch-1', parents: ['branch-1'], status: 'shelved', intrinsic: IntrinsicStatus.Planned,
  flows: { 'library:circulation': 'shelved' }, labels: [], fields: {}, seq, head: seq,
  createdBy: 'librarian', createdAt: '2026-01-01T00:00:00.000Z',
})

/** The value a statement binds to `column`, read from its `"column" = $n` or its INSERT position. */
const bound = (call: { text: string, params: unknown[] }, column: string): unknown => {
  const assigned = new RegExp(`"${column}" = \\$(\\d+)`).exec(call.text)
  if (assigned != null && !call.text.startsWith('INSERT')) {
    return call.params[Number(assigned[1]) - 1]
  }
  const names = /\(([^)]*)\)/.exec(call.text)![1].split(',').map(name => name.trim().replace(/"/g, ''))
  return call.params[names.indexOf(column)]
}

describe('@owlmeans/planning-postgres — createdBy', () => {
  test('the card table keeps it as a nullable column', () => {
    expect(card.byProperty.createdBy).toMatchObject({ column: 'createdBy', jsonType: 'string', notNull: false })
  })

  test('a create inserts it and every later fold writes the folded value back', async () => {
    const created = recording()
    await writeCard(created.sql, folded(1))
    expect(created.calls[0].text).toStartWith('INSERT INTO "app"."planning_card"')
    expect(bound(created.calls[0], 'createdBy')).toBe('librarian')

    const updated = recording([{ id: 'card-1' }])
    await writeCard(updated.sql, folded(3))
    expect(updated.calls[0].text).toStartWith('UPDATE "app"."planning_card" SET')
    expect(bound(updated.calls[0], 'createdBy')).toBe('librarian')
  })

  test('a read answers it, and an unset one is absent rather than null', async () => {
    const { createdBy: _createdBy, ...unowned } = folded(1)

    expect((await readCard(recording([{ ...folded(1), headAt: null }]).sql, 'card-1', 'library-1'))?.createdBy).toBe('librarian')
    const read = await readCard(recording([{ ...unowned, createdBy: null }]).sql, 'card-1', 'library-1')
    expect(read).not.toBeNull()
    expect(Object.keys(read!)).not.toContain('createdBy')
  })
})
