import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import {
  cardHelper, CommitFailed, CommitState, TITLE_MAX, TransitionAction, WorkcardKind,
} from '@owlmeans/planning'
import type { PlanningFacade, PlanningPlugin, Transition } from '@owlmeans/planning'
import type { PostgresResource } from '@owlmeans/postgres-resource'
import { conformanceFixturesOf, LIBRARY, planningConformancePlugin } from '@owlmeans/server-planning/conformance'
import { Client } from 'pg'

import { LOST_ALLOCATION, RES_PLANNING_CARD } from '../src/index.js'
import type { Booted } from './context.js'
import { gate, makeSuite } from './context.js'
import { idHelper } from '@owlmeans/basic-ids'
import { pgNameHelper } from '@owlmeans/postgres-resource'

/** A lending library's books, folded under the conditions a two-round-trip append creates. */
const suite = makeSuite('fold')
const it = gate.skip ? test.skip : test

const LIMITS = { gapGraceMs: 300, healAfterMs: 50, lockTimeoutMs: 300 }

describe('@owlmeans/planning-postgres — the fold', () => {
  if (gate.skip) {
    test.skip(gate.reason ?? 'postgres gate closed', () => {})

    return
  }

  let booted: Booted
  const hooked: Array<[string, TransitionAction]> = []

  /** Catalogues a new book from its own `after` hook — a write to the very card that just committed. */
  const catalogue: PlanningPlugin = {
    name: 'catalogue',
    after: async (event, ctx) => {
      hooked.push([event.transition, event.action])
      if (event.action === TransitionAction.Create && event.type === LIBRARY.book) {
        await ctx.facade.execute({
          card: event.card, action: TransitionAction.Update, changes: { description: 'Catalogued' }, key: `catalogue:${event.card}`,
        })
      }
    },
  }

  beforeAll(async () => {
    booted = await suite.boot({ limits: LIMITS, plugins: [planningConformancePlugin, catalogue] })
  })

  afterAll(async () => {
    await suite.teardown()
  })

  const start = async (): Promise<{ org: string, planning: PlanningFacade, book: string }> => {
    const org = `library-${idHelper.uuid()}`
    const planning = booted.facade(org)
    const branch = await conformanceFixturesOf(planning).createBranch()
    const book = await conformanceFixturesOf(planning).createBook(branch.id!)
    return { org, planning, book: book.id! }
  }

  const row = (org: string, card: string, seq: number, patch: Partial<Transition> = {}): Transition => ({
    entityId: org, card, kind: WorkcardKind.Card, type: LIBRARY.book, seq, action: TransitionAction.Update,
    changes: {}, actor: {}, at: new Date().toISOString(), commit: { state: CommitState.Pending }, ...patch,
  })

  const stateOf = async (id: string): Promise<CommitState | undefined> =>
    (await booted.store.transitions.get(id))?.commit.state

  it('an after hook runs once per commit, after it, and may write to the card it saw commit', async () => {
    const { planning, book } = await start()

    expect((await planning.cards.get(book)).description).toBe('Catalogued')
    const created = hooked.filter(([, action]) => action === TransitionAction.Create)
    expect(new Set(created.map(([transition]) => transition)).size).toBe(created.length)
    const updates = (await planning.transitions.list({ card: book })).items.filter(entry => entry.action === TransitionAction.Update)
    expect(updates).toHaveLength(1)
    expect(hooked.filter(([transition]) => transition === updates[0].id)).toHaveLength(1)
  })

  it('a young gap waits for its appender, whose own fold then commits both', async () => {
    const { org, planning, book } = await start()
    const at = (await booted.store.transitions.nextSeq(book, null))
    const next = await booted.store.transitions.nextSeq(book, null)
    const third = await booted.store.transitions.append(row(org, book, next, { changes: { title: 'Third' } }))
    await booted.store.cards.project(book)

    expect(await stateOf(third.id!)).toBe(CommitState.Pending)
    expect((await planning.cards.get(book)).seq).toBe(2)

    const second = await booted.store.transitions.append(row(org, book, at, { changes: { title: 'Second' } }))
    await booted.store.cards.project(book)

    expect([await stateOf(second.id!), await stateOf(third.id!)]).toEqual([CommitState.Committed, CommitState.Committed])
    const card = await planning.cards.get(book)
    expect([card.title, card.seq, card.head]).toEqual(['Third', 4, 4])
  })

  it('an allocation lost past the grace becomes a failed placeholder the fold steps over', async () => {
    const { org, planning, book } = await start()
    await booted.store.transitions.nextSeq(book, null)
    const next = await booted.store.transitions.nextSeq(book, null)
    const late = await booted.store.transitions.append(row(org, book, next, {
      changes: { title: 'After the hole' }, at: new Date(Date.now() - 3_600_000).toISOString(),
    }))
    await booted.store.cards.project(book)

    expect(await stateOf(late.id!)).toBe(CommitState.Committed)
    const hole = (await planning.transitions.list({ card: book, size: 0 })).items.find(entry => entry.seq === next - 1)!
    expect([hole.commit.state, hole.cause, hole.commit.error]).toEqual([CommitState.Failed, LOST_ALLOCATION, LOST_ALLOCATION])
    expect((await planning.cards.get(book)).title).toBe('After the hole')
  })

  it('an allocation lost with no row at all is released by the next fold', async () => {
    const { planning, book } = await start()
    await booted.store.transitions.nextSeq(book, null)
    expect(cardHelper.isPending(await planning.cards.get(book))).toBe(true)

    await new Promise(resolve => setTimeout(resolve, LIMITS.gapGraceMs + 50))
    await booted.store.fold(book)

    const card = await planning.cards.get(book)
    expect(cardHelper.isPending(card)).toBe(false)
    await planning.execute({ card: book, action: TransitionAction.Update, changes: { title: 'Moving on' } }, { wait: true })
    expect((await planning.cards.get(book)).title).toBe('Moving on')
  })

  it('a failed row at the cursor is folded past without failing the next one', async () => {
    const { org, planning, book } = await start()
    const failed = await booted.store.transitions.append(row(org, book, await booted.store.transitions.nextSeq(book, null)))
    await booted.store.transitions.commit(failed.id!, { state: CommitState.Failed, at: new Date().toISOString(), error: 'refused elsewhere' })
    const after = await booted.store.transitions.append(row(org, book, await booted.store.transitions.nextSeq(book, null), {
      changes: { title: 'Not out of order' },
    }))
    await booted.store.cards.project(book)

    expect(await stateOf(after.id!)).toBe(CommitState.Committed)
    expect((await planning.cards.get(book)).title).toBe('Not out of order')
  })

  it('a write the database refuses fails that transition alone, and the fold goes on', async () => {
    const { org, planning, book } = await start()
    const before = await planning.cards.get(book)
    const oversized = await booted.store.transitions.append(row(org, book, await booted.store.transitions.nextSeq(book, null), {
      changes: { title: 'x'.repeat(TITLE_MAX + 10) },
    }))
    await booted.store.cards.project(book)

    const status = await booted.store.commits.status(oversized.id!)
    expect(status.state).toBe(CommitState.Failed)
    const card = await planning.cards.get(book)
    expect([card.title, card.seq]).toEqual([before.title, before.seq + 1])

    await planning.execute({ card: book, action: TransitionAction.Update, changes: { title: 'Fits' } }, { wait: true })
    expect((await planning.cards.get(book)).title).toBe('Fits')
  })

  it('a transaction a statement broke is retried, then its pending transitions fail for their waiters', async () => {
    const { planning, book } = await start()
    const schema = `"${suite.schema}"`
    await booted.pg.query(
      `CREATE OR REPLACE FUNCTION ${schema}.refuse_commit() RETURNS trigger AS $$ BEGIN`
      + ` IF NEW."card" = '${book}' AND NEW."commit"->>'state' = 'committed' THEN RAISE EXCEPTION 'refused by the shelf'; END IF;`
      + ` RETURN NEW; END $$ LANGUAGE plpgsql`
    )
    await booted.pg.query(
      `CREATE TRIGGER refuse_commit BEFORE UPDATE ON ${schema}."planning_transition" FOR EACH ROW EXECUTE FUNCTION ${schema}.refuse_commit()`
    )
    try {
      const receipt = await planning.execute({ card: book, action: TransitionAction.Update, changes: { title: 'Never' } })
      const refusal = await receipt.committed({ timeout: 5_000 }).catch(error => error)
      expect(refusal).toBeInstanceOf(CommitFailed)
      expect(refusal.message).toContain('refused by the shelf')
      expect((await planning.cards.get(book)).title).not.toBe('Never')
    } finally {
      await booted.pg.query(`DROP TRIGGER refuse_commit ON ${schema}."planning_transition"`)
    }

    await planning.execute({ card: book, action: TransitionAction.Update, changes: { title: 'Afterwards' } }, { wait: true })
    expect((await planning.cards.get(book)).title).toBe('Afterwards')
  })

  it('a fold that cannot take the card\'s lock yields, and a waiter heals it once the lock is free', async () => {
    const { planning, book } = await start()
    const table = booted.context.resource<PostgresResource<never>>(RES_PLANNING_CARD).table.qualified
    const [first, second] = pgNameHelper.advisoryKey(`planning:${table}:${book}`)
    const holder = new Client({ connectionString: gate.env.POSTGRES_URL as string })
    await holder.connect()
    try {
      await holder.query('BEGIN')
      await holder.query('SELECT pg_advisory_xact_lock($1, $2)', [first, second])

      const receipt = await planning.execute({ card: book, action: TransitionAction.Update, changes: { title: 'Held back' } })
      expect(receipt.transition.commit.state).toBe(CommitState.Pending)
      const waiting = planning.commits.wait(receipt.transition.id!, { timeout: 8_000 })

      await new Promise(resolve => setTimeout(resolve, 100))
      await holder.query('ROLLBACK')
      expect((await waiting)?.title).toBe('Held back')
    } finally {
      await holder.end().catch(() => undefined)
    }
  }, 15_000)

  it('recover folds what no process is folding', async () => {
    const { org, book } = await start()
    const stale = await booted.store.transitions.append(row(org, book, await booted.store.transitions.nextSeq(book, null), {
      changes: { title: 'Recovered' }, at: new Date(Date.now() - 120_000).toISOString(),
    }))

    expect(await booted.store.recover({ olderThanMs: 60_000 })).toBeGreaterThanOrEqual(1)
    expect(await stateOf(stale.id!)).toBe(CommitState.Committed)
  })
})
