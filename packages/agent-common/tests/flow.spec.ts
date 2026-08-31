import { describe, expect, test } from 'bun:test'
import { makeFlowModel } from '@owlmeans/flow'
import type { Flow, FlowProvider } from '@owlmeans/flow'
import {
  AGENT_RUN_FLOW, AgentRunStep, AgentRunTransition, agentRunFlow, conversationFor, truncateAt,
} from '../src/index.js'

/**
 * A run's flow has to survive leaving the process, or the steps buy nothing: the whole reason the
 * lifecycle is a flow rather than a field is that a crashed run can be told where to resume. These
 * pin that the serialized form round-trips, which is also the gate on `@owlmeans/flow` being
 * usable server-side at all — it has no server consumer anywhere else in the monorepo.
 */
const provider: FlowProvider = async flow => {
  if (flow !== AGENT_RUN_FLOW) {
    throw new Error(`unknown flow ${flow}`)
  }
  return { ...agentRunFlow, config: {}, prefabs: {} } as Flow
}

describe('agent-common — the run lifecycle flow', () => {
  test('starts at Received and advances through the working steps', async () => {
    const model = await makeFlowModel(agentRunFlow)
    expect(model.step().step).toBe(AgentRunStep.Received)

    model.transit(AgentRunTransition.Prepare, true)
    expect(model.step().step).toBe(AgentRunStep.Prepared)

    model.transit(AgentRunTransition.Work, true)
    expect(model.step().step).toBe(AgentRunStep.Working)
  })

  test('offers exactly one automatic transition per working step', async () => {
    const model = await makeFlowModel(agentRunFlow)

    for (const expected of [AgentRunTransition.Prepare, AgentRunTransition.Work, AgentRunTransition.Finalize]) {
      // `next()` is what lets a driver advance without knowing the vocabulary; it only works while
      // exactly one outgoing transition is non-explicit. `Fail` is explicit for that reason.
      expect(model.next().transition).toBe(expected)
      model.transit(expected, true)
    }

    expect(model.step().step).toBe(AgentRunStep.Finalizing)
  })

  test('round-trips a mid-run state through its serialized form', async () => {
    const model = await makeFlowModel(agentRunFlow)
    model.transit(AgentRunTransition.Prepare, true)
    const token = model.transit(AgentRunTransition.Work, true)

    const restored = await makeFlowModel(token, provider)

    expect(restored.step().step).toBe(AgentRunStep.Working)
    expect(restored.state().flow).toBe(AGENT_RUN_FLOW)
    expect(restored.state().ok).toBe(true)
  })

  test('carries a failure and its message across serialization', async () => {
    const model = await makeFlowModel(agentRunFlow)
    model.transit(AgentRunTransition.Prepare, true)
    const token = model.transit(AgentRunTransition.Fail, false, 'the model refused')

    const restored = await makeFlowModel(token, provider)

    expect(restored.step().step).toBe(AgentRunStep.Failed)
    expect(restored.state().ok).toBe(false)
    expect(restored.state().message).toBe('the model refused')
  })
})

describe('agent-common — conversation identity', () => {
  test('derives the thread from a dedication and the scope from its target', () => {
    expect(conversationFor({ dedication: 'project:abc123' }))
      .toEqual({ conversationId: 'project:abc123', scope: 'abc123' })
  })

  test('degrades to a named default rather than an empty key', () => {
    // An empty conversation id would silently collapse every run of every subject into one thread.
    expect(conversationFor(undefined)).toEqual({ conversationId: 'anonymous', scope: 'anonymous' })
    expect(conversationFor({})).toEqual({ conversationId: 'anonymous', scope: 'anonymous' })
  })

  test('accepts an override for an application whose threads are not one per dedication', () => {
    expect(conversationFor({ dedication: 'story:s1' }, { scope: 'p1' }))
      .toEqual({ conversationId: 'story:s1', scope: 'p1' })
  })
})

describe('agent-common — truncation', () => {
  test('leaves text inside the budget untouched', () => {
    expect(truncateAt('  short  ', 100)).toBe('short')
  })

  test('never exceeds the budget', () => {
    const long = 'word '.repeat(500)
    expect(truncateAt(long, 40).length).toBeLessThanOrEqual(40)
  })

  test('cuts on a word boundary instead of mid-word', () => {
    const source = 'alpha beta gamma delta epsilon zeta'
    const result = truncateAt(source, 20)

    expect(result).toBe('alpha beta gamma…')
    // What was kept is a whole number of the original's words: the character the cut landed on is
    // the space that followed the last one it took.
    expect(source.startsWith(result.slice(0, -1))).toBe(true)
    expect(source.charAt(result.length - 1)).toBe(' ')
  })

  test('prefers a sentence end when one falls inside the budget tail', () => {
    expect(truncateAt('The first sentence ends here. Then a second one runs on.', 37))
      .toBe('The first sentence ends here.…')
  })

  test('falls back to a word break when the sentence end is too far back to keep', () => {
    // The boundary search only accepts a cut inside the last quarter of the budget — an earlier
    // sentence end would throw away most of what fits, which is worse than a clean word break.
    expect(truncateAt('One sentence here. And a second one that overflows.', 30))
      .toBe('One sentence here. And a…')
  })
})
