import { describe, expect, test } from 'bun:test'
import { ConnectHarness, ConnectLlm, ConnectTarget, type ModelTask, type ModelTaskResult } from '@owlmeans/viable-common'
import { registerCatalogue } from '../src/tools/mcp.js'
import { ToolHostKind } from '../src/tools/consts.js'
import { TaskQueue } from '../src/session/tasks.js'
import type { McpServerLike, McpToolAnswer, ToolDeps, ToolHost } from '../src/tools/types.js'
import type { SessionRuntime } from '../src/types.js'

const delegatedHost = (patch: Partial<ToolHost> = {}): ToolHost => ({
  kind: ToolHostKind.Stdio,
  target: ConnectTarget.Local,
  llm: ConnectLlm.Local,
  harness: ConnectHarness.ClaudeCode,
  hasExecutor: true,
  ...patch,
})

const projectStatus = (id: string) => ({
  project: { id, name: 'Store finder', alias: 'store-finder', status: 'draft', intrinsic: 'planned' },
  agent: { locked: false },
  local: true,
  updatedAt: '2026-10-06T00:00:00.000Z',
})

const checkTask = (id: string): ModelTask => ({
  id, projectId: '', role: 'moderator', tier: 'cheap', effort: 'low', attempt: 0,
  mode: 'text', messages: [{ role: 'user', content: 'is this prompt acceptable?' }],
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
} as unknown as ModelTask)

/**
 * A session over a REAL task queue — what the handover races — and a platform whose create call
 * blocks on a model task exactly as a synchronous check does: it files the task, and answers only
 * once the parent submitted it.
 */
const harness = (opts: {
  blocksOnTask?: boolean, refuse?: boolean, host?: ToolHost, attached?: string | null
} = {}) => {
  const tasks = new TaskQueue()
  const order: string[] = []
  const created: unknown[][] = []
  let attached = opts.attached ?? null
  let opened: { bound: string | null, id: string } | null = null
  const submitted = new Map<string, (result: ModelTaskResult) => void>()

  const runtime = (id: string): SessionRuntime => ({
    session: { id } as never,
    stats: {} as never,
    nextTask: async (wait, signal) => await tasks.take(wait, signal),
    taskAvailable: async (wait, signal) => await tasks.available(wait, signal),
    taskById: taskId => tasks.outstandingById(taskId),
    outstandingTasks: () => tasks.outstandingTasks(),
    submitTask: async result => {
      tasks.settle(result.taskId)
      submitted.get(result.taskId)?.(result)
    },
    pendingTasks: () => tasks.size(),
    nextQuestion: async () => null,
    questionById: () => null,
    outstandingQuestions: () => [],
    answerQuestion: async () => undefined,
    pendingQuestions: () => 0,
    close: async () => undefined,
  })
  let current: SessionRuntime | null = null

  const deps = {
    host: opts.host ?? delegatedHost(),
    api: {
      project: {
        create: async (...args: unknown[]) => {
          created.push(args)
          order.push(`create:${String(args[2] ?? '-')}`)
          if (opts.blocksOnTask !== false) {
            const answer = new Promise<ModelTaskResult>(resolve => submitted.set('t1', resolve))
            tasks.push(checkTask('t1'), 'op1')
            await answer
            if (opts.refuse === true) throw new Error('platform unreachable')
          }

          return projectStatus('p-new')
        },
      },
    },
    session: async () => {
      if (opened == null || opened.bound !== attached) {
        opened = { bound: attached, id: `s-${attached ?? 'none'}` }
        order.push(`session:${attached ?? 'none'}`)
        current = runtime(opened.id)
      }

      return current!
    },
    currentSession: () => current,
    attached: () => attached,
    attach: (projectId: string) => {
      if (projectId !== attached) order.push(`attach:${projectId}`)
      attached = projectId
    },
    detach: () => {
      order.push('detach')
      attached = null
    },
    log: () => undefined,
  } as unknown as ToolDeps

  const callbacks = new Map<string, (args: Record<string, unknown>) => Promise<McpToolAnswer>>()
  const server: McpServerLike = { registerTool: (name, _config, cb) => { callbacks.set(name, cb) } }
  registerCatalogue(server, deps)
  const call = async (name: string, args: Record<string, unknown>): Promise<McpToolAnswer> => {
    const cb = callbacks.get(name)
    if (cb == null) throw new Error(`no tool ${name}`)

    return await cb(args)
  }
  const textOf = (answer: McpToolAnswer): string => answer.content.map(part => part.text).join('\n')

  return { call, textOf, order, created, callbacks }
}

describe('viable-sdk — the delegated mode hands a blocked call\'s model task to its parent', () => {
  test('a task arriving first is the answer, and submitting it replies with the call\'s result', async () => {
    const { call, textOf, order } = harness()

    const first = await call('create_project', { prompt: 'a store finder' })

    expect(first.isError).not.toBe(true)
    expect(textOf(first)).toContain('create_project is NOT finished')
    expect(textOf(first)).toContain('Do not call create_project again')
    // The task, rendered exactly as next_task renders it.
    expect(textOf(first)).toContain('is this prompt acceptable?')
    expect(first.structuredContent).toMatchObject({ taskId: 't1', waitingOn: 'create_project' })

    const submitted = await call('submit_task_result', { taskId: 't1', result: 'acceptable' })

    expect(submitted.isError).not.toBe(true)
    expect(textOf(submitted)).toContain('Accepted.')
    expect(textOf(submitted)).toContain('--- create_project finished ---')
    expect(textOf(submitted)).toContain('Store finder (store-finder) · p-new')
    expect(submitted.structuredContent).toMatchObject({ settled: [{ tool: 'create_project' }] })
    // The checks went to a session naming no project; the drafting goes to the project's own.
    expect(order).toEqual(['session:none', 'create:s-none', 'attach:p-new', 'session:p-new'])
  })

  test('a call finishing first answers as it always did', async () => {
    const { call, textOf } = harness({ blocksOnTask: false })

    const answer = await call('create_project', { prompt: 'a store finder' })

    expect(textOf(answer)).toContain('Store finder (store-finder) · p-new')
    expect(textOf(answer)).not.toContain('NOT finished')
  })

  test('an identical repeat joins the running call instead of starting another', async () => {
    const { call, textOf, created } = harness()

    const first = await call('create_project', { prompt: 'a store finder' })
    expect(textOf(first)).toContain('NOT finished')

    // The parent ignored "do not call it again": the repeat waits on the SAME call, and gets its
    // answer once the task it is blocked on comes back.
    const repeat = call('create_project', { prompt: 'a store finder' })
    const submitted = await call('submit_task_result', { taskId: 't1', result: 'acceptable' })

    expect(textOf(await repeat)).toContain('Store finder (store-finder) · p-new')
    expect(created).toHaveLength(1)
    // The waiting repeat answered with the result, so the submit has nothing more to report.
    expect(textOf(submitted)).not.toContain('--- create_project finished ---')
  })

  test('next_task names a call still running rather than answering "nothing"', async () => {
    const { call, textOf } = harness()

    await call('create_project', { prompt: 'a store finder' })
    const later = await call('next_task', { maxWaitSec: 0 })

    // Nothing settled and nothing new yet: the call is named as still running.
    expect(later.isError).not.toBe(true)
    expect(textOf(later)).toContain('create_project still running on the platform')
    expect(later.structuredContent).toMatchObject({ settled: [], running: ['create_project'] })
  })

  test('a refused call is reported by the task loop as a sentence, never as a failed submit', async () => {
    const { call, textOf } = harness({ refuse: true })

    await call('create_project', { prompt: 'a store finder' })
    const submitted = await call('submit_task_result', { taskId: 't1', result: 'acceptable' })

    // The SUBMIT worked; what failed was the call it unblocked, and that is said in its own place.
    expect(submitted.isError).not.toBe(true)
    expect(textOf(submitted)).toContain('--- create_project was refused ---')
    expect(submitted.structuredContent).toMatchObject({ settled: [{ tool: 'create_project', isError: true }] })
  })
})

describe('viable-sdk — a delegated create names the unattached session it sends', () => {
  test('an attached connector is detached first, and moved onto the new project after', async () => {
    const { call, order, created } = harness({ blocksOnTask: false, attached: 'p-old' })

    await call('create_project', { prompt: 'a store finder' })

    expect(created[0]).toEqual(['a store finder', ConnectTarget.Local, 's-none'])
    expect(order).toEqual(['detach', 'session:none', 'create:s-none', 'attach:p-new', 'session:p-new'])
  })

  test('the cloud mode sends no session and opens none', async () => {
    const { call, order, created } = harness({ blocksOnTask: false, host: delegatedHost({ llm: ConnectLlm.Cloud }) })

    await call('create_project', { prompt: 'a store finder' })

    expect(created[0]?.[2]).toBeUndefined()
    expect(order).toEqual(['create:-', 'attach:p-new'])
  })
})
