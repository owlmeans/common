import { describe, expect, test } from 'bun:test'
import { makeFlowModel } from '@owlmeans/flow'
import type { ShallowFlow } from '@owlmeans/flow'
import {
  discardSuspendedLanding, resumeSuspendedFlow, suspendFlow, suspendLanding,
} from '../src/landing.js'
import { makeTestContext } from './context.js'

const testFlow: ShallowFlow = {
  flow: 'test-landing',
  initialStep: 'a',
  steps: {
    a: {
      index: 0, step: 'a', service: '', initial: true,
      transitions: { next: { transition: 'next', step: 'b' } },
    },
    b: {
      index: 1, step: 'b', service: '', module: 'target-entrypoint',
      transitions: {},
    },
    dead: {
      // No transitions and no `module` — used to exercise the two ways suspending can fail.
      index: 2, step: 'dead', service: '', transitions: {},
    },
  },
}

describe('suspendFlow / resumeSuspendedFlow', () => {
  test('suspends the flow model\'s NEXT destination and resumes it once, with its payload', async () => {
    const context = makeTestContext()
    const model = await makeFlowModel(testFlow)
    model.updatePayload({ ref: 'abc-123' })

    expect(await suspendFlow(context, model, { expiresAt: Date.now() + 60_000 })).toBe(true)

    const landing = await resumeSuspendedFlow(context)
    expect(landing).toEqual({ entrypoint: 'target-entrypoint', query: { ref: 'abc-123' } })
  })

  test('resuming is single-use — a second call finds nothing', async () => {
    const context = makeTestContext()
    const model = await makeFlowModel(testFlow)
    await suspendFlow(context, model, { expiresAt: Date.now() + 60_000 })

    await resumeSuspendedFlow(context)
    expect(await resumeSuspendedFlow(context)).toBeNull()
  })

  test('an expired landing resumes to nothing', async () => {
    const context = makeTestContext()
    const model = await makeFlowModel(testFlow)
    await suspendFlow(context, model, { expiresAt: Date.now() - 1 })

    expect(await resumeSuspendedFlow(context)).toBeNull()
  })

  test('a step with no forward transition suspends nothing', async () => {
    const context = makeTestContext()
    const deadModel = await makeFlowModel(testFlow)
    // Stand the model on the dead-end step directly — it declares no transitions, so `next()`
    // has nothing to offer and suspending must decline rather than persist a landing to nowhere.
    deadModel.setState({ ...deadModel.state(), step: 'dead' })

    expect(await suspendFlow(context, deadModel, { expiresAt: Date.now() + 60_000 })).toBe(false)
    expect(await resumeSuspendedFlow(context)).toBeNull()
  })

  test('with no FLOW_STATE resource registered, both are safe no-ops', async () => {
    const context = makeTestContext(false)
    const model = await makeFlowModel(testFlow)

    expect(await suspendFlow(context, model, { expiresAt: Date.now() + 60_000 })).toBe(false)
    expect(await resumeSuspendedFlow(context)).toBeNull()
  })
})

describe('suspendLanding / discardSuspendedLanding', () => {
  test('parks a known destination in the record resumeSuspendedFlow reads, once', async () => {
    const context = makeTestContext()

    expect(await suspendLanding(
      context, { entrypoint: 'guarded-screen', query: {} }, { expiresAt: Date.now() + 60_000 }
    )).toBe(true)

    expect(await resumeSuspendedFlow(context)).toEqual({ entrypoint: 'guarded-screen', query: {} })
    expect(await resumeSuspendedFlow(context)).toBeNull()
  })

  test('the later write replaces a landing a flow suspended earlier', async () => {
    const context = makeTestContext()
    await suspendFlow(context, await makeFlowModel(testFlow), { expiresAt: Date.now() + 60_000 })
    await suspendLanding(
      context, { entrypoint: 'guarded-screen', query: {} }, { expiresAt: Date.now() + 60_000 }
    )

    expect(await resumeSuspendedFlow(context)).toEqual({ entrypoint: 'guarded-screen', query: {} })
  })

  test('a discarded landing resumes to nothing', async () => {
    const context = makeTestContext()
    await suspendLanding(
      context, { entrypoint: 'guarded-screen', query: {} }, { expiresAt: Date.now() + 60_000 }
    )
    await discardSuspendedLanding(context)

    expect(await resumeSuspendedFlow(context)).toBeNull()
  })

  test('with no FLOW_STATE resource registered, both are safe no-ops', async () => {
    const context = makeTestContext(false)

    expect(await suspendLanding(
      context, { entrypoint: 'guarded-screen', query: {} }, { expiresAt: Date.now() + 60_000 }
    )).toBe(false)
    await discardSuspendedLanding(context)
    expect(await resumeSuspendedFlow(context)).toBeNull()
  })
})
