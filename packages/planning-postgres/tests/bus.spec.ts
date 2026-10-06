import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { CommitState, IntrinsicStatus, TransitionAction, WorkcardKind } from '@owlmeans/planning'
import type { CommitEvent, Transition } from '@owlmeans/planning'
import { conformanceFixturesOf, LIBRARY } from '@owlmeans/server-planning/conformance'

import type { Booted } from './context.js'
import { eventually, gate, makeSuite } from './context.js'
import { idHelper } from '@owlmeans/basic-ids'

/**
 * Two (and three) processes over one schema — each a booted context of its own, exactly as two
 * replicas share a database. A lending library's branches and books travel between them.
 */
const suite = makeSuite('bus')
const it = gate.skip ? test.skip : test

describe('@owlmeans/planning-postgres — the commit bus', () => {
  if (gate.skip) {
    test.skip(gate.reason ?? 'postgres gate closed', () => {})

    return
  }

  let first: Booted
  let second: Booted
  let silent: Booted

  beforeAll(async () => {
    first = await suite.boot()
    second = await suite.boot()
    silent = await suite.boot({ bus: false })
  })

  afterAll(async () => {
    await suite.teardown()
  })

  const pendingRow = (org: string, card: string, seq: number): Transition => ({
    entityId: org, card, kind: WorkcardKind.Card, type: LIBRARY.book, seq, action: TransitionAction.Update,
    changes: { title: `Edition ${seq}` }, actor: {}, at: new Date().toISOString(), commit: { state: CommitState.Pending },
  })

  it('another process hears a commit; a process hears its own exactly once', async () => {
    const org = `library-${idHelper.uuid()}`
    const heard: CommitEvent[] = []
    const unsubscribe = await first.facade(org).commits.subscribe(event => { heard.push(event) })
    try {
      const branch = await conformanceFixturesOf(second.facade(org)).createBranch()
      // The LISTEN connection opens with the first subscription; write until it carries a frame.
      await eventually(async () => {
        if (heard.some(event => event.card === branch.id)) {
          return true
        }
        await second.facade(org).execute({ card: branch.id!, action: TransitionAction.Transit, transition: 'activate' }).catch(() => undefined)
        return heard.some(event => event.card === branch.id)
      })
      const remote = heard.find(event => event.card === branch.id)!
      expect(remote.record).toBeUndefined()
      expect(remote.entityId).toBe(org)

      const own = await conformanceFixturesOf(first.facade(org)).createBook(branch.id!)
      const receipt = (await first.facade(org).transitions.list({ card: own.id!, size: 0 })).items[0]
      expect(heard.filter(event => event.transition === receipt.id)).toHaveLength(1)
      expect(heard.find(event => event.transition === receipt.id)?.record?.id).toBe(own.id)
    } finally {
      unsubscribe()
    }
  })

  it('concurrent writers in two processes each commit once, and the card folds every one', async () => {
    const org = `library-${idHelper.uuid()}`
    const book = await conformanceFixturesOf(first.facade(org)).createBook((await conformanceFixturesOf(first.facade(org)).createBranch()).id!)
    const writes = Array.from({ length: 24 }, (_, index) => (index % 2 === 0 ? first : second).facade(org)
      .execute({ card: book.id!, action: TransitionAction.Update, changes: { fields: { signed: index % 3 === 0 } } }))
    const receipts = await Promise.all(writes)

    const settled = await Promise.all(receipts.map(receipt => receipt.committed({ timeout: 15_000 })))
    expect(settled.every(card => card != null)).toBe(true)
    const log = (await first.facade(org).transitions.list({ card: book.id!, size: 0 })).items
    const states = log.filter(entry => entry.action === TransitionAction.Update).map(entry => entry.commit.state)
    expect(states.filter(state => state === CommitState.Committed).length + states.filter(state => state === CommitState.Failed).length)
      .toBe(states.length)
    const card = await first.facade(org).cards.get(book.id!)
    expect([card.seq, card.head]).toEqual([log.at(-1)!.seq, log.at(-1)!.seq])
    // Every write that landed a row is committed: no transient gap turned into a failure.
    expect(receipts.every(receipt => log.find(entry => entry.id === receipt.transition.id)?.commit.state === CommitState.Committed)).toBe(true)
  }, 30_000)

  it('a waiter in one process is answered when another process folds', async () => {
    const org = `library-${idHelper.uuid()}`
    const book = await conformanceFixturesOf(second.facade(org)).createBook((await conformanceFixturesOf(second.facade(org)).createBranch()).id!)
    const row = await second.store.transitions.append(pendingRow(org, book.id!, await second.store.transitions.nextSeq(book.id!, null)))

    const waiting = first.facade(org).commits.wait(row.id!, { timeout: 8_000 })
    await second.store.cards.project(book.id!)

    expect((await waiting)?.title).toBe(`Edition ${row.seq}`)
  })

  it('a schema write in one process reaches the watchers of another', async () => {
    const org = `library-${idHelper.uuid()}`
    const heard: string[] = []
    const unwatch = first.store.schemas.watch!(entityId => { heard.push(entityId) })
    try {
      await eventually(async () => {
        await second.facade(org).definitions!.define({
          flows: [{ id: `library:shelving-${idHelper.uuid()}`, version: 1, statuses: [{ key: 'open', intrinsic: IntrinsicStatus.Planned }], transitions: [] }],
        })
        return heard.includes(org)
      })
      expect(heard).toContain(org)
    } finally {
      unwatch()
    }
  })

  it('without the bus nothing is sent or heard, and a wait still resolves by polling', async () => {
    const org = `library-${idHelper.uuid()}`
    const quiet: CommitEvent[] = []
    const loud: CommitEvent[] = []
    const releaseQuiet = await silent.facade(org).commits.subscribe(event => { quiet.push(event) })
    const releaseLoud = await first.facade(org).commits.subscribe(event => { loud.push(event) })
    try {
      const branch = await conformanceFixturesOf(second.facade(org)).createBranch('Heard by the loud one')
      await eventually(() => loud.some(event => event.card === branch.id))
      const unheard = await conformanceFixturesOf(silent.facade(org)).createBranch('Never announced')
      await new Promise(resolve => setTimeout(resolve, 300))

      expect(quiet.some(event => event.card === branch.id)).toBe(false)
      expect(loud.some(event => event.card === unheard.id)).toBe(false)

      const book = await conformanceFixturesOf(second.facade(org)).createBook(branch.id!)
      const row = await second.store.transitions.append(pendingRow(org, book.id!, await second.store.transitions.nextSeq(book.id!, null)))
      const waiting = silent.facade(org).commits.wait(row.id!, { timeout: 8_000 })
      await second.store.cards.project(book.id!)
      expect((await waiting)?.title).toBe(`Edition ${row.seq}`)
    } finally {
      releaseQuiet()
      releaseLoud()
    }
  }, 15_000)
})
