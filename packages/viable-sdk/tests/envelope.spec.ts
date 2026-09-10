import { describe, expect, test } from 'bun:test'
import { ConnectHarness, ModelTaskMode, ModelTaskResultKind, ModelTaskRole } from '@owlmeans/viable-common'
import type { ModelTask } from '@owlmeans/viable-common'
import { parseTaskResult, renderTaskEnvelope } from '../src/task/envelope.js'

const task = (patch: Partial<ModelTask> = {}): ModelTask => ({
  id: 'T1',
  projectId: 'p1',
  role: 'senior-developer',
  tier: 'strong' as ModelTask['tier'],
  attempt: 0,
  mode: ModelTaskMode.Text,
  system: 'you write TypeScript',
  messages: [{ role: ModelTaskRole.User, content: 'write a function' }],
  expiresAt: new Date().toISOString(),
  ...patch,
})

describe('viable-sdk — what the parent agent is told', () => {
  test('names the task, the follow-up call and the isolation, before the material', () => {
    const text = renderTaskEnvelope(task(), { harness: ConnectHarness.ClaudeCode })

    expect(text).toContain('T1')
    expect(text).toContain('submit_task_result')
    // The instruction has to precede the conversation: a model that stops reading early must
    // still have read what it is being asked to do.
    expect(text.indexOf('HOW TO RUN THIS')).toBeLessThan(text.indexOf('--- CONVERSATION'))
    expect(text).toContain('do not answer it yourself')
  })

  test('asks each harness for isolation in its own vocabulary', () => {
    expect(renderTaskEnvelope(task(), { harness: ConnectHarness.ClaudeCode })).toContain('viable-worker')
    expect(renderTaskEnvelope(task(), { harness: ConnectHarness.Codex })).toContain('INLINE')
    expect(renderTaskEnvelope(task(), { harness: ConnectHarness.OpenCode })).toContain('@viable-worker')
    // A harness nobody wrote a block for still gets the request, stated rather than mechanised.
    expect(renderTaskEnvelope(task(), { harness: ConnectHarness.Other })).toContain('fresh, isolated context')
  })

  test('a retry says so, and why the previous answer was refused', () => {
    const text = renderTaskEnvelope(
      task({ attempt: 1, feedback: 'not valid JSON' }), { harness: ConnectHarness.Codex }
    )

    expect(text).toContain('attempt 2')
    expect(text).toContain('not valid JSON')
  })

  test('carries the schema for a structured answer and the tools for an open one', () => {
    const json = renderTaskEnvelope(
      task({ mode: ModelTaskMode.Json, outputSchema: { type: 'object' } }),
      { harness: ConnectHarness.Other }
    )
    expect(json).toContain('OUTPUT SCHEMA')
    expect(json).toContain('ONE JSON object')

    const tools = renderTaskEnvelope(
      task({ mode: ModelTaskMode.Tools, tools: [{ name: 'read', parameters: {} }] }),
      { harness: ConnectHarness.Other }
    )
    expect(tools).toContain('TOOLS THE SUBAGENT MAY CALL')
    expect(tools).toContain('read')
  })

  test('names the model the parent said it would use, when it said', () => {
    const text = renderTaskEnvelope(task(), {
      harness: ConnectHarness.ClaudeCode, tiers: { strong: 'opus' },
    })

    expect(text).toContain('run on: opus')
  })
})

describe('viable-sdk — checking the answer before the platform sees it', () => {
  test('text passes through verbatim', () => {
    const { result } = parseTaskResult(task(), '  hello  ')

    expect(result?.kind).toBe(ModelTaskResultKind.Text)
    expect(result?.text).toBe('  hello  ')
  })

  test('a fenced JSON answer is unwrapped rather than refused', () => {
    // Models fence JSON however firmly they are told not to; refusing that would cost a whole
    // retry for a formatting habit.
    const { result } = parseTaskResult(
      task({ mode: ModelTaskMode.Json }), '```json\n{"a":1}\n```'
    )

    expect(result?.json).toEqual({ a: 1 })
  })

  test('prose where JSON was asked for is refused with an instruction, not an error', () => {
    const { result, problem } = parseTaskResult(task({ mode: ModelTaskMode.Json }), 'Sure! Here you go.')

    expect(result).toBeUndefined()
    expect(problem).toContain('valid JSON')
  })

  test('an array where one object was asked for is refused', () => {
    const { problem } = parseTaskResult(task({ mode: ModelTaskMode.Json }), '[{"a":1}]')

    expect(problem).toContain('single JSON object')
  })

  test('a tool the task never offered is refused, and the refusal names what is available', () => {
    const { problem } = parseTaskResult(
      task({ mode: ModelTaskMode.Tools, tools: [{ name: 'read', parameters: {} }] }),
      '[{"name":"rm","args":{}}]'
    )

    expect(problem).toContain('rm')
    expect(problem).toContain('read')
  })

  test('a valid tool call list is accepted, and missing args default to empty', () => {
    const { result } = parseTaskResult(
      task({ mode: ModelTaskMode.Tools, tools: [{ name: 'read', parameters: {} }] }),
      '[{"name":"read"}]'
    )

    expect(result?.toolCalls).toEqual([{ name: 'read', args: {} }])
  })

  test('an empty answer is refused with the one instruction that fixes it', () => {
    expect(parseTaskResult(task(), '   ').problem).toContain('empty')
    expect(parseTaskResult(task(), null).problem).toContain('empty')
  })
})

describe('a tools task ends with a call or with the last word', () => {
  const toolTask = {
    id: 't1', projectId: 'p1', role: 'coder', tier: 'strong', effort: 'low', attempt: 0,
    mode: 'tools', messages: [{ role: 'user', content: 'go' }],
    tools: [{ name: 'write_file', parameters: {} }],
  } as never

  test('a JSON array of calls is the documented shape', () => {
    const { result, problem } = parseTaskResult(toolTask, '[{"name":"write_file","args":{}}]')

    expect(problem).toBeUndefined()
    expect(result?.toolCalls).toEqual([{ name: 'write_file', args: {} }])
  })

  test('a single call sent bare is accepted', () => {
    const { result } = parseTaskResult(toolTask, '{"name":"write_file"}')

    expect(result?.toolCalls).toEqual([{ name: 'write_file', args: {} }])
  })

  test('prose is the model finishing, and is accepted as text', () => {
    // Refusing it stalls the agent loop it was ending — the run then dies of exhausted retries
    // with nothing wrong anywhere.
    const { result, problem } = parseTaskResult(toolTask, 'Nothing left to change.')

    expect(problem).toBeUndefined()
    expect(result?.kind).toBe('text')
    expect(result?.text).toContain('Nothing left')
  })

  test('a tool the task never offered is still refused', () => {
    const { problem } = parseTaskResult(toolTask, '[{"name":"rm_rf","args":{}}]')

    expect(problem).toContain('write_file')
  })
})

describe('a JSON answer is checked against the schema before the platform sees it', () => {
  const jsonTask = {
    id: 't2', projectId: 'p1', role: 'middle-ba', tier: 'standard', effort: 'low', attempt: 0,
    mode: 'json', messages: [{ role: 'user', content: 'go' }],
    outputSchema: {
      type: 'object',
      properties: { entities: { type: 'array', items: { type: 'string' } } },
      required: ['entities'],
    },
  } as never

  test('an answer that satisfies the schema is accepted', () => {
    const { result, problem } = parseTaskResult(jsonTask, '{"entities":["Task"]}')

    expect(problem).toBeUndefined()
    expect(result?.json).toEqual({ entities: ['Task'] })
  })

  test('a missing required field is refused HERE, naming the field', () => {
    // The subagent's context is still open at this point, so the parent can ask again cheaply. A
    // mismatch the platform catches instead costs a whole round trip, a new task and another wait.
    const { problem } = parseTaskResult(jsonTask, '{"other":1}')

    expect(problem).toContain('OUTPUT SCHEMA')
    expect(problem).toContain('entities')
  })

  test('a wrong type is refused with the path that is wrong', () => {
    const { problem } = parseTaskResult(jsonTask, '{"entities":"Task"}')

    expect(problem).toContain('/entities')
  })

  test('a schema we cannot compile never refuses an answer', () => {
    // An answer must not be rejected because of an inability of ours to check it — the platform
    // validates again either way.
    const broken = { ...(jsonTask as never as Record<string, unknown>), outputSchema: { type: 'nonsense' } }
    const { result, problem } = parseTaskResult(broken as never, '{"anything":true}')

    expect(problem).toBeUndefined()
    expect(result?.json).toEqual({ anything: true })
  })
})

describe('the block telling a parent HOW to run a task', () => {
  const task = {
    id: 't1', projectId: 'p1', role: 'coder', tier: 'strong', effort: 'low', attempt: 0,
    mode: 'text', messages: [{ role: 'user', content: 'go' }],
  } as never

  test('no harness asserts the worker already exists', () => {
    // `install_harness` is what writes it, nothing in the flow requires that to have been run, and
    // a block naming the file as a fact sent a literal agent to a subagent type it did not have —
    // on the first task, before it had done anything.
    for (const harness of ['claude-code', 'codex', 'copilot', 'opencode', 'other'] as const) {
      const text = renderTaskEnvelope(task, { harness })
      if (!text.includes('viable-worker')) continue
      expect(text).toContain('install_harness')
    }
  })

  test('every harness offers a way through when the worker is absent', () => {
    for (const harness of ['claude-code', 'codex', 'copilot', 'opencode', 'other'] as const) {
      const text = renderTaskEnvelope(task, { harness }).toLowerCase()

      expect(text.includes('inline') || text.includes('isolated context')).toBe(true)
    }
  })
})
