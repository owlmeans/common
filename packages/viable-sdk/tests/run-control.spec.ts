import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import {
  AgentNotRunning, AgentStopScope, ConnectHarness, ConnectLlm, ConnectTarget, STORY_BATCH_STALLED, StoryBatchActive,
  StoryBatchEmpty, StoryBatchKind, StoryBatchOrderSource, StoryBatchOutcome, StoryBatchStatus, ViableStoryTransition,
  type AgentStopArgs, type ConnectAgentLock, type StoryBatchStartArgs, type StoryBatchView,
} from '@owlmeans/viable-common'
import { catalogue, catalogueHelper } from '../src/tools/catalogue.js'
import { registerCatalogue } from '../src/tools/mcp.js'
import { statusTextHelper } from '../src/tools/status.js'
import { refusalHelper } from '../src/tools/refusal.js'
import { ToolHostKind } from '../src/tools/consts.js'
import type { McpServerLike, ToolDeps, ToolHost } from '../src/tools/types.js'
import { makePlanningSuite, type PlanningSuite } from './context.js'

const host = (patch: Partial<ToolHost> = {}): ToolHost => ({
  kind: ToolHostKind.Stdio,
  target: ConnectTarget.Cloud,
  llm: ConnectLlm.Cloud,
  harness: ConnectHarness.ClaudeCode,
  hasExecutor: false,
  ...patch,
})
const url = host({ kind: ToolHostKind.Http })

const tool = (name: string) => {
  const found = catalogue.find(entry => entry.name === name)
  if (found == null) throw new Error(`no tool ${name}`)

  return found
}

const batchView = (patch: Partial<StoryBatchView> = {}): StoryBatchView => ({
  id: 'b1',
  projectId: 'p1',
  kind: StoryBatchKind.Stories,
  status: StoryBatchStatus.Running,
  stories: ['c2', 'c1', 'c3'],
  codes: { c1: 'US-AAAAA', c2: 'US-BBBBB', c3: 'US-CCCCC' },
  ordering: {
    source: StoryBatchOrderSource.Model,
    reasons: { c2: 'creates the order record the others list', c1: 'lists the orders' },
  },
  current: 'c1',
  outcomes: { c2: StoryBatchOutcome.Completed },
  createdAt: '2026-10-24T10:00:00.000Z',
  updatedAt: '2026-10-24T10:30:00.000Z',
  ...patch,
})

interface Recorded {
  deps: ToolDeps
  /** Everything the tool did, in order — the session it opened and each platform call with its arguments. */
  order: string[]
  attached: () => string | null
}

/**
 * A connector whose run controls are scripted and recorded; its `planning` is a REAL planning
 * service, so a story named by code is resolved exactly as the platform's cards answer it.
 */
const connector = (suite: PlanningSuite | null, opts: {
  attached?: string | null
  view?: StoryBatchView | null
  lock?: ConnectAgentLock
  stop?: (args: AgentStopArgs) => Promise<ConnectAgentLock>
  start?: (args: StoryBatchStartArgs) => Promise<StoryBatchView>
  steer?: () => Promise<{ queued: true, id: string }>
  host?: ToolHost
} = {}): Recorded => {
  const order: string[] = []
  let attached = opts.attached === undefined ? 'p1' : opts.attached
  const deps = {
    host: opts.host ?? host(),
    api: {
      ...(suite != null ? { planning: suite.planning } : {}),
      project: {
        stop: async (projectId: string, args: AgentStopArgs) => {
          order.push(`stop:${projectId}:${JSON.stringify(args)}`)

          return await (opts.stop?.(args) ?? Promise.resolve(opts.lock ?? { locked: true, task: 'develop-story', stopping: true }))
        },
        steer: async (projectId: string, args: { prompt: string }) => {
          order.push(`steer:${projectId}:${args.prompt}`)

          return await (opts.steer?.() ?? Promise.resolve({ queued: true as const, id: 'm1' }))
        },
        batch: {
          start: async (projectId: string, args: StoryBatchStartArgs) => {
            order.push(`batch.start:${projectId}:${JSON.stringify(args)}`)

            return await (opts.start?.(args) ?? Promise.resolve(batchView({
              projectId, status: StoryBatchStatus.Ordering, ordering: undefined, current: undefined, outcomes: {},
              stories: args.stories ?? ['c1'],
            })))
          },
          get: async (projectId: string) => {
            order.push(`batch.get:${projectId}`)

            return opts.view === undefined ? batchView({ projectId }) : opts.view
          },
          cancel: async (projectId: string) => {
            order.push(`batch.cancel:${projectId}`)

            return { ...(opts.view ?? batchView({ projectId })), status: StoryBatchStatus.Cancelled }
          },
        },
      },
    },
    session: async () => { order.push(`session:${attached ?? 'none'}`); return {} as never },
    currentSession: () => null,
    attached: () => attached,
    attach: (projectId: string) => { attached = projectId },
    log: () => undefined,
  } as unknown as ToolDeps

  return { deps, order, attached: () => attached }
}

describe('viable-sdk — run all: a story batch', () => {
  test('start_story_batch attaches first, resolves codes to card ids, and answers the batch with its next step', async () => {
    const suite = await makePlanningSuite()
    const project = await suite.project('Shop', 'shop')
    const first = await suite.story(project.id!, 'As a clerk, I record a sale.')
    const second = await suite.story(project.id!, 'As a clerk, I void a sale.')
    const { deps, order, attached } = connector(suite, { attached: 'elsewhere' })

    const result = await tool('start_story_batch').run({
      projectId: project.id, storyIds: [second.code, first.id, second.code!.toLowerCase()],
    }, deps)

    expect(attached()).toBe(project.id!)
    // The session is filed against this project BEFORE the platform may start sending its operations;
    // the platform keys a batch on card ids, each once.
    expect(order).toEqual([
      `session:${project.id}`, `batch.start:${project.id}:${JSON.stringify({ stories: [second.id, first.id] })}`,
    ])
    expect(result.isError).not.toBe(true)
    expect(result.text).toContain('Batch b1 started over 2 stories')
    expect(result.text).toContain('order: being decided')
    expect(result.text).toContain(`next: story_batch_status { "projectId": "${project.id}" }`)
    expect(result.structured).toEqual({ batch: expect.objectContaining({ id: 'b1', status: StoryBatchStatus.Ordering }) })
  })

  test('start_story_batch without stories asks for every planned one, and a story of another project is refused first', async () => {
    const suite = await makePlanningSuite()
    const project = await suite.project('Shop', 'shop')
    const other = await suite.project('Other', 'other')
    const foreign = await suite.story(other.id!, 'As a clerk, I count the till.')

    const all = connector(suite, { attached: project.id! })
    await tool('start_story_batch').run({}, all.deps)
    expect(all.order).toEqual([`session:${project.id}`, `batch.start:${project.id}:{}`])

    const refused = connector(suite, { attached: project.id! })
    await expect(tool('start_story_batch').run({ storyIds: [foreign.code] }, refused.deps)).rejects.toThrow()
    expect(refused.order.some(entry => entry.startsWith('batch.start'))).toBe(false)
    // The schema already refuses an empty selection — leaving it out is how every planned story is asked for.
    const input = z.object(tool('start_story_batch').input)
    expect(input.safeParse({ storyIds: [] }).success).toBe(false)
    expect(input.safeParse({}).success).toBe(true)
  })

  test('story_batch_status reads the latest batch in its order, with codes, reasons, outcomes and the story in progress', async () => {
    const { deps, order } = connector(null)

    const result = await tool('story_batch_status').run({}, deps)

    expect(order).toEqual(['batch.get:p1'])
    expect(result.text.split('\n')).toEqual([
      'story batch b1 · stories · running',
      'order: model',
      '  1. US-BBBBB · completed — creates the order record the others list',
      '  2. US-AAAAA · in progress — lists the orders',
      '  3. US-CCCCC · queued',
      'progress: 1 of 3 finished (1 completed)',
      'next: story_batch_status { "projectId": "p1" } — story_status { "projectId": "p1", "storyId": "c1" } follows the story in progress',
    ])

    const none = await tool('story_batch_status').run({}, connector(null, { view: null }).deps)
    expect(none.text).toContain('No story batch has run on this project.')
    expect(none.text).toContain('next: start_story_batch')
  })

  test('a finished, cancelled, halted or conversion batch ends in its own next step', () => {
    const done = statusTextHelper.renderBatchStatus(batchView({
      status: StoryBatchStatus.Completed, current: 'c3',
      outcomes: { c2: StoryBatchOutcome.Completed, c1: StoryBatchOutcome.Failed, c3: StoryBatchOutcome.Stopped },
    }))
    expect(done).toContain('progress: 3 of 3 finished (1 completed, 1 failed, 1 stopped)')
    expect(done).toContain('rolled back and it is planned again')
    expect(done).toContain('next: nothing — every story of this batch has an outcome')

    const cancelled = statusTextHelper.renderBatchStatus(batchView({ status: StoryBatchStatus.Cancelled }))
    expect(cancelled).toContain('2. US-AAAAA · started, not finished')
    expect(cancelled).toContain('3. US-CCCCC · not started')
    expect(cancelled).toContain('next: nothing — this batch was cancelled; start_story_batch starts a new one')

    const stalled = statusTextHelper.renderBatchStatus(batchView({ status: StoryBatchStatus.Halted, reason: STORY_BATCH_STALLED }))
    expect(stalled).toContain('halted: the story it started stopped moving')
    expect(stalled).toContain('next: story_status { "projectId": "p1", "storyId": "c1" }, then start_story_batch again')

    // A refusal marker stored as the reason is phrased like a thrown one — never left as the marker.
    const broke = statusTextHelper.renderBatchStatus(batchView({
      status: StoryBatchStatus.Halted, reason: 'performance-consent-required',
    }))
    expect(broke).toContain('halted: Nothing was started.')
    expect(broke).not.toContain('halted: performance-consent-required')
    expect(broke).toContain('next: start_story_batch again once the cause above is addressed')

    const conversion = statusTextHelper.renderBatchStatus(batchView({ kind: StoryBatchKind.Conversion, status: StoryBatchStatus.Cancelled }))
    expect(conversion).toContain('story batch b1 · conversion · cancelled')
    expect(conversion).toContain('next: conversion_status')
  })

  test('cancel_story_batch does nothing without confirm, then cancels FIRST and stops the story in progress', async () => {
    const unconfirmed = connector(null)
    const refused = await tool('cancel_story_batch').run({}, unconfirmed.deps)
    expect(refused.isError).toBe(true)
    expect(refused.text).toContain('confirm: true')
    expect(refused.text).toContain('rolled back')
    expect(unconfirmed.order).toEqual([])

    const confirmed = connector(null)
    const result = await tool('cancel_story_batch').run({ confirm: true }, confirmed.deps)
    expect(confirmed.order).toEqual([
      'batch.cancel:p1',
      `stop:p1:${JSON.stringify({ scope: AgentStopScope.Story, storyId: 'c1', confirm: true })}`,
    ])
    expect(result.isError).not.toBe(true)
    expect(result.text).toContain('The batch is cancelled: no further story starts, and the story in progress stops')
    expect(result.text).toContain('story batch b1 · stories · cancelled')
    expect(result.structured).toEqual(expect.objectContaining({ stopped: 'c1' }))
  })

  test('cancel_story_batch between two stories stops nothing, and nothing running is no failure', async () => {
    const between = connector(null, { view: batchView({ outcomes: { c2: StoryBatchOutcome.Completed, c1: StoryBatchOutcome.Failed } }) })
    const idle = await tool('cancel_story_batch').run({ confirm: true }, between.deps)
    expect(between.order).toEqual(['batch.cancel:p1'])
    expect(idle.text).toContain('No story of it was being implemented.')

    const ended = connector(null, { stop: async () => { throw new AgentNotRunning('story') } })
    const result = await tool('cancel_story_batch').run({ confirm: true }, ended.deps)
    expect(result.isError).not.toBe(true)
    expect(ended.order.map(entry => entry.split(':')[0])).toEqual(['batch.cancel', 'stop'])
    expect(result.text).toContain('No story of it was being implemented.')

    // Any other refusal of the stop is not swallowed.
    const broken = connector(null, { stop: async () => { throw new Error('platform down') } })
    await expect(tool('cancel_story_batch').run({ confirm: true }, broken.deps)).rejects.toThrow('platform down')
  })
})

describe('viable-sdk — stopping and steering the agent', () => {
  test('stop_agent asks the user first for every stop that rolls a story back, and makes no call before', async () => {
    for (const args of [{}, { scope: AgentStopScope.Story }, { scope: AgentStopScope.Batch }, { scope: AgentStopScope.Story, confirm: false }]) {
      const { deps, order } = connector(null)
      const result = await tool('stop_agent').run(args, deps)
      expect([JSON.stringify(args), result.isError]).toEqual([JSON.stringify(args), true])
      expect(result.text).toContain('confirm: true')
      expect(result.text).toContain('rolled back')
      expect(order).toEqual([])
    }
  })

  test('stop_agent sends only what it was given; a run stop needs no confirmation', async () => {
    const run = connector(null, { lock: { locked: true, task: 'modify-project', stopping: true, stopScope: AgentStopScope.Run } })
    const free = await tool('stop_agent').run({ scope: AgentStopScope.Run }, run.deps)
    expect(run.order).toEqual([`stop:p1:${JSON.stringify({ scope: AgentStopScope.Run })}`])
    expect(free.isError).not.toBe(true)
    expect(free.text).toContain('ends with a short summary')
    expect(free.text).toContain('Its edits stay.')
    expect(free.text).toContain('next: project_status { "projectId": "p1" } until the agent is idle')

    const any = connector(null)
    await tool('stop_agent').run({ confirm: true }, any.deps)
    expect(any.order).toEqual([`stop:p1:${JSON.stringify({ confirm: true })}`])

    const ended = connector(null, { lock: { locked: false } })
    expect((await tool('stop_agent').run({ scope: AgentStopScope.Run }, ended.deps)).text).toContain('The run has already ended')
  })

  test('stop_agent resolves a story code to its card on the project it names', async () => {
    const suite = await makePlanningSuite()
    const project = await suite.project('Shop', 'shop')
    const story = await suite.story(project.id!, 'As a clerk, I record a sale.', { moves: [ViableStoryTransition.Start] })
    const { deps, order } = connector(suite, { attached: null })

    const result = await tool('stop_agent').run({
      projectId: project.id, scope: AgentStopScope.Story, storyId: story.code, confirm: true,
    }, deps)

    expect(order).toEqual([
      `stop:${project.id}:${JSON.stringify({ scope: AgentStopScope.Story, storyId: story.id, confirm: true })}`,
    ])
    expect(result.text).toContain('Stop requested: the story in progress stops at its next step')
    // A stop opens no session: nothing it does is a model call the connector performs.
    expect(order.some(entry => entry.startsWith('session:'))).toBe(false)
  })

  test('steer_agent attaches first, then queues the message and says when it is read', async () => {
    const { deps, order, attached } = connector(null, { attached: 'elsewhere' })

    const result = await tool('steer_agent').run({ projectId: 'p1', prompt: 'keep the blue accent' }, deps)

    expect(attached()).toBe('p1')
    expect(order).toEqual(['session:p1', 'steer:p1:keep the blue accent'])
    expect(result.text).toContain('Message m1 queued: the agent reads it before its next model call.')
    expect(result.structured).toEqual({ projectId: 'p1', queued: true, id: 'm1' })
    expect(z.object(tool('steer_agent').input).safeParse({ prompt: '' }).success).toBe(false)
  })

  test('project_status says a stop is under way, and what a steerable run takes', () => {
    const base = {
      project: { id: 'p1', name: 'Shop', alias: 'shop', status: 'active', intrinsic: 'in-progress' },
      local: false,
      updatedAt: '2026-10-24T10:00:00.000Z',
    } as never as Parameters<typeof statusTextHelper.renderProjectStatus>[0]

    const steerable = statusTextHelper.renderProjectStatus({ ...base, agent: { locked: true, task: 'modify-project', steerable: true } })
    expect(steerable).toContain('agent: busy (modify-project)')
    expect(steerable).toContain('control: steer_agent adds a message to this run; stop_agent stops it')

    const stopping = statusTextHelper.renderProjectStatus({ ...base, agent: { locked: true, task: 'develop-story', stopping: true } })
    expect(stopping).toContain('agent: stopping (develop-story)')
    expect(stopping).toContain('stop requested: the agent finishes its current step first')

    const idle = statusTextHelper.renderProjectStatus({ ...base, agent: { locked: false } })
    expect(idle).not.toContain('control:')
    expect(idle).not.toContain('stop requested')
  })
})

describe('viable-sdk — the refusals of the agent controls, phrased for the model', () => {
  const fakeServer = () => {
    const callbacks = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>()
    const server: McpServerLike = { registerTool: (name, _config, cb) => { callbacks.set(name, cb) } }

    return {
      server,
      run: async (name: string, args: Record<string, unknown>) =>
        await callbacks.get(name)!(args) as { content: Array<{ text: string }>, isError?: boolean },
    }
  }

  test('nothing running, a batch already running and an empty selection read as sentences at the MCP boundary', async () => {
    const { deps } = connector(null, {
      stop: async () => { throw new AgentNotRunning('stop') },
      steer: async () => { throw new AgentNotRunning('steer') },
      start: async () => { throw new StoryBatchActive('b0') },
    })
    const { server, run } = fakeServer()
    registerCatalogue(server, deps)

    for (const [name, args] of [['stop_agent', { scope: AgentStopScope.Run }], ['steer_agent', { prompt: 'x' }]] as const) {
      const result = await run(name, args)
      expect([name, result.isError]).toEqual([name, true])
      expect(result.content[0]!.text).toContain('Nothing is running on this project right now')
      expect(result.content[0]!.text).not.toContain('agent-not-running')
    }
    const busy = await run('start_story_batch', {})
    expect(busy.content[0]!.text).toContain('A story batch is already running on this project (b0)')
    expect(busy.content[0]!.text).toContain('story_batch_status')

    expect(refusalHelper.refusalPhrase(new StoryBatchEmpty())).toContain('the selection holds no planned story')
    // A marshalled refusal reads the same as the class.
    expect(refusalHelper.refusalPhrase(new AgentNotRunning('steer').marshal()))
      .toContain('Nothing is running on this project right now that this reaches (steer)')
  })
})

describe('viable-sdk — where the agent controls are offered', () => {
  test('on every host, each in exactly the group its domain is, with its annotations', () => {
    for (const one of [host(), host({ target: ConnectTarget.Local, hasExecutor: true, llm: ConnectLlm.Local }), url]) {
      const offered = catalogueHelper.visibleTools(one).map(entry => entry.name)
      for (const name of ['start_story_batch', 'story_batch_status', 'cancel_story_batch', 'stop_agent', 'steer_agent']) {
        expect(offered).toContain(name)
      }
    }
    expect(tool('story_batch_status').annotations.readOnlyHint).toBe(true)
    expect(tool('start_story_batch').annotations.destructiveHint).toBe(false)
    expect(tool('steer_agent').annotations.destructiveHint).toBe(false)
    // A stop rolls code back: the host should ask, and repeating it changes nothing more.
    for (const name of ['cancel_story_batch', 'stop_agent']) {
      expect([name, tool(name).annotations.destructiveHint, tool(name).annotations.idempotentHint]).toEqual([name, true, true])
    }
  })
})
