import { describe, expect, test } from 'bun:test'
import { ModelTaskMode, ModelTaskResultKind, ModelTier } from '@owlmeans/viable-common'
import type { ModelTask } from '@owlmeans/viable-common'
import { makeModelTaskDriver } from '../src/task/driver.js'
import type { LangchainLikeModel } from '../src/types.js'

const answering = (content: string): LangchainLikeModel => ({
  invoke: async () => ({ content }) as never,
})

const driverFor = (content: string) =>
  makeModelTaskDriver({ models: { [ModelTier.Standard]: answering(content) } })

const toolTask = (): ModelTask => ({
  id: 't1',
  projectId: 'p1',
  role: 'coder',
  tier: ModelTier.Standard,
  effort: 'low',
  attempt: 0,
  mode: ModelTaskMode.Tools,
  messages: [{ role: 'user', content: 'do it' }],
  tools: [{ name: 'write_file', parameters: {} }],
} as unknown as ModelTask)

describe('what a parent agent hands back for a tool-call task', () => {
  test('a JSON array is the documented shape', async () => {
    const result = await driverFor('[{"name":"write_file","args":{"path":"a.ts"}}]')
      .answer(toolTask())

    expect(result.kind).toBe(ModelTaskResultKind.ToolCalls)
    expect(result.toolCalls).toEqual([{ name: 'write_file', args: { path: 'a.ts' } }])
  })

  test('a single call as a bare object is accepted, not a crash', async () => {
    // The instruction asks for an array and models mostly comply, but a single call comes back
    // bare often enough that assuming the array is a defect. The cast used to blow up with
    // `parsed.map is not a function`, the TypeError was handed back as the answer, and the model
    // ladder retried against feedback that said nothing about what was wrong — a whole delegated
    // run failed with `retry-exceeded` for this.
    const result = await driverFor('{"name":"write_file","args":{"path":"a.ts"}}').answer(toolTask())

    expect(result.kind).toBe(ModelTaskResultKind.ToolCalls)
    expect(result.toolCalls).toEqual([{ name: 'write_file', args: { path: 'a.ts' } }])
  })

  test('an array wrapped in tool_calls is accepted', async () => {
    const result = await driverFor('{"tool_calls":[{"name":"write_file"}]}').answer(toolTask())

    expect(result.toolCalls).toEqual([{ name: 'write_file', args: {} }])
  })

  test('a fenced answer is unwrapped', async () => {
    const result = await driverFor('```json\n[{"name":"write_file"}]\n```').answer(toolTask())

    expect(result.toolCalls).toEqual([{ name: 'write_file', args: {} }])
  })

  test('prose is the model saying it is finished, not a bad answer', async () => {
    // A model with tools bound ends its turn by NOT calling one. Refusing that stalls the agent
    // loop it was ending: every attempt gives the same reply, and the run dies of exhausted
    // retries with nothing actually wrong.
    const result = await driverFor('Everything asked for is already in place.').answer(toolTask())

    expect(result.kind).toBe(ModelTaskResultKind.Text)
    expect(result.text).toContain('already in place')
  })

  test('valid JSON naming no tool call is read the same way', async () => {
    const result = await driverFor('{"thoughts":"none"}').answer(toolTask())

    expect(result.kind).toBe(ModelTaskResultKind.Text)
  })

  test('a call with no name is refused with a reason a model can act on', async () => {
    const result = await driverFor('[{"args":{}}]').answer(toolTask())

    expect(result.kind).toBe(ModelTaskResultKind.Error)
    expect(result.error).toContain('name')
  })
})
