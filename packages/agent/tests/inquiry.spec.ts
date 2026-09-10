import { describe, expect, test } from 'bun:test'
import { isFatalError } from '@owlmeans/llm'
import { InquiryDeclined, InquiryUnavailable } from '@owlmeans/llm'
import { InquiryKind } from '@owlmeans/llm-common'
import type { Inquiry, InquiryAnswer } from '@owlmeans/llm-common'
import { ASK_USER_TOOL, inquiryPlugin, isToolError, safeInvokeTool } from '../src/index.js'
import type { AgentRun, AgentToolSet } from '../src/index.js'

/**
 * The `ask_user` tool, and the one distinction the whole plugin exists to keep: NO channel is an
 * answerable situation the model is told to decide for itself, while a channel that WAS there and
 * has gone is terminal. Everything else comes back as a tool error, because a rejected tool call
 * aborts the whole superstep it belongs to.
 */

const run = {} as AgentRun

const toolsOf = (
  ask?: (inquiry: Inquiry, run: AgentRun) => Promise<InquiryAnswer | null>,
): AgentToolSet => inquiryPlugin(ask != null ? { ask } : {}).tools?.(run) ?? {}

const callOf = (args: Record<string, unknown>) =>
  ({ name: ASK_USER_TOOL, args, id: 'call_test', type: 'tool_call' as const })

const asking = { question: 'Which product is this?', kind: InquiryKind.Text }

describe('agent — the inquiry plugin', () => {
  test('offers no tool and says nothing when there is no channel', async () => {
    // A tool nobody can serve is one the model tries once and remembers as broken.
    const plugin = inquiryPlugin()

    expect(Object.keys(plugin.tools?.(run) ?? {})).toEqual([])
    expect(await plugin.context?.(run)).toEqual([])
  })

  test('contributes exactly one paragraph, naming the tool, when a channel is wired', async () => {
    const contributed = await inquiryPlugin({ ask: async () => null }).context?.(run) ?? []

    expect(contributed).toHaveLength(1)
    expect(contributed[0]).toContain(ASK_USER_TOOL)
  })

  test('an answer comes back as JSON', async () => {
    const tools = toolsOf(async inquiry => ({ inquiryId: inquiry.id, value: 'a' }))

    const result = await safeInvokeTool(tools, callOf(asking))

    expect(JSON.parse(result as string).value).toBe('a')
  })

  test('carries the question the model wrote through to the channel', async () => {
    const seen: Inquiry[] = []
    const tools = toolsOf(async inquiry => {
      seen.push(inquiry)

      return { inquiryId: inquiry.id, value: 'x' }
    })

    await safeInvokeTool(tools, callOf({
      question: 'Which one?', kind: InquiryKind.Choice, context: 'two candidates',
      options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
    }))

    expect(seen[0].question).toBe('Which one?')
    expect(seen[0].options).toHaveLength(2)
    // The id is minted here: it is what routes an answer back, and the model never chooses it.
    expect(seen[0].id.length).toBeGreaterThan(0)
  })

  test('refuses a choice that is not one, without spending the channel', async () => {
    let reached = false
    const tools = toolsOf(async inquiry => {
      reached = true

      return { inquiryId: inquiry.id, value: 'a' }
    })

    const result = await safeInvokeTool(tools, callOf({
      question: 'Which one?', kind: InquiryKind.Choice, options: [{ value: 'a', label: 'A' }],
    }))

    expect(isToolError(result)).toBe(true)
    expect((result as { error: string }).error).toContain('between 2 and')
    expect(reached).toBe(false)
  })

  test('tells the model to decide for itself when nobody is there', async () => {
    const result = await safeInvokeTool(toolsOf(async () => null), callOf(asking))

    expect(isToolError(result)).toBe(true)
    expect((result as { error: string }).error).toContain('Decide yourself')
  })

  test('reads a decline as an answer the model must act on, not as a failure', async () => {
    const tools = toolsOf(async () => { throw new InquiryDeclined('q1') })

    const result = await safeInvokeTool(tools, callOf(asking))

    expect(isToolError(result)).toBe(true)
    expect((result as { error: string }).error).toContain('declined')
  })

  test('lets a channel that has GONE escape the tool loop', async () => {
    // Registered fatal beside its throw, so the standard predicate finds it. Contained instead, it
    // would cost the agent all 64 turns on a channel that will never answer.
    const tools = toolsOf(async () => { throw new InquiryUnavailable('connector') })

    expect(isFatalError(new InquiryUnavailable('connector'))).not.toBeNull()
    await expect(safeInvokeTool(tools, callOf(asking), e => isFatalError(e) != null))
      .rejects.toThrow(/unavailable/)
  })

  test('contains any other channel failure as a tool error', async () => {
    const tools = toolsOf(async () => { throw new Error('the socket died') })

    const result = await safeInvokeTool(tools, callOf(asking), e => isFatalError(e) != null)

    expect(isToolError(result)).toBe(true)
    expect((result as { error: string }).error).toContain('the socket died')
  })
})
