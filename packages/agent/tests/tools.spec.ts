import { describe, expect, test } from 'bun:test'
import { tool } from '@langchain/core/tools'
import * as z from 'zod'
import { isToolError, safeInvokeTool } from '../src/index.js'
import type { AgentToolSet } from '../src/index.js'

/**
 * No model involved: these pin the containment contract the tool loop depends on, which is what
 * keeps one bad argument from taking down a whole run. A rejected LangGraph task aborts the entire
 * superstep, so every sibling call in the same batch dies with it.
 */
const tools = {
  get_structured_list: tool(
    async ({ type }: { type: string }) => `listed:${type}`,
    {
      name: 'get_structured_list',
      description: 'Test double mirroring a real enum-argument tool.',
      schema: z.object({ type: z.enum(['ui-screens', 'ui-layout']) }),
    },
  ),
  explodes: tool(
    async () => { throw new Error('the tool itself failed') },
    {
      name: 'explodes',
      description: 'A tool that throws.',
      schema: z.object({}),
    },
  ),
} as unknown as AgentToolSet

const callOf = (name: string, args: Record<string, unknown>) =>
  ({ name, args, id: 'call_test', type: 'tool_call' as const })

describe('agent — tool invocation is contained', () => {
  test('passes a valid call through to the tool', async () => {
    expect(await safeInvokeTool(tools, callOf('get_structured_list', { type: 'ui-layout' })))
      .toBe('listed:ui-layout')
  })

  test('an out-of-enum argument resolves to an error naming the valid options', async () => {
    const result = await safeInvokeTool(tools, callOf('get_structured_list', { type: 'ui-navigation' }))

    expect(isToolError(result)).toBe(true)
    expect((result as { error: string }).error).toContain('ui-screens')
  })

  test('a throwing tool resolves to an error instead of rejecting', async () => {
    const result = await safeInvokeTool(tools, callOf('explodes', {}))

    expect(isToolError(result)).toBe(true)
    expect((result as { error: string }).error).toContain('the tool itself failed')
  })

  test('resolves a tool by its own name when the map key differs', async () => {
    // `bindTools` advertises `tool.name`, so that is what the model calls — a map keyed by a local
    // variable would otherwise lose the tool permanently.
    const mismatched = { some_local_name: tools.get_structured_list } as unknown as AgentToolSet

    expect(await safeInvokeTool(mismatched, callOf('get_structured_list', { type: 'ui-layout' })))
      .toBe('listed:ui-layout')
  })

  test('an unknown tool name resolves to an error instead of throwing', async () => {
    const result = await safeInvokeTool(tools, callOf('hallucinated_tool', {}))

    expect((result as { error: string }).error).toContain('not found')
  })
})
