import { describe, expect, test } from 'bun:test'
import { ResilientError } from '@owlmeans/error'
import { CommitState, TransitionAction, WorkcardConflict } from '@owlmeans/planning'
import {
  CONNECT_CALL_COLLECT_WAIT_SEC, CONNECT_CALL_HEADER, CONNECT_TOKEN_PREFIX, ConnectCallLost, ConnectCallState,
  ConnectHarness, ConnectLlm, ConnectOutOfCredits, ConnectTarget, connect, connectRef, VIABLE_STORY_TYPE,
  type ModelTask, type ModelTaskResult,
} from '@owlmeans/viable-common'

import { makeRemoteConnectorApi } from '../src/api/remote.js'
import { TOOL_DEADLINE_MS } from '../src/consts.js'
import { makeSdkContext } from '../src/context/index.js'
import { TaskQueue } from '../src/session/tasks.js'
import { ToolHostKind } from '../src/tools/consts.js'
import { registerCatalogue } from '../src/tools/mcp.js'
import { refusalHelper } from '../src/tools/refusal.js'
import type { McpServerLike, McpToolAnswer, ToolDeps } from '../src/tools/types.js'
import type { SessionRuntime } from '../src/types.js'
import { accepted, captureTransport, type CapturedCall } from './context.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** Port 9 is discard: a call that escaped the captured client would say so. */
const contextOf = async (llm?: ConnectLlm) => await makeSdkContext({
  apiUrl: 'http://127.0.0.1:9', token: `${CONNECT_TOKEN_PREFIX}offline_test_token`, ...(llm != null ? { llm } : {}),
})

const projectStatus = (id: string) => ({
  project: { id, name: 'Store finder', alias: 'store-finder', status: 'draft', intrinsic: 'planned' },
  agent: { locked: false },
  local: true,
  updatedAt: '2026-10-06T00:00:00.000Z',
})

const callIdOf = (call: CapturedCall): string => String(call.headers?.[CONNECT_CALL_HEADER] ?? '')

const collects = (calls: CapturedCall[]): CapturedCall[] => calls.filter(call => call.alias === connect.call.collect)

const marshalled = (error: Error): string => ResilientError.marshal(error).message

describe('viable-sdk — a delegated write is named with x-viable-call', () => {
  test('only in the delegated mode, and only on a non-GET request', async () => {
    for (const llm of [undefined, ConnectLlm.Cloud, ConnectLlm.Local]) {
      const context = await contextOf(llm)
      const calls = captureTransport(context, call => call.alias.endsWith(':card:list')
        ? { items: [], total: 0 }
        : call.alias.endsWith(':execute')
          ? { transition: { id: 't1', card: 'c1', seq: 1, action: TransitionAction.Create, commit: { state: CommitState.Committed } } }
          : projectStatus('p1'))
      const api = makeRemoteConnectorApi(context)

      await api.project.create('a store finder')
      await api.project.status('p1')
      await api.planning.cards.list({ parent: 'p1' } as never)
      await api.planning.execute({ action: TransitionAction.Create, card: { kind: 'card', type: VIABLE_STORY_TYPE, parent: 'p1', title: 'x' } } as never)

      const named = calls.map(call => [call.alias, callIdOf(call) !== ''])
      const delegated = llm === ConnectLlm.Local
      expect(named).toEqual([
        [connect.project.create, delegated],
        [connect.project.status, false],
        [expect.stringContaining(':card:list'), false],
        [expect.stringContaining(':execute'), delegated],
      ])
      if (delegated) {
        expect(callIdOf(calls[0]!)).toMatch(UUID)
        expect(callIdOf(calls[3]!)).toMatch(UUID)
        // A fresh id per call.
        expect(callIdOf(calls[0]!)).not.toBe(callIdOf(calls[3]!))
      }
    }
  })

  test('a request that already names its call keeps the id, so a retry is the same call', async () => {
    const context = await contextOf(ConnectLlm.Local)
    const calls = captureTransport(context, () => projectStatus('p1'))
    // One request object sent twice — what a retry of that request is.
    const request = { params: { id: 'p1' }, body: { prompt: 'x' }, headers: {} } as never

    await context.entrypoint(connectRef.project.modify).call(request)
    await context.entrypoint(connectRef.project.modify).call(request)

    expect(callIdOf(calls[0]!)).toMatch(UUID)
    expect(callIdOf(calls[1]!)).toBe(callIdOf(calls[0]!))
  })
})

describe('viable-sdk — an early { pending } answer is collected until the call settles', () => {
  test('a connector call resolves with the settled value, collected by long polls under the tool deadline', async () => {
    const context = await contextOf(ConnectLlm.Local)
    let hops = 0
    const calls = captureTransport(context, async call => {
      if (call.alias === connect.project.create) return accepted({ pending: callIdOf(call) })
      // Held like the platform holds it — past the fast-answer pause.
      await Bun.sleep(1_050)
      return ++hops < 2
        ? { state: ConnectCallState.Pending }
        : { state: ConnectCallState.Settled, outcome: 'ok', value: projectStatus('p-new') }
    })
    const api = makeRemoteConnectorApi(context)

    const status = await api.project.create('a store finder')

    expect(status).toEqual(projectStatus('p-new') as never)
    const callId = callIdOf(calls[0]!)
    expect(collects(calls).map(call => [call.path, call.query, (call as { timeout?: number }).timeout]))
      .toEqual([
        ['/connect/call/:callId', { wait: CONNECT_CALL_COLLECT_WAIT_SEC }, (CONNECT_CALL_COLLECT_WAIT_SEC + 10) * 1000],
        ['/connect/call/:callId', { wait: CONNECT_CALL_COLLECT_WAIT_SEC }, (CONNECT_CALL_COLLECT_WAIT_SEC + 10) * 1000],
      ])
    // The collect itself is a read: it names nothing, and the initial request keeps the tool deadline.
    expect(collects(calls).every(call => callIdOf(call) === '')).toBe(true)
    expect(calls[0]!.timeout).toBe(TOOL_DEADLINE_MS)
    expect(callId).toMatch(UUID)
  })

  test('a planning execute through the planning client resolves with the receipt the direct answer would give', async () => {
    const context = await contextOf(ConnectLlm.Local)
    const transition = { id: 't1', card: 'c1', seq: 1, action: TransitionAction.Create, commit: { state: CommitState.Committed } }
    const card = { id: 'c1', kind: 'card', type: VIABLE_STORY_TYPE, title: 'x', seq: 1, createdAt: '2026-10-09T00:00:00.000Z' }
    const calls = captureTransport(context, call => call.alias.endsWith(':execute')
      ? accepted({ pending: callIdOf(call) })
      : { state: ConnectCallState.Settled, outcome: 'ok', value: { transition, card } })
    const { planning } = makeRemoteConnectorApi(context)

    const receipt = await planning.execute({
      action: TransitionAction.Create, card: { kind: 'card', type: VIABLE_STORY_TYPE, parent: 'p1', title: 'x' },
    } as never, { wait: true })

    expect(receipt.transition).toEqual({ ...transition, entityId: '' } as never)
    expect(receipt.card).toEqual({ ...card, entityId: '' } as never)
    expect(collects(calls)).toHaveLength(1)
  })

  test('a settled error is rethrown as its own class — a connector refusal and a planning refusal', async () => {
    const context = await contextOf(ConnectLlm.Local)
    const credits = new ConnectOutOfCredits(ConnectOutOfCredits.encode('modify', 1.5, 0.25, 'https://x.test/top-up'))
    let collectsSeen = 0
    captureTransport(context, call => {
      if (call.alias === connect.project.modify || call.alias.endsWith(':execute')) {
        return accepted({ pending: callIdOf(call) })
      }
      // The first call collected is the modify, the second the planning execute.
      return {
        state: ConnectCallState.Settled,
        error: marshalled(collectsSeen++ === 0 ? credits : new WorkcardConflict('c1')),
      }
    })
    const api = makeRemoteConnectorApi(context)

    const refused = await api.project.modify('p1', 'more maps').catch(e => e)
    expect(refused).toBeInstanceOf(ConnectOutOfCredits)
    expect([refused.gate, refused.requiredUsd, refused.balanceUsd, refused.topUpUrl])
      .toEqual(['modify', 1.5, 0.25, 'https://x.test/top-up'])

    const conflict = await api.planning.execute({ card: 'c1', action: TransitionAction.Update, changes: { title: 'y' } } as never)
      .catch(e => e)
    expect(conflict).toBeInstanceOf(WorkcardConflict)
  })

  test('a lost call throws ConnectCallLost, phrased to read the status tool before repeating', async () => {
    const context = await contextOf(ConnectLlm.Local)
    captureTransport(context, call => call.alias === connect.project.confirm
      ? accepted({ pending: callIdOf(call) })
      : { state: ConnectCallState.Lost })
    const api = makeRemoteConnectorApi(context)

    const lost = await api.project.confirm('p1', {}).catch(e => e)

    expect(lost).toBeInstanceOf(ConnectCallLost)
    expect(lost.message).toContain('viable-connect:call-lost:')
    const phrase = refusalHelper.refusalPhrase(lost)
    expect(phrase).toContain('lost the outcome')
    expect(phrase).toContain('project_status')
    expect(phrase).not.toContain('viable-connect:')
  })

  test('a dropped collect hop is asked again; one that keeps dropping fails the call', async () => {
    const reset = () => Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })
    const context = await contextOf(ConnectLlm.Local)
    let hops = 0
    captureTransport(context, call => {
      if (call.alias === connect.project.rename) return accepted({ pending: callIdOf(call) })
      if (++hops === 1) throw reset()
      return { state: ConnectCallState.Settled, value: projectStatus('p1') }
    })
    expect(await makeRemoteConnectorApi(context).project.rename('p1', 'Maps')).toEqual(projectStatus('p1') as never)

    const dead = await contextOf(ConnectLlm.Local)
    captureTransport(dead, call => {
      if (call.alias === connect.project.rename) return accepted({ pending: callIdOf(call) })
      throw reset()
    })
    await expect(makeRemoteConnectorApi(dead).project.rename('p1', 'Maps')).rejects.toThrow('ECONNRESET')
  })

  test('an ordinary answer is untouched — a direct value, a pending of another id, a refusal, and the cloud mode', async () => {
    const context = await contextOf(ConnectLlm.Local)
    const calls = captureTransport(context, call => {
      if (call.alias === connect.project.reinit) throw new WorkcardConflict('p1')
      if (call.alias === connect.project.modify) return accepted({ pending: 'somebody-else' })
      return projectStatus('p1')
    })
    const api = makeRemoteConnectorApi(context)

    expect(await api.project.create('a store finder')).toEqual(projectStatus('p1') as never)
    expect(await api.project.modify('p1', 'x')).toEqual({ pending: 'somebody-else' } as never)
    await expect(api.project.reinit('p1')).rejects.toBeInstanceOf(WorkcardConflict)
    expect(collects(calls)).toHaveLength(0)

    const cloud = await contextOf(ConnectLlm.Cloud)
    const cloudCalls = captureTransport(cloud, call => call.alias === connect.project.create
      ? accepted({ pending: 'x' }) : projectStatus('p1'))
    expect(await makeRemoteConnectorApi(cloud).project.create('a store finder')).toEqual({ pending: 'x' } as never)
    expect(collects(cloudCalls)).toHaveLength(0)
  })
})

describe('viable-sdk — the handover over a call that went pending', () => {
  const checkTask = (id: string): ModelTask => ({
    id, projectId: '', role: 'moderator', tier: 'cheap', effort: 'low', attempt: 0,
    mode: 'text', messages: [{ role: 'user', content: 'is this prompt acceptable?' }],
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  } as unknown as ModelTask)

  test('the task is the tool\'s answer, and submitting it replies with the collected result', async () => {
    const tasks = new TaskQueue()
    let submit: (result: ModelTaskResult) => void = () => undefined
    const submitted = new Promise<ModelTaskResult>(resolve => { submit = resolve })
    let answered = false
    void submitted.then(() => { answered = true })

    const context = await contextOf(ConnectLlm.Local)
    const calls = captureTransport(context, async call => {
      if (call.alias === connect.project.create) {
        // The platform's synchronous check files its model task and answers early.
        tasks.push(checkTask('t1'), 'op1')
        return accepted({ pending: callIdOf(call) })
      }
      // One collect hold: settled once the parent submitted, else still pending.
      await Promise.race([submitted, Bun.sleep(1_100)])
      return answered
        ? { state: ConnectCallState.Settled, outcome: 'ok', value: projectStatus('p-new') }
        : { state: ConnectCallState.Pending }
    })

    let attached: string | null = null
    let current: SessionRuntime | null = null
    const runtime = (id: string): SessionRuntime => ({
      session: { id } as never,
      stats: {} as never,
      nextTask: async (wait, signal) => await tasks.take(wait, signal),
      taskAvailable: async (wait, signal) => await tasks.available(wait, signal),
      taskById: taskId => tasks.outstandingById(taskId),
      outstandingTasks: () => tasks.outstandingTasks(),
      submitTask: async result => {
        tasks.settle(result.taskId)
        submit(result)
      },
      pendingTasks: () => tasks.size(),
      nextQuestion: async () => null,
      questionById: () => null,
      outstandingQuestions: () => [],
      answerQuestion: async () => undefined,
      pendingQuestions: () => 0,
      close: async () => undefined,
    })
    const deps = {
      host: {
        kind: ToolHostKind.Stdio, target: ConnectTarget.Local, llm: ConnectLlm.Local,
        harness: ConnectHarness.ClaudeCode, hasExecutor: true,
      },
      api: makeRemoteConnectorApi(context),
      session: async () => (current ??= runtime(`s-${attached ?? 'none'}`)),
      currentSession: () => current,
      attached: () => attached,
      attach: (projectId: string) => { attached = projectId },
      detach: () => { attached = null },
      log: () => undefined,
    } as unknown as ToolDeps

    const callbacks = new Map<string, (args: Record<string, unknown>) => Promise<McpToolAnswer>>()
    const server: McpServerLike = { registerTool: (name, _config, cb) => { callbacks.set(name, cb) } }
    registerCatalogue(server, deps)
    const textOf = (answer: McpToolAnswer): string => answer.content.map(part => part.text).join('\n')

    const first = await callbacks.get('create_project')!({ prompt: 'a store finder' })

    expect(textOf(first)).toContain('create_project is NOT finished')
    expect(first.structuredContent).toMatchObject({ taskId: 't1', waitingOn: 'create_project' })
    // The call went pending and is being collected, not held open.
    expect(collects(calls).length).toBeGreaterThan(0)

    const reply = await callbacks.get('submit_task_result')!({ taskId: 't1', result: 'acceptable' })

    expect(reply.isError).not.toBe(true)
    expect(textOf(reply)).toContain('--- create_project finished ---')
    expect(textOf(reply)).toContain('Store finder (store-finder) · p-new')
    expect(deps.attached()).toBe('p-new')
  })
})
