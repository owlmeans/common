import { describe, expect, test } from 'bun:test'
import { z } from 'zod'
import {
  ConnectFeedKind, ConnectHarness, ConnectInquiryKind, ConnectLlm, ConnectTarget, ConnectWaitReason, ConversionStatus,
  StoryBatchKind, StoryBatchOrderSource, StoryBatchOutcome, StoryBatchStatus, ViableStoryTransition, STORY_BATCH_STALLED,
  type BlueprintCatalogue, type ConnectPipelineState, type ConnectProjectStatus, type ConnectStoryStatus,
  type ConversionStatusView, type ConvertCheck, type InquiryPayload, type StoryBatchView, type ViableStoryCard,
} from '@owlmeans/viable-common'
import { catalogue } from '../src/tools/catalogue.js'
import { ToolHostKind } from '../src/tools/consts.js'
import { workPresentation } from '../src/tools/profile/presentation/work.js'
import type { ToolDeps, ToolHost } from '../src/tools/types.js'
import { ENTITY_ID, makePlanningSuite, type PlanningSuite } from './context.js'

/** Field names an internal id or a raw timestamp travels under — none may survive a presenter. */
const INTERNAL = /sessionId|opId|callId|entityId|createdAt|updatedAt|lockedAt|startedAt|heartbeatAt|expiresAt|finishedAt|openedAt/

/** The work-domain tools that never answer a structured part, and so declare no output. */
const TEXT_ONLY = ['describe_platform', 'session_status', 'delete_story', 'answer_question', 'stop_local']

const host = (patch: Partial<ToolHost> = {}): ToolHost => ({
  kind: ToolHostKind.Http,
  target: ConnectTarget.Cloud,
  llm: ConnectLlm.Cloud,
  harness: ConnectHarness.ClaudeCode,
  hasExecutor: false,
  ...patch,
})

/** A URL-configured host: it holds no session, so no tool opens one before its platform call. */
const depsOf = (api: unknown, patch: Partial<ToolDeps> = {}): ToolDeps => ({
  host: host(),
  api,
  session: async () => { throw new Error('no session on this host') },
  currentSession: () => null,
  attached: () => 'p1',
  attach: () => undefined,
  log: () => undefined,
  ...patch,
}) as unknown as ToolDeps

const toolNamed = (name: string) => {
  const tool = catalogue.find(entry => entry.name === name)
  if (tool == null) throw new Error(`no tool ${name}`)

  return tool
}

/** A tool's base structured result, as its own `run` answers it over a recorded connector. */
const structuredOf = async (name: string, args: Record<string, unknown>, deps: ToolDeps): Promise<object> => {
  const result = await toolNamed(name).run(args, deps)
  expect([name, result.isError ?? false]).toEqual([name, false])
  expect(result.structured).toBeDefined()

  return result.structured!
}

const keysOf = (value: unknown): string[] => value == null || typeof value !== 'object'
  ? []
  : Array.isArray(value)
    ? value.flatMap(keysOf)
    : Object.entries(value).flatMap(([key, item]) => [key, ...keysOf(item)])

/**
 * Present a base result through the tool's entry and prove what the MCP server will: the schema
 * accepts it, it declares nothing the schema does not (a strip-mode parse changes nothing), it is
 * plain JSON, and no internal id or timestamp field is left in it.
 */
const presented = (name: string, structured: object, args: Record<string, unknown> = {}): Record<string, unknown> => {
  const entry = workPresentation[name]
  expect(entry?.output).toBeDefined()
  expect(entry?.present).toBeDefined()
  const value = entry!.present!(structured, args) as Record<string, unknown>
  const parsed = z.object(entry!.output!).safeParse(value)
  if (!parsed.success) throw new Error(`${name}: ${parsed.error.message}\n${JSON.stringify(value, null, 2)}`)
  expect(parsed.data).toEqual(value)
  expect(JSON.parse(JSON.stringify(value))).toEqual(value)
  expect(keysOf(value).filter(key => INTERNAL.test(key))).toEqual([])

  return value
}

const inquiry = (patch: Partial<InquiryPayload> = {}): InquiryPayload => ({
  id: 'q1',
  projectId: 'p1',
  runId: 'r1',
  step: 'design',
  kind: ConnectInquiryKind.Choice,
  question: 'Which currency do the prices use?',
  context: 'The specification names none.',
  options: [{ value: 'eur', label: 'Euro' }, { value: 'usd', label: 'US dollar', description: 'The default' }],
  default: 'usd',
  expiresAt: '2026-10-31T10:45:00.000Z',
  ...patch,
})

const STACKED = 'the build failed\n    at bundle (rollup.js:1:1)\n  src/x.ts: no such export'

const projectStatus = (patch: Partial<ConnectProjectStatus> = {}): ConnectProjectStatus => ({
  project: {
    id: 'p1', name: 'Ledger', alias: 'ledger', status: 'confirmed', intrinsic: 'in-progress',
    description: 'A small ledger.', specification: 'Spec body.', vision: 'Vision body.', designSystem: 'Muted greens.',
  },
  slot: {
    id: 'slot-1', kind: 'ephemeral', status: 'serving', slug: 'ledger', host: 'ledger.preview.example.org',
    initialized: true, lastError: 'viable-agent-common:content-refused:abuse-tooling', buildWarning: STACKED,
  },
  production: { id: 'prod-1', status: 'serving', host: 'ledger.example.org' },
  agent: {
    locked: true, task: 'develop-story', lockedAt: '2026-10-31T10:00:00.000Z', stopping: true,
    stoppingStoryId: 'c1', stopScope: 'story' as never, steerable: true,
  },
  run: {
    runId: 'r1', pipeline: 'vib:story:develop', status: 'waiting', step: 'design', completed: ['read'],
    pending: ['design', 'build'], warnings: ['a warning'], error: 'viable-converter:taxonomy-missing',
    startedAt: '2026-10-31T10:00:00.000Z', updatedAt: '2026-10-31T10:01:00.000Z',
  },
  waitingFor: ConnectWaitReason.Person,
  pendingInquiry: inquiry(),
  session: {
    id: 'sess-1', target: ConnectTarget.Cloud, llm: ConnectLlm.Cloud, status: 'open' as never, pending: 0,
    expiresAt: '2026-10-31T11:00:00.000Z',
  },
  local: false,
  updatedAt: '2026-10-31T10:01:00.000Z',
  ...patch,
})

/** What an older platform answers: no slot, no run, an idle agent, nothing else. */
const BARE_STATUS = {
  project: { id: 'p2', name: 'Shop', alias: 'shop', status: 'draft', intrinsic: 'planned' },
  agent: { locked: false },
} as unknown as ConnectProjectStatus

const batchView = (patch: Partial<StoryBatchView> = {}): StoryBatchView => ({
  id: 'b1',
  projectId: 'p1',
  kind: StoryBatchKind.Stories,
  status: StoryBatchStatus.Running,
  stories: ['c2', 'c1', 'c3'],
  codes: { c1: 'US-AAAAA', c2: 'US-BBBBB', c3: 'US-CCCCC' },
  ordering: { source: StoryBatchOrderSource.Model, reasons: { c2: 'creates the order record', c1: 'lists the orders' } },
  current: 'c1',
  outcomes: { c2: StoryBatchOutcome.Completed },
  createdAt: '2026-10-24T10:00:00.000Z',
  updatedAt: '2026-10-24T10:30:00.000Z',
  ...patch,
})

const pipelineState = (patch: Partial<ConnectPipelineState> = {}): ConnectPipelineState => ({
  runId: 'r1', pipeline: 'vib:project:init', version: 1, status: 'failed', step: 'types', completed: ['scaffold'],
  pending: ['types', 'stories'], warnings: [], failedAt: 'types', error: STACKED, attempts: 2,
  startedAt: '2026-10-31T10:00:00.000Z', heartbeatAt: '2026-10-31T10:05:00.000Z', updatedAt: '2026-10-31T10:05:00.000Z',
  ...patch,
})

const conversionView = (patch: Partial<ConversionStatusView> = {}): ConversionStatusView => ({
  projectId: 'p1',
  stage: 'analysis' as never,
  status: ConversionStatus.Awaiting,
  decision: 'analyze' as never,
  verdict: 'limited' as never,
  stack: { id: 'node-express' as never, family: 'node' as never, label: 'Express', language: 'TypeScript', framework: 'express' },
  targetStack: { id: 'viable' as never, family: 'viable' as never, label: 'OwlMeans Viable', language: 'TypeScript' },
  architecture: 'web' as never,
  estimates: [
    { stage: 'intake', version: 1, roles: [], inputTokens: 10, outputTokens: 1, usd: 0.1, delegated: false } as never,
    { stage: 'analysis', version: 1, roles: [], inputTokens: 100, outputTokens: 10, usd: 1.25, delegated: false } as never,
  ],
  storyEstimate: { minUsd: 4, maxUsd: 9, perStory: [{ code: 'US-A', complexity: 2, minUsd: 2, maxUsd: 4 }, { code: 'US-B', complexity: 3, minUsd: 2, maxUsd: 5 }] },
  originState: 'present' as never,
  assumptions: 2,
  runId: 'r9',
  lastError: '',
  updatedAt: '2026-10-31T10:00:00.000Z',
  ...patch,
})

/** A connector whose story tools run over a REAL planning service, the story status composed from the card. */
const storyConnector = (suite: PlanningSuite, projectId: string, extra: Partial<ConnectStoryStatus> = {}): ToolDeps =>
  depsOf({
    planning: suite.planning,
    story: {
      status: async (project: string, storyId: string): Promise<ConnectStoryStatus> => {
        const card = await suite.planning.cards.get(storyId) as ViableStoryCard

        return {
          projectId: project,
          story: {
            id: card.id!, code: card.code!, title: card.title, status: card.status, intrinsic: card.intrinsic,
            ...(card.fields.warning != null ? { warning: card.fields.warning } : {}),
          },
          updatedAt: '2026-10-31T10:00:00.000Z',
          ...extra,
        }
      },
    },
  }, { attached: () => projectId })

describe('viable-sdk — the work-domain presentation of a listing profile', () => {
  test('every entry names a catalogue tool and declares both its output and its presenter', () => {
    const names = new Set(catalogue.map(tool => tool.name))
    for (const [name, entry] of Object.entries(workPresentation)) {
      expect([name, names.has(name)]).toEqual([name, true])
      expect([name, entry.output != null, typeof entry.present]).toEqual([name, true, 'function'])
      // Titles, descriptions and annotations are the profile's own, not this table's.
      expect([name, entry.title, entry.description, entry.annotations]).toEqual([name, undefined, undefined, undefined])
      // What `tools/list` publishes: the MCP server converts the shape exactly so, closed objects included.
      const schema = z.toJSONSchema(z.object(entry.output!), { target: 'draft-7', io: 'output' })
      expect([name, schema.type, schema.additionalProperties]).toEqual([name, 'object', false])
    }
    for (const name of TEXT_ONLY) {
      expect(names.has(name)).toBe(true)
      expect(workPresentation[name]).toBeUndefined()
    }
  })

  test('every presenter is total: an empty or malformed result still yields what its schema accepts', () => {
    const garbage = {
      project: 'x', agent: 7, slot: [], items: 5, entries: [null, 1, 'a', { kind: 3 }], batch: [], slots: {},
      projects: [null, { id: 4 }], kits: [{ types: 'no' }], blueprints: [{ cases: [{ categories: [1] }] }],
      story: { story: null }, pipeline: 'name', conversion: null, estimates: 'none', env: [], running: 'yes',
      tools: null, database: 'x', result: [], lock: 'held', cursor: 12, stories: [1, 'c1'], outcomes: [],
    }
    for (const name of Object.keys(workPresentation)) {
      presented(name, {})
      presented(name, garbage, { projectId: 7, page: 'one' })
    }
  })

  test('a project status keeps the card, the brief and the handles, and drops session, lock and record ids', async () => {
    const full = projectStatus()
    const api = {
      project: {
        status: async () => full,
        attach: async () => full,
        create: async () => full,
        confirm: async () => full,
        reinit: async () => full,
        modify: async () => full,
        rename: async () => BARE_STATUS,
      },
    }
    const deps = depsOf(api)

    // Top-level (status, attach) and wrapped as `{ project }` (every write) present the same way.
    const read = presented('project_status', await structuredOf('project_status', {}, deps))
    expect(presented('attach_project', await structuredOf('attach_project', { slug: 'ledger' }, deps))).toEqual(read)
    for (const [name, args] of [
      ['create_project', { prompt: 'A ledger' }], ['confirm_project', {}], ['reinitialize_project', {}],
      ['modify_project', { prompt: 'Make it blue' }],
    ] as const) {
      expect(presented(name, await structuredOf(name, args, deps))).toEqual(read)
    }

    expect(read.project).toEqual({
      id: 'p1', name: 'Ledger', slug: 'ledger', status: 'confirmed', intrinsic: 'in-progress',
      description: 'A small ledger.', specification: 'Spec body.', vision: 'Vision body.', designSystem: 'Muted greens.',
    })
    expect(read.agent).toEqual({ locked: true, task: 'develop-story', stopping: true, stopScope: 'story', steerable: true })
    expect(read.production).toEqual({ status: 'serving', host: 'ledger.example.org' })
    // The run id stays: pipeline_status and resume_pipeline take it.
    expect(read.run).toMatchObject({ runId: 'r1', completed: ['read'], pending: ['design', 'build'] })
    expect(read.question).toEqual({
      questionId: 'q1', kind: 'choice', question: 'Which currency do the prices use?', context: 'The specification names none.',
      options: [{ value: 'eur', label: 'Euro' }, { value: 'usd', label: 'US dollar', description: 'The default' }],
      default: 'usd',
    })
    const slot = read.slot as { warnings: string[] }
    expect(read.slot).toMatchObject({ kind: 'ephemeral', status: 'serving', host: 'ledger.preview.example.org', initialized: true })
    // Warnings phrased as the text phrases them, with no stack frame left in them.
    expect(slot.warnings[0]).toContain('unsolicited bulk messaging')
    expect(slot.warnings.join('\n')).not.toMatch(/^\s+at /m)
    expect(slot.warnings[1]).toContain('src/x.ts: no such export')
    const json = JSON.stringify(read)
    for (const internal of ['sess-1', 'slot-1', 'prod-1', '2026-10-31', 'content-refused:', 'viable-converter:']) {
      expect([internal, json.includes(internal)]).toEqual([internal, false])
    }

    // An older platform's status: no slot, no run, an idle agent.
    expect(presented('rename_project', await structuredOf('rename_project', { name: 'Shop' }, deps))).toEqual({
      project: { id: 'p2', name: 'Shop', slug: 'shop', status: 'draft', intrinsic: 'planned' },
      agent: { locked: false },
    })
  })

  test('the project list, a deletion and the organization\'s workloads', async () => {
    const deps = depsOf({
      project: {
        list: async () => [{ id: 'p1', name: 'Ledger', alias: 'ledger' }, { id: 'p2', name: 'Shop', alias: 'shop' }],
        destroy: async () => ({ id: 'p1', name: 'Ledger', alias: 'ledger' }),
      },
      slot: {
        list: async () => [
          { id: 'slot-1', projectId: 'p1', kind: 'ephemeral', status: 'serving', slug: 'ledger', host: 'ledger.preview.example.org' },
          { id: 'slot-2', projectId: 'p1', kind: 'production', status: 'error', slug: 'ledger', backendWarning: STACKED },
          { id: 'slot-3', status: 'stopped', slug: 'old' },
        ],
      },
    })

    expect(presented('list_projects', await structuredOf('list_projects', {}, deps))).toEqual({
      total: 2, projects: [{ id: 'p1', name: 'Ledger', slug: 'ledger' }, { id: 'p2', name: 'Shop', slug: 'shop' }],
    })
    expect(presented('list_projects', { projects: [] })).toEqual({ total: 0, projects: [] })
    expect(presented('delete_project', await structuredOf('delete_project', { projectId: 'p1', confirm: true }, deps)))
      .toEqual({ deleted: true, project: { id: 'p1', name: 'Ledger', slug: 'ledger' } })

    const slots = presented('list_slots', await structuredOf('list_slots', {}, deps))
    expect(slots.total).toBe(3)
    expect(slots.slots).toEqual([
      { projectId: 'p1', kind: 'ephemeral', status: 'serving', slug: 'ledger', host: 'ledger.preview.example.org' },
      { projectId: 'p1', kind: 'production', status: 'error', slug: 'ledger', warnings: ['the build failed\n  src/x.ts: no such export'] },
      // A record written before `kind` existed is an ephemeral preview workload.
      { kind: 'ephemeral', status: 'stopped', slug: 'old' },
    ])
    expect(presented('list_slots', { total: 0, slots: [] })).toEqual({ total: 0, slots: [] })
  })

  test('the blueprint registry and the planning kits keep every handle a choice needs', async () => {
    const registry: BlueprintCatalogue = {
      version: 1, defaultBlueprintId: 'owlmeans-fullstack-ts', blueprints: [{
        id: 'owlmeans-fullstack-ts', title: 'Full stack', language: 'TypeScript', runtime: 'Bun', framework: 'OwlMeans',
        capabilities: { postgres: true, kv: true, queue: false, worker: false, agents: false, validation: true, marketingConsent: true },
        cases: [
          {
            id: 'work-management', title: 'Work management', description: 'Tracking work', tenancy: 'configurable',
            capabilities: { postgres: true, kv: true, queue: true, worker: true, agents: false, validation: true, marketingConsent: true, bot: false },
            categoryKind: 'work',
            categories: [{ id: 'crm', title: 'CRM', description: 'Customers', aliases: ['sales'], records: ['Deal'] }],
            planningResources: ['assignee', 'team'],
          },
          {
            id: 'web', title: 'Web', description: 'Business apps', tenancy: 'single-organization',
            capabilities: { postgres: true, kv: false, queue: false, worker: false, agents: false, validation: true, marketingConsent: true },
            categories: [{ id: 'portal', title: 'Portal', description: 'A portal' }],
          },
        ],
      }],
    }
    const kits = [{
      id: 'tasks', kind: 'project-tracking', title: 'Tasks', purpose: 'Tasks and bugs',
      container: { key: 'board', label: 'Board' },
      types: [{ key: 'task', label: 'Task', flow: 'task-flow' }, { key: 'bug', label: 'Bug', flow: 'task-flow' }],
      flows: [{ key: 'task-flow', label: 'Task flow', statuses: [{ key: 'todo', label: 'To do', intrinsic: 'planned' }] }],
    }]
    const deps = depsOf({
      account: { blueprints: async () => registry },
      project: {
        kitDescribe: async () => ({ kits }),
        kitApply: async () => ({ applied: ['task'], skipped: ['bug'], warnings: ['viable-agent-common:reserved-name:Task'] }),
      },
    })

    const described = presented('describe_blueprints', await structuredOf('describe_blueprints', {}, deps))
    const { version: _version, ...rest } = registry
    expect(described).toEqual(rest as unknown as Record<string, unknown>)

    expect(presented('describe_planning_kits', await structuredOf('describe_planning_kits', {}, deps)))
      .toEqual({ projectId: 'p1', kits })
    const applied = presented('apply_planning_kit', await structuredOf('apply_planning_kit', { kit: 'tasks', types: ['task'] }, deps))
    expect(applied).toMatchObject({ projectId: 'p1', kit: 'tasks', applied: ['task'], skipped: ['bug'] })
    expect((applied.warnings as string[])[0]).toContain('"Task"')
  })

  test('stories read as their code, narrative, flow status and flags — never the card\'s record fields', async () => {
    const suite = await makePlanningSuite()
    const project = await suite.project()
    const gate = await suite.story(project.id!, 'As a cook, I pick what is in my pantry.', {
      order: 1, fields: { landing: true, primary: true },
    })
    await suite.story(project.id!, 'As a cook, I save a recipe.', { order: 2, moves: [ViableStoryTransition.Start] })
    await suite.story(project.id!, 'As a cook, I share a recipe.', { order: 3 })
    const deps = storyConnector(suite, project.id!)

    const page = presented('list_stories', await structuredOf('list_stories', { size: 2 }, deps), { size: 2 })
    expect(page).toMatchObject({ total: 3, page: 0, nextPage: 1 })
    const stories = page.stories as Record<string, unknown>[]
    expect(stories[0]).toEqual({
      id: gate.id, code: gate.code, title: gate.title, status: 'planned', intrinsic: 'planned', area: 'user',
      primary: true, landing: true,
    })
    expect(stories[1]).toMatchObject({ status: 'in-progress', primary: false })
    expect(JSON.stringify(page)).not.toContain(ENTITY_ID)

    const last = presented('list_stories', await structuredOf('list_stories', { size: 2, page: 1 }, deps), { size: 2, page: 1 })
    expect(last).toMatchObject({ total: 3, page: 1 })
    expect(last).not.toHaveProperty('nextPage')

    // The search takes no page, so it names no next one.
    const found = presented('search_stories', await structuredOf('search_stories', { q: 'share' }, deps))
    expect(found).toMatchObject({ total: 1, page: 0 })
    expect((found.stories as Record<string, unknown>[])[0]).toMatchObject({ title: 'As a cook, I share a recipe.' })
    expect(presented('list_stories', { items: [], total: 0 })).toEqual({ total: 0, page: 0, stories: [] })

    const created = presented('create_story', await structuredOf('create_story', { story: 'As a cook, I rate a recipe.' }, deps))
    expect(created.story).toMatchObject({ title: 'As a cook, I rate a recipe.', status: 'planned', area: 'user', primary: false })
    // A create whose card has not landed answers its transition: the card id and the narrative.
    expect(presented('create_story', {
      id: 't1', entityId: ENTITY_ID, card: 'c9', kind: 'card', type: 'viable:user-story', seq: 1, action: 'create',
      changes: { title: 'As a cook, I rate a recipe.' }, actor: { profileId: 'profile-1' }, at: '2026-10-31T10:00:00.000Z',
    })).toEqual({ story: { id: 'c9', title: 'As a cook, I rate a recipe.' } })

    const updated = presented('update_story', await structuredOf('update_story', { storyId: gate.code, story: 'As a cook, I list my pantry.' }, deps))
    expect(updated.story).toMatchObject({ id: gate.id, code: gate.code, title: 'As a cook, I list my pantry.', landing: true })
  })

  test('a story\'s status keeps its run and question, and the landing mark its card carries', async () => {
    const suite = await makePlanningSuite()
    const project = await suite.project()
    const gate = await suite.story(project.id!, 'As a cook, I pick what is in my pantry.', { fields: { landing: true } })
    const failed = await suite.story(project.id!, 'As a cook, I save a recipe.', {
      fields: { warning: 'viable-agent-common:content-refused:abuse-tooling' },
      moves: [ViableStoryTransition.Start, ViableStoryTransition.Fail],
    })
    const run = {
      runId: 'r3', pipeline: 'vib:story:develop', status: 'waiting', step: 'design', completed: [], pending: ['design'],
      startedAt: '2026-10-31T10:00:00.000Z',
    }
    const deps = storyConnector(suite, project.id!, { run, waitingFor: ConnectWaitReason.Person, pendingInquiry: inquiry({ id: 'q3' }) })

    const status = presented('story_status', await structuredOf('story_status', { storyId: gate.code }, deps))
    expect(status).toEqual({
      projectId: project.id,
      story: { id: gate.id, code: gate.code, title: gate.title, status: 'planned', intrinsic: 'planned', landing: true },
      run: { runId: 'r3', pipeline: 'vib:story:develop', status: 'waiting', step: 'design', completed: [], pending: ['design'] },
      waitingFor: 'person',
      question: expect.objectContaining({ questionId: 'q3' }),
    })

    const developed = presented('develop_story', await structuredOf('develop_story', { storyId: gate.code }, deps))
    expect(developed.story).toMatchObject({ status: 'in-progress', landing: true })
    expect(presented('complete_story', await structuredOf('complete_story', { storyId: gate.code }, deps)).story)
      .toMatchObject({ status: 'completed' })
    const reset = presented('reset_story', await structuredOf('reset_story', { storyId: failed.code }, deps))
    expect(reset.story).toMatchObject({ code: failed.code, status: 'planned' })
    expect(reset.story).not.toHaveProperty('landing')
    expect((reset.story as { warning: string }).warning).toContain('unsolicited bulk messaging')

    // An unwrapped story status (what the status route itself answers) presents the same story.
    expect(presented('story_status', {
      projectId: 'p1', story: { id: 'c1', code: 'US-A', title: 'T', status: 'planned', intrinsic: 'planned' },
      updatedAt: '2026-10-31T10:00:00.000Z',
    })).toEqual({ projectId: 'p1', story: { id: 'c1', code: 'US-A', title: 'T', status: 'planned', intrinsic: 'planned' } })
  })

  test('a story batch reads in implementation order with each story\'s state; none, halted and cancelled too', async () => {
    let view: StoryBatchView | null = batchView()
    const stops: string[] = []
    const deps = depsOf({
      project: {
        batch: {
          start: async () => batchView({ status: StoryBatchStatus.Ordering, current: undefined, outcomes: {} }),
          get: async () => view,
          cancel: async () => batchView({ status: StoryBatchStatus.Cancelled }),
        },
        stop: async (_projectId: string, args: { storyId: string }) => { stops.push(args.storyId); return { locked: true, stopping: true } },
      },
    })

    const started = presented('start_story_batch', await structuredOf('start_story_batch', {}, deps))
    expect((started.batch as { stories: unknown[] }).stories).toEqual([
      { id: 'c2', code: 'US-BBBBB', state: 'queued', reason: 'creates the order record' },
      { id: 'c1', code: 'US-AAAAA', state: 'queued', reason: 'lists the orders' },
      { id: 'c3', code: 'US-CCCCC', state: 'queued' },
    ])

    expect(presented('story_batch_status', await structuredOf('story_batch_status', {}, deps))).toEqual({
      projectId: 'p1',
      batch: {
        kind: 'stories', status: 'running', orderedBy: 'model',
        stories: [
          { id: 'c2', code: 'US-BBBBB', state: 'completed', reason: 'creates the order record' },
          { id: 'c1', code: 'US-AAAAA', state: 'in-progress', reason: 'lists the orders' },
          { id: 'c3', code: 'US-CCCCC', state: 'queued' },
        ],
        current: { id: 'c1', code: 'US-AAAAA' },
        finished: 1, total: 3,
      },
    })

    view = batchView({ status: StoryBatchStatus.Halted, reason: STORY_BATCH_STALLED })
    const halted = presented('story_batch_status', await structuredOf('story_batch_status', {}, deps))
    expect(halted.batch).toMatchObject({ status: 'halted', halted: expect.stringContaining('stopped moving') })
    expect((halted.batch as { stories: { state: string }[] }).stories.map(story => story.state))
      .toEqual(['completed', 'started', 'not-started'])

    view = null
    expect(presented('story_batch_status', await structuredOf('story_batch_status', {}, deps))).toEqual({ projectId: 'p1' })

    const cancelled = presented('cancel_story_batch', await structuredOf('cancel_story_batch', { confirm: true }, deps))
    expect(stops).toEqual(['c1'])
    expect(cancelled).toMatchObject({ projectId: 'p1', batch: { status: 'cancelled' }, stopped: { id: 'c1', code: 'US-AAAAA' } })
  })

  test('stop and steer answer the agent lock and the queued message — no lock time, no message id', async () => {
    const deps = depsOf({
      project: {
        stop: async () => ({ locked: true, task: 'modify-project', lockedAt: '2026-10-31T10:00:00.000Z', stopping: true, stopScope: 'run' }),
        steer: async () => ({ queued: true, id: 'msg-1' }),
      },
    })

    expect(presented('stop_agent', await structuredOf('stop_agent', { scope: 'run' }, deps))).toEqual({
      projectId: 'p1', agent: { locked: true, task: 'modify-project', stopping: true, stopScope: 'run' },
    })
    const steered = presented('steer_agent', await structuredOf('steer_agent', { prompt: 'Use blue' }, deps))
    expect(steered).toEqual({ projectId: 'p1', queued: true })
  })

  test('a pipeline run keeps its id and steps, its failure phrased; a resumed one waits on a question', async () => {
    const deps = depsOf({
      pipeline: {
        state: async () => pipelineState(),
        resume: async () => pipelineState({
          status: 'waiting', failedAt: undefined, error: undefined, waitingFor: ConnectWaitReason.Person, pendingInquiry: inquiry(),
        }),
      },
    })

    const failed = presented('pipeline_status', await structuredOf('pipeline_status', { runId: 'r1' }, deps))
    expect(failed.run).toEqual({
      runId: 'r1', pipeline: 'vib:project:init', status: 'failed', step: 'types', completed: ['scaffold'],
      pending: ['types', 'stories'], warnings: [], failedAt: 'types', error: 'the build failed\n  src/x.ts: no such export',
      attempts: 2,
    })
    const resumed = presented('resume_pipeline', await structuredOf('resume_pipeline', { runId: 'r1', from: 'types' }, deps))
    expect(resumed).toMatchObject({ run: { status: 'waiting' }, waitingFor: 'person', question: { questionId: 'q1' } })
  })

  test('a conversion keeps its stage, cost, run and the decision that continues it', async () => {
    const check: ConvertCheck = {
      projectId: 'p1', verdict: 'limited' as never, reasons: ['too-large' as never], shape: 'foreign' as never,
      monorepo: true, unlinked: ['tools/'], files: 120, bytes: 512_000, bulk: 1, architecture: 'web' as never,
      stack: { id: 'node-express' as never, family: 'node' as never, label: 'Express', language: 'TypeScript' },
      estimate: { stage: 'analysis', version: 1, roles: [], inputTokens: 1, outputTokens: 1, usd: 2.5, delegated: false } as never,
    }
    const deps = depsOf({
      convert: {
        check: async () => check,
        status: async () => conversionView({ status: ConversionStatus.Waiting, pendingInquiry: inquiry(), waitingFor: ConnectWaitReason.Person }),
        start: async () => conversionView({ stage: 'intake' as never, status: ConversionStatus.Running, estimates: [], storyEstimate: undefined }),
        proceed: async () => conversionView(),
        purge: async () => conversionView({ status: ConversionStatus.Done, stage: 'implementation' as never, originState: 'purged' as never }),
      },
    })

    expect(presented('check_convertible', await structuredOf('check_convertible', {}, deps))).toEqual({
      projectId: 'p1', verdict: 'limited', reasons: ['too-large'], stack: { label: 'Express', language: 'TypeScript' },
      architecture: 'web', shape: 'foreign', monorepo: true, unlinked: ['tools/'], files: 120, bytes: 512_000, bulk: 1,
      estimate: { stage: 'analysis', usd: 2.5, delegated: false },
    })

    const awaiting = presented('proceed_conversion', await structuredOf('proceed_conversion', { decision: 'extract', confirm: true }, deps))
    expect(awaiting).toEqual({
      projectId: 'p1', stage: 'analysis', status: 'awaiting', decision: 'analyze', nextDecision: 'extract', verdict: 'limited',
      stack: { label: 'Express', language: 'TypeScript', framework: 'express' },
      targetStack: { label: 'OwlMeans Viable', language: 'TypeScript' }, architecture: 'web',
      estimate: { stage: 'analysis', usd: 1.25, delegated: false }, storyEstimate: { minUsd: 4, maxUsd: 9, stories: 2 },
      originState: 'present', assumptions: 2, runId: 'r9',
    })
    const started = presented('convert_project', await structuredOf('convert_project', { projectId: 'p1', confirm: true }, deps))
    expect(started).toMatchObject({ stage: 'intake', status: 'running' })
    expect(started).not.toHaveProperty('estimate')
    expect(started).not.toHaveProperty('nextDecision')
    const waiting = presented('conversion_status', await structuredOf('conversion_status', {}, deps))
    expect(waiting).toMatchObject({ status: 'waiting', waitingFor: 'person', question: { questionId: 'q1' } })
    expect(presented('purge_origin', await structuredOf('purge_origin', { confirm: true }, deps)))
      .toMatchObject({ status: 'done', originState: 'purged' })
    expect(presented('conversion_status', conversionView({ status: ConversionStatus.Failed, lastError: 'viable-converter:origin-purged' })).error)
      .toContain('cannot be undone')
  })

  test('next_question names the question it handed over, and says when there is none', async () => {
    const asked = inquiry({ id: 'q7' })
    const deps = depsOf({}, {
      host: host({ kind: ToolHostKind.Stdio, target: ConnectTarget.Local, hasExecutor: true }),
      attached: () => null,
      session: async () => ({
        questionById: () => null,
        nextQuestion: async () => asked,
        outstandingQuestions: () => [],
      }) as never,
    })

    expect(presented('next_question', await structuredOf('next_question', { maxWaitSec: 0 }, deps)))
      .toEqual({ asked: true, questionId: 'q7' })
    // Its "no question" answers carry no structured part; under a declared output the profile
    // presents an empty one, which still reads as an answer.
    expect(presented('next_question', {})).toEqual({ asked: false })
  })

  test('the feeds keep the cursor and one line per entry, never the entry\'s own position or run', async () => {
    const entries = [
      { id: '1700000000000-0', kind: ConnectFeedKind.Card, at: '2026-10-31T10:00:05.000Z', run: 'run-1', projectId: 'p1', storyId: 'c1', data: { kind: 'story', code: 'US-A', title: 'Sell', status: 'in-progress' } },
      { id: '1700000000000-1', kind: ConnectFeedKind.Toast, at: '2026-10-31T10:00:06.000Z', projectId: 'p1', data: { toast: 'out-of-credits' } },
      { id: '1700000000000-2', kind: ConnectFeedKind.File, at: '2026-10-31T10:00:07.000Z', slotId: 'slot-1', data: { event: 'changed', path: 'sources/web/src/app.tsx' } },
    ]
    const deps = depsOf({
      project: { activity: async () => ({ cursor: '1700000000000-2', gap: true, entries }) },
      account: { notifications: async () => ({ cursor: '1700000000000-1', gap: false, entries: [entries[1]] }) },
      files: { changes: async () => ({ cursor: '0-0', gap: false, watching: false, entries: [entries[2]] }) },
    })

    const activity = presented('project_activity', await structuredOf('project_activity', { detail: 'progress' }, deps))
    expect(activity).toMatchObject({ projectId: 'p1', cursor: '1700000000000-2', gap: true })
    expect(activity.entries).toEqual([
      { kind: 'card', summary: '10:00:05 story US-A "Sell" is in-progress', storyId: 'c1', code: 'US-A', status: 'in-progress' },
      { kind: 'toast', summary: expect.stringMatching(/^10:00:06 /) },
      { kind: 'file', summary: '10:00:07 changed sources/web/src/app.tsx', path: 'sources/web/src/app.tsx', event: 'changed' },
    ])

    const notices = presented('notifications', await structuredOf('notifications', {}, deps))
    // An organization notice names the project it is about.
    expect(notices).toEqual({ cursor: '1700000000000-1', gap: false, entries: [{ kind: 'toast', summary: expect.any(String), projectId: 'p1' }] })

    const files = presented('file_changes', await structuredOf('file_changes', {}, deps))
    expect(files).toMatchObject({ projectId: 'p1', cursor: '0-0', watching: false, entries: [{ kind: 'file', path: 'sources/web/src/app.tsx' }] })
    expect(presented('project_activity', { projectId: 'p1', cursor: '0-0', gap: false, entries: [] }))
      .toEqual({ projectId: 'p1', cursor: '0-0', gap: false, entries: [] })
  })

  test('a picked-up intent is the prompt alone', async () => {
    const deps = depsOf({ account: { intent: { pickup: async () => ({ prompt: 'A booking app for a barber' }) } } })

    expect(presented('pickup_intent', await structuredOf('pickup_intent', { code: 'https://owlmeans.com/start?ref=abc123' }, deps)))
      .toEqual({ prompt: 'A booking app for a barber' })
  })

  test('the local target: readiness, the addresses a person opens, and what is still missing — no paths or pids', () => {
    const notRunning = presented('local_status', {
      env: { written: ['APP_SECRET'], missing: ['DATABASE_URL'], services: { db: true, valkey: false } },
      running: { running: false, processes: {} },
    })
    expect(notRunning).toEqual({
      configured: false, missing: ['DATABASE_URL'], services: { database: true, queue: false }, running: false,
    })
    const up = presented('local_status', {
      env: { written: [], missing: [], services: { db: true, valkey: true } },
      running: {
        running: true, startedAt: '2026-10-31T10:00:00.000Z', api: 3000, web: 5173, worker: 3001, phase: 'serving', ready: true,
        processes: { api: { pid: 4242, port: 3000, alive: true } },
      },
    })
    expect(up).toEqual({
      configured: true, missing: [], services: { database: true, queue: true }, running: true, ready: true, phase: 'serving',
      appUrl: 'http://localhost:5173', apiUrl: 'http://localhost:3000', ports: { api: 3000, web: 5173, worker: 3001 },
    })
    expect(JSON.stringify(up)).not.toContain('4242')

    expect(presented('run_local', {
      record: { dir: '/home/someone/app', startedAt: '2026-10-31T10:00:00.000Z', api: { pid: 1, port: 3000 } }, api: 3000, web: 5173,
    })).toEqual({ appUrl: 'http://localhost:5173', apiUrl: 'http://localhost:3000', ports: { api: 3000, web: 5173 } })
    expect(presented('run_local', { record: null, api: 3000, web: 5173, buildError: STACKED }))
      .toMatchObject({ buildError: 'the build failed\n  src/x.ts: no such export' })

    const report = {
      dir: '/home/someone/app', needsWorker: true,
      database: { configured: true, reachable: true, redacted: 'postgres://localhost:5432/app' },
      queue: { configured: false, reachable: false },
      tools: { bun: true, git: true, docker: false }, platform: 'linux', envIgnored: true,
    }
    for (const name of ['local_setup_guide', 'set_local_service']) {
      const shown = presented(name, report)
      expect(shown).toEqual({
        needsWorker: true, database: { configured: true, reachable: true, address: 'postgres://localhost:5432/app' },
        queue: { configured: false, reachable: false }, tools: { bun: true, git: true, docker: false }, platform: 'linux',
        envIgnored: true, missing: ['queue'],
      })
      expect(JSON.stringify(shown)).not.toContain('/home/someone')
    }
  })
})
