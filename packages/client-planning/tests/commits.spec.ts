import { describe, expect, test } from 'bun:test'
import { CommitState, CommitTimeout, TransitionAction, WorkcardKind } from '@owlmeans/planning'
import { STORY, makeSuite, protocols, tick } from './context.js'
import type { Suite } from './context.js'

const draft = (suite: Suite, parent: string) => suite.planning.execute({
  card: { kind: WorkcardKind.Card, type: STORY, parent, title: 'Waited for' },
  action: TransitionAction.Create,
})

describe('@owlmeans/client-planning — waiting for a commit', () => {
  test('wait subscribes before its first read, so a commit landing right after that read is caught', async () => {
    let transition: string | undefined
    let landed = false
    const suite: Suite = await makeSuite({
      sync: false,
      socket: true,
      poll: 20,
      // The server folds the moment it has answered the first status read — after the read, before
      // anything else the client does. Only a subscription made BEFORE the read can hear it.
      after: async call => {
        if (!landed && call.alias === protocols.commit.get.alias && transition != null) {
          landed = true
          await suite.store.flush()
          await tick(10)
        }
      },
    })
    const project = await suite.project()
    const receipt = await draft(suite, project.id!)
    transition = receipt.transition.id
    const before = suite.calls.length

    const card = await suite.planning.commits.wait(transition!, { timeout: 5_000 })

    expect(card?.title).toBe('Waited for')
    expect(suite.sockets()).toBe(1)
    // One status read and nothing else: the frame answered, not a long poll.
    expect(suite.calls.slice(before).filter(call => call.alias === protocols.commit.get.alias)).toHaveLength(1)
  })

  test('without a socket the long poll alone brings the commit', async () => {
    const suite = await makeSuite({ sync: false, poll: 2 })
    const project = await suite.project()
    const receipt = await draft(suite, project.id!)

    setTimeout(() => { void suite.store.flush() }, 300)
    const card = await suite.planning.commits.wait(receipt.transition.id!, { timeout: 5_000 })

    expect(card?.title).toBe('Waited for')
    expect(suite.client.planning().commits.connected()).toBe(false)
    expect(suite.calls.some(call => call.alias === protocols.commit.get.alias && Number(call.query.wait) > 0)).toBe(true)
  })

  test('the deadline throws CommitTimeout and leaves the transition pending', async () => {
    const suite = await makeSuite({ sync: false, poll: 1 })
    const project = await suite.project()
    const receipt = await draft(suite, project.id!)

    const started = Date.now()
    await expect(suite.planning.commits.wait(receipt.transition.id!, { timeout: 1_200 }))
      .rejects.toBeInstanceOf(CommitTimeout)
    expect(Date.now() - started).toBeLessThan(3_000)

    expect((await suite.planning.commits.status(receipt.transition.id!)).state).toBe(CommitState.Pending)
  })
})
