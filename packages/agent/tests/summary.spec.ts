import { describe, expect, test } from 'bun:test'
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import type { LlmModel } from '@owlmeans/llm'
import { AgentRunStatus } from '@owlmeans/agent-common'
import { composeCompaction, composeRollingSummary, renderTranscript } from '../src/index.js'

/** A model double: the helpers only ever call `invoke` (structured) or `ask` (text). */
const answering = (answer: unknown): LlmModel => ({
  invoke: async () => answer,
  ask: async () => answer as string,
} as unknown as LlmModel)

const failing = (): LlmModel => ({
  invoke: async () => { throw new Error('budget exhausted') },
  ask: async () => { throw new Error('budget exhausted') },
} as unknown as LlmModel)

const conversation = [
  new HumanMessage({ content: 'rename the header' }),
  new AIMessage({ content: '', tool_calls: [{ name: 'write_file', args: {}, id: 'c1', type: 'tool_call' }] }),
  new ToolMessage({ tool_call_id: 'c1', name: 'write_file', content: 'written' }),
  new AIMessage({ content: 'Renamed the dashboard header.' }),
]

describe('agent — conversation compaction', () => {
  test('returns both parts, each inside its own cap', async () => {
    const result = await composeCompaction({
      model: answering({ summary: 'S'.repeat(5_000), advice: 'A'.repeat(5_000) }),
      prompt: 'rename the header',
      messages: conversation,
      status: AgentRunStatus.Ok,
      maxSummaryChars: 100,
      maxAdviceChars: 40,
    })

    // A cap in a prompt is a request; a cap in code is a cap.
    expect(result.summary.length).toBeLessThanOrEqual(100)
    expect(result.advice!.length).toBeLessThanOrEqual(40)
  })

  test('falls back to a usable event when the model fails', async () => {
    // An exhausted budget is the common case, and asking again would fail the same way — so the
    // fallback has to carry the facts the caller already holds rather than an apology.
    const result = await composeCompaction({
      model: failing(),
      prompt: 'rename the header',
      messages: conversation,
      status: AgentRunStatus.Failed,
      note: 'the fixer gave up',
    })

    expect(result.summary).toContain('rename the header')
    expect(result.summary).toContain('the fixer gave up')
    expect(result.advice).toBeUndefined()
  })

  test('treats an empty summary as a non-answer, not a short one', async () => {
    const result = await composeCompaction({
      model: answering({ summary: '   ', advice: 'do something' }),
      prompt: 'rename the header',
      messages: conversation,
      status: AgentRunStatus.Ok,
    })

    expect(result.summary).toContain('rename the header')
  })

  test('works with no model at all', async () => {
    const result = await composeCompaction({
      prompt: 'rename the header', messages: conversation, status: AgentRunStatus.Ok,
    })

    expect(result.summary).toContain('rename the header')
  })

  test('drops an empty advice rather than storing a blank field', async () => {
    const result = await composeCompaction({
      model: answering({ summary: 'did the thing', advice: '' }),
      prompt: 'p', messages: conversation, status: AgentRunStatus.Ok,
    })

    expect(result).toEqual({ summary: 'did the thing' })
  })
})

describe('agent — transcript rendering', () => {
  test('names the tools a message called when it carried no text', async () => {
    expect(renderTranscript(conversation)).toContain('called write_file')
  })

  test('keeps the tail when the budget binds', () => {
    // How a run ENDED is what decides what to do next, so the head is what goes.
    const long = [
      new HumanMessage({ content: 'A'.repeat(400) }),
      new AIMessage({ content: 'the final answer' }),
    ]

    const rendered = renderTranscript(long, 100)

    expect(rendered).toContain('the final answer')
    expect(rendered).not.toContain('AAAA')
  })
})

describe('agent — rolling summary', () => {
  test('caps the folded account', async () => {
    const result = await composeRollingSummary({
      model: answering('X'.repeat(9_000)),
      previous: 'the story so far',
      event: 'a story completed',
      maxChars: 120,
    })

    expect(result.length).toBeLessThanOrEqual(120)
  })

  test('keeps the previous account when the fold fails', async () => {
    // A failed fold costs detail, never the fact — the caller's own verbatim record of the event
    // is what preserves that, which is why history can be recorded unconditionally.
    const result = await composeRollingSummary({
      model: failing(),
      previous: 'the story so far',
      event: 'a story completed',
      maxChars: 3_000,
    })

    expect(result).toBe('the story so far')
  })

  test('starts from the event itself when nothing was recorded yet', async () => {
    const result = await composeRollingSummary({
      model: failing(), previous: '', event: 'project created', maxChars: 3_000,
    })

    expect(result).toBe('project created')
  })

  test('takes the deterministic path with no model', async () => {
    expect(await composeRollingSummary({
      previous: 'kept', event: 'ignored', maxChars: 3_000,
    })).toBe('kept')
  })
})
