import { describe, expect, test } from 'bun:test'
import { ApiStatusError } from '@owlmeans/api'
import { ResilientError } from '@owlmeans/error'
import { IntrinsicStatus, TransitionAction, WorkcardKind, type TransitionExecution, type Workcard } from '@owlmeans/planning'
import {
  CONNECT_TOKEN_PREFIX, connect, ConnectHarness, ConnectLlm, ConnectOutOfCredits, ConnectTarget, TaskOperationKind,
  TaskOperationStatus, TriageKind, VIABLE_FEATURE_TYPE, VIABLE_SPEC_CARD_TYPE, VIABLE_TASK_TYPE, VIABLE_USER_STORY_TYPE,
  ViableTypeBy, ViableWorkcardTransition, WorkProposalKind, WorkProposalStatus, WorkRerunScope, WorkcardBatchEmpty,
  ProjectAgentOccupied, type ConnectCardStatus, type ConnectCardsPlanView, type ConnectProjectStatus, type ConnectRequestView,
} from '@owlmeans/viable-common'

import { makeRemoteConnectorApi } from '../src/api/remote.js'
import { TOOL_DEADLINE_MS } from '../src/consts.js'
import { makeSdkContext } from '../src/context/index.js'
import { catalogue, catalogueHelper } from '../src/tools/catalogue.js'
import { CARD_INPUTS_HEADING, CARDS_UNSUPPORTED } from '../src/tools/cards/consts.js'
import { PLATFORM_CATALOGUE, ToolHostKind } from '../src/tools/consts.js'
import { refusalHelper } from '../src/tools/refusal.js'
import type { ConnectorApi } from '../src/types.js'
import type { ToolDeps, ToolHost } from '../src/tools/types.js'
import { captureTransport } from './context.js'

/**
 * The cards tool group: every work type through planning and the cards routes — the type words, the
 * auto marker, a task's inputs that carry no value, the person's start and its gate refusals, Run
 * together, Run all as a proposal first, one card's composed status, and modify_project's triage with
 * its fallback to the released open-ended change.
 */
const CARD_TOOLS = [
  'list_cards', 'create_card', 'update_card', 'retype_card', 'run_card', 'run_cards_together', 'run_all_cards',
  'rerun_card', 'card_status', 'delete_card',
]

const STATUS = { project: { id: 'p1', name: 'Pots', alias: 'pots', status: 'confirmed' }, agent: { locked: false } } as unknown as ConnectProjectStatus

const host = (patch: Partial<ToolHost> = {}): ToolHost => ({
  kind: ToolHostKind.Stdio, target: ConnectTarget.Cloud, llm: ConnectLlm.Cloud, harness: ConnectHarness.ClaudeCode,
  hasExecutor: false, ...patch,
})

const tool = (name: string) => catalogue.find(entry => entry.name === name)!

const card = (patch: Partial<Workcard> & { id: string }): Workcard => ({
  kind: WorkcardKind.Card, type: VIABLE_USER_STORY_TYPE, code: patch.id.toUpperCase(), parent: 'p1', parents: ['p1'],
  title: patch.id, status: 'planned', intrinsic: IntrinsicStatus.Planned, fields: {}, seq: 3, head: 3, ...patch,
} as unknown as Workcard)

const cardStatus = (patch: Partial<ConnectCardStatus> = {}): ConnectCardStatus => ({
  projectId: 'p1',
  card: { id: 'c1', code: 'TASK-1', type: VIABLE_TASK_TYPE, title: 'Set the Stripe key', status: 'planned', intrinsic: IntrinsicStatus.Planned },
  updatedAt: '2026-11-19T00:00:00.000Z',
  ...patch,
})

/** A fake platform: planning over an in-memory board, and the cards routes answered as told. */
const fake = (opts: {
  cards?: Workcard[]
  refuse?: Error
  missing?: boolean
  plan?: ConnectCardsPlanView
  request?: ConnectRequestView | 'missing'
  proposals?: string
} = {}) => {
  const board = new Map((opts.cards ?? []).map(entry => [entry.id!, entry]))
  const executed: TransitionExecution[] = []
  const calls: Array<[string, unknown]> = []
  const missing = () => { throw new ApiStatusError(404) }
  let created = 0
  const api = {
    project: {
      status: async () => STATUS,
      modify: async (id: string, prompt: string) => { calls.push(['modify', { id, prompt }]); return STATUS },
      request: async (id: string, prompt: string) => {
        calls.push(['request', { id, prompt }])
        if (opts.request === 'missing') missing()
        return opts.request as ConnectRequestView
      },
    },
    cards: {
      status: async (projectId: string, cardId: string) => { calls.push(['status', { projectId, cardId }]); if (opts.missing === true) missing(); return cardStatus({ card: { ...cardStatus().card, id: cardId } }) },
      together: async (projectId: string, body: unknown) => {
        calls.push(['together', { projectId, body }])
        if (opts.missing === true) missing()
        return { spec: 'spec-1', code: 'SPEC-1', members: ['c1', 'c2'], started: true }
      },
      plan: async (projectId: string) => { calls.push(['plan', projectId]); return opts.plan! },
      runAll: async (projectId: string, body: unknown) => {
        calls.push(['runAll', { projectId, body }])
        return { id: 'b1', projectId, kind: 'cards', status: 'running', stories: ['spec-1'], outcomes: {}, codes: {} }
      },
      rerun: async (projectId: string, body: { card: string, scope: WorkRerunScope }) => {
        calls.push(['rerun', { projectId, body }])
        if (opts.missing === true) missing()
        if (opts.refuse != null) throw opts.refuse
        return { card: body.card, code: 'SPEC-1', scope: body.scope, members: ['m1', 'm2'], started: true }
      },
    },
    planning: {
      cards: {
        load: async (id: string) => board.get(id) ?? null,
        list: async (query: Record<string, unknown>) => {
          const codes = query.code == null ? null : [query.code].flat()
          const items = [...board.values()].filter(entry => codes == null || codes.includes(entry.code))

          return { items, total: items.length, page: 0 }
        },
      },
      specifications: {
        current: async () => opts.proposals != null ? { id: 'doc-1', head: 7, seq: 7, body: opts.proposals } : null,
      },
      execute: async (exec: TransitionExecution) => {
        executed.push(exec)
        if (opts.refuse != null) throw opts.refuse
        if (exec.action === TransitionAction.Create) {
          const draft = exec.card as Workcard
          const filed = card({ ...draft, id: `new-${++created}`, code: `NEW-${created}` })
          board.set(filed.id!, filed)
          return { transition: {}, card: filed }
        }
        return { transition: {}, card: typeof exec.card === 'string' ? board.get(exec.card) ?? null : null }
      },
    },
  } as unknown as ConnectorApi

  return { api, executed, calls }
}

const depsOf = (api: ConnectorApi, h: ToolHost = host()): ToolDeps => {
  let attached: string | null = 'p1'

  return {
    api, host: h,
    session: async () => ({ session: { id: 's1' } }) as never,
    currentSession: () => null,
    attached: () => attached,
    attach: (projectId: string) => { attached = projectId },
    log: () => undefined,
  } as unknown as ToolDeps
}

describe('viable-sdk — the cards tool group', () => {
  test('ten tools in ONE capability group, offered on every host, annotated by kind', () => {
    const group = PLATFORM_CATALOGUE.capabilities.find(entry => entry.id === 'cards')!
    expect(group.tools).toEqual(CARD_TOOLS)
    for (const hostKind of [host(), host({ kind: ToolHostKind.Http, hasExecutor: false }), host({ target: ConnectTarget.Local, hasExecutor: true })]) {
      const names = catalogueHelper.visibleTools(hostKind).map(entry => entry.name)
      expect(CARD_TOOLS.every(name => names.includes(name))).toBe(true)
    }
    expect(['list_cards', 'card_status'].map(name => tool(name).annotations.readOnlyHint)).toEqual([true, true])
    expect(tool('delete_card').annotations.destructiveHint).toBe(true)
    expect(['create_card', 'run_card', 'run_cards_together', 'run_all_cards', 'rerun_card'].map(name => tool(name).annotations.readOnlyHint))
      .toEqual([false, false, false, false, false])
    // A task's inputs carry names only: no value field anywhere in the input.
    expect(JSON.stringify(Object.keys(tool('create_card').input))).not.toContain('value')
    // Story tools keep their own names and inputs.
    expect(Object.keys(tool('create_story').input).sort()).toEqual(['area', 'projectId', 'story'])
  })

  test('create_card: auto asks the type check (the marker), a named type is the person\'s, inputs make it a task', async () => {
    const { api, executed } = fake()
    const deps = depsOf(api)

    await tool('create_card').run({ type: 'auto', title: 'Reports for the owner' }, deps)
    await tool('create_card').run({ type: 'feature', title: 'Invoices' }, deps)
    const task = await tool('create_card').run({
      type: 'auto', title: 'Connect Stripe', description: 'Payments go live.',
      inputs: [{ name: 'STRIPE_SECRET', secret: true, note: 'live key' }, { name: 'SHOP_NAME', secret: false }],
    }, deps)

    const drafts = executed.map(exec => exec.card as Workcard)
    expect(drafts.map(draft => [draft.type, draft.fields])).toEqual([
      [VIABLE_USER_STORY_TYPE, { primary: false, typeBy: ViableTypeBy.Auto }],
      [VIABLE_FEATURE_TYPE, { typeBy: ViableTypeBy.Person }],
      // Inputs make it a task — kept as such, never fitted away from what it needs.
      [VIABLE_TASK_TYPE, { typeBy: ViableTypeBy.Person }],
    ])
    expect(drafts[2]!.description).toBe(['Payments go live.', '', CARD_INPUTS_HEADING, '- STRIPE_SECRET (secret) — live key', '- SHOP_NAME'].join('\n'))
    expect(task.text).toContain('secure input')
  })

  test('create_card: members move into a new spec; cards on a leaf and inputs on a non-task are refused unasked', async () => {
    const { api, executed } = fake({ cards: [card({ id: 'us-1' })] })
    const deps = depsOf(api)

    const spec = await tool('create_card').run({ type: 'spec', title: 'Billing', cards: ['US-1'] }, deps)
    expect(spec.text).toContain('Moved in: US-1')
    expect(executed[1]).toMatchObject({ card: 'us-1', action: TransitionAction.Update, changes: { parents: ['p1', 'new-1'] }, expectSeq: 3 })

    const leaf = await tool('create_card').run({ type: 'user-story', title: 'x', cards: ['US-1'] }, deps)
    const notTask = await tool('create_card').run({ type: 'feature', title: 'x', inputs: [{ name: 'A', secret: false }] }, deps)
    expect([leaf.isError, notTask.isError]).toEqual([true, true])
    expect(executed).toHaveLength(2)
  })

  test('run_card: the person\'s start, then the card\'s composed status', async () => {
    const { api, executed, calls } = fake({ cards: [card({ id: 'c1', type: VIABLE_SPEC_CARD_TYPE, code: 'SPEC-1' })] })

    const answer = await tool('run_card').run({ cardId: 'SPEC-1' }, depsOf(api))

    expect(executed).toEqual([{ card: 'c1', action: TransitionAction.Transit, transition: ViableWorkcardTransition.Start, cause: 'connector:run-card' }])
    expect(calls.at(-1)).toEqual(['status', { projectId: 'p1', cardId: 'c1' }])
    expect(answer.text).toContain('Started the spec SPEC-1')
  })

  test('the gate refusals are phrased per gate: the spec floor and the Pro allowance, the change floor, debt', () => {
    const spec = refusalHelper.personRefusalPhrase(new ConnectOutOfCredits(ConnectOutOfCredits.encode('spec', 3, 1.5, 'https://web/billing')))!
    const change = refusalHelper.personRefusalPhrase(new ConnectOutOfCredits(ConnectOutOfCredits.encode('change', 0.02, 0, 'https://web/billing')))!
    const debt = refusalHelper.personRefusalPhrase(new ConnectOutOfCredits(ConnectOutOfCredits.encode('story', 1, -2.25, 'https://web/billing')))!
    const story = refusalHelper.personRefusalPhrase(new ConnectOutOfCredits(ConnectOutOfCredits.encode('story', 1, 0.5, 'https://web/billing')))!

    expect(spec).toContain('100,000 credits')
    expect(spec).toContain('free spec implementation of the month')
    expect(change).toContain('positive balance')
    expect(debt).toContain('in debt')
    expect(debt).toContain('$2.25')
    // A story's refusal reads as it always did.
    expect(story).toStartWith('Not enough balance to do this')
    for (const phrase of [spec, change, debt]) expect(phrase).toContain('https://web/billing')
  })

  test('run_card refused by the balance answers the gate\'s sentence and starts nothing', async () => {
    const { api, calls } = fake({
      cards: [card({ id: 'c1', type: VIABLE_FEATURE_TYPE })],
      refuse: new ConnectOutOfCredits(ConnectOutOfCredits.encode('spec', 3, 0, 'https://web/billing')),
    })

    await expect(tool('run_card').run({ cardId: 'c1' }, depsOf(api))).rejects.toBeInstanceOf(ConnectOutOfCredits)
    expect(calls.filter(([name]) => name === 'status')).toEqual([])
  })

  test('run_cards_together: ids resolved, the spec started, its status answered', async () => {
    const { api, calls } = fake({ cards: [card({ id: 'c1' }), card({ id: 'c2' })] })

    const answer = await tool('run_cards_together').run({ cards: ['C1', 'c2'], title: 'Checkout' }, depsOf(api))

    expect(calls[0]).toEqual(['together', { projectId: 'p1', body: { cards: ['c1', 'c2'], start: true, title: 'Checkout' } }])
    expect(answer.text).toContain('Spec SPEC-1 holds 2 card(s) and was started')
    expect(answer.structured).toMatchObject({ together: { spec: 'spec-1', started: true } })
  })

  test('rerun_card: the container started for exactly its failed or unfinished cards, then its status', async () => {
    const { api, executed, calls } = fake({ cards: [card({ id: 'c1', type: VIABLE_SPEC_CARD_TYPE, code: 'SPEC-1' })] })

    const failed = await tool('rerun_card').run({ cardId: 'SPEC-1', scope: 'failed' }, depsOf(api))
    await tool('rerun_card').run({ cardId: 'c1', scope: 'unfinished' }, depsOf(api))

    // The re-run route, never a planning transition of its own: the platform starts the container.
    expect(executed).toEqual([])
    expect(calls.filter(([name]) => name === 'rerun')).toEqual([
      ['rerun', { projectId: 'p1', body: { card: 'c1', scope: WorkRerunScope.Failed } }],
      ['rerun', { projectId: 'p1', body: { card: 'c1', scope: WorkRerunScope.Unfinished } }],
    ])
    expect(calls.at(-1)).toEqual(['status', { projectId: 'p1', cardId: 'c1' }])
    expect(failed.text).toContain('Started the spec SPEC-1 again for its 2 failed card(s)')
    // It spends credits — the description says so; the scope is a closed word.
    expect(tool('rerun_card').description).toContain('spends credits')
    expect(Object.keys(tool('rerun_card').input).sort()).toEqual(['cardId', 'projectId', 'scope'])
  })

  test('rerun_card: an older platform answers the cards notice; a refusal is phrased for the person', async () => {
    const old = fake({ cards: [card({ id: 'c1', type: VIABLE_SPEC_CARD_TYPE })], missing: true })
    expect((await tool('rerun_card').run({ cardId: 'c1', scope: 'failed' }, depsOf(old.api))).text).toBe(CARDS_UNSUPPORTED)

    const phrase = (e: Error) => refusalHelper.refusalPhrase(e)
    expect(phrase(new WorkcardBatchEmpty('rerun:failed'))).toContain('none of the cards inside it failed')
    expect(phrase(new WorkcardBatchEmpty('rerun:unfinished'))).toContain('every card inside it is completed')
    expect(phrase(new ProjectAgentOccupied('rerun:running'))).toContain('That card is running now')
    expect(phrase(new ProjectAgentOccupied('rerun:member'))).toContain('running on its own')
    // The batch's own refusal and a plain occupied project read as before.
    expect(phrase(new WorkcardBatchEmpty())).toContain('a batch implements planned stories only')
    expect(phrase(new ProjectAgentOccupied('story'))).toContain('already working on this project')
  })

  test('run_all_cards: the placement first, nothing run; confirm applies exactly the placement shown', async () => {
    const plan: ConnectCardsPlanView = {
      assignment: {
        placements: [{ card: 'c1', container: 's1', order: 0 }, { card: 'c2', container: null, order: 0 }, { card: 'c3', container: null, order: 1 }],
        newSpec: { title: 'Reports', summary: 'r' },
      },
      loose: [
        { id: 'c1', code: 'US-1', type: VIABLE_USER_STORY_TYPE, title: 'One' }, { id: 'c2', code: 'IMP-1', type: 'viable:improvement', title: 'Two' },
        { id: 'c3', code: 'TASK-1', type: 'viable:task', title: 'Three' },
      ],
      containers: [{ id: 's1', code: 'SPEC-1', type: VIABLE_SPEC_CARD_TYPE, title: 'Billing' }],
    }
    const { api, calls } = fake({ plan })
    const deps = depsOf(api)

    const proposal = await tool('run_all_cards').run({}, deps)
    expect(calls).toEqual([['plan', 'p1']])
    expect(proposal.text).toContain('into SPEC-1')
    expect(proposal.text).toContain('a NEW spec "Reports"')
    expect(proposal.text).not.toContain('on its own (runs after the specs)')
    expect(proposal.text).toContain('"confirm": true')

    const ran = await tool('run_all_cards').run({ confirm: true }, deps)
    expect(calls.slice(1)).toEqual([['runAll', { projectId: 'p1', body: { assignment: plan.assignment } }]])
    expect(ran.text).toContain('Run all started: batch b1 over 1 item(s) — the existing specs first, the new spec next, cards on their own last.')
  })

  test('run_all_cards: a card that fits nothing runs on its own after the specs — never alone in a new spec', async () => {
    const plan: ConnectCardsPlanView = {
      assignment: {
        // One card for the new spec forms no spec: it is listed first among the cards on their own.
        placements: [{ card: 'c1', container: 's1', order: 0 }, { card: 'c2', container: null, order: 0, reason: 'Nothing else like it' }],
        newSpec: { title: 'Reports', summary: 'r' },
        loose: ['c3'],
      },
      loose: [
        { id: 'c1', code: 'US-1', type: VIABLE_USER_STORY_TYPE, title: 'One' }, { id: 'c2', code: 'IMP-1', type: 'viable:improvement', title: 'Two' },
        { id: 'c3', code: 'TASK-1', type: 'viable:task', title: 'Three' },
      ],
      containers: [{ id: 's1', code: 'SPEC-1', type: VIABLE_SPEC_CARD_TYPE, title: 'Billing' }],
    }
    const { api, calls } = fake({ plan })
    const deps = depsOf(api)

    const proposal = await tool('run_all_cards').run({}, deps)
    expect(proposal.text).not.toContain('NEW spec')
    const lines = proposal.text.split('\n')
    const own = lines.indexOf('  on its own (runs after the specs):')
    expect(own).toBeGreaterThan(lines.findIndex(line => line.startsWith('  into SPEC-1')))
    expect(lines.slice(own + 1, own + 3)).toEqual(['    IMP-1 (improvement) Two — Nothing else like it', '    TASK-1 (task) Three'])
    expect(proposal.text).toContain('a card on its own spends like run_card')
    expect(proposal.structured).toMatchObject({ plan: { assignment: { loose: ['c3'] } } })

    await tool('run_all_cards').run({ confirm: true }, deps)
    expect(calls.slice(1)).toEqual([['runAll', { projectId: 'p1', body: { assignment: plan.assignment } }]])
  })

  test('run_all_cards: cards on their own alone are something to run; nothing at all is not', async () => {
    const card = { id: 'c3', code: 'TASK-1', type: 'viable:task', title: 'Three' }
    const alone = fake({ plan: { assignment: { placements: [], loose: ['c3'] }, loose: [card], containers: [] } })
    const proposal = await tool('run_all_cards').run({}, depsOf(alone.api))
    expect(proposal.text).not.toContain('No loose planned cards')
    expect(proposal.text).toContain('    TASK-1 (task) Three')
    await tool('run_all_cards').run({ confirm: true }, depsOf(alone.api))
    expect(alone.calls.map(call => call[0])).toEqual(['plan', 'runAll'])

    const none = fake({ plan: { assignment: { placements: [], loose: [] }, loose: [], containers: [] } })
    const empty = await tool('run_all_cards').run({ confirm: true }, depsOf(none.api))
    expect(empty.text).toContain('No loose planned cards to run')
    expect(none.calls.map(call => call[0])).toEqual(['plan'])
  })

  test('card_status: a task\'s inputs as set or missing with the secure link — never a value — and the next action', async () => {
    const status = cardStatus({
      inputs: [
        { name: 'STRIPE_SECRET', kind: TaskOperationKind.Secret, status: TaskOperationStatus.Waiting, set: false },
        { name: 'SHOP_NAME', kind: TaskOperationKind.Variable, status: TaskOperationStatus.Done, set: true },
      ],
      inputsUrl: 'https://web/project/p1/dashboard?tab=board&card=c1&cardTab=task-inputs',
      proposals: [{ id: 'p-1', kind: WorkProposalKind.Focus, title: 'Move refunds out', status: WorkProposalStatus.Open, type: VIABLE_USER_STORY_TYPE }],
    })
    const { api } = fake({ cards: [card({ id: 'c1', type: VIABLE_TASK_TYPE })] })
    api.cards.status = async () => status

    const answer = await tool('card_status').run({ cardId: 'c1' }, depsOf(api))

    expect(answer.text).toContain('STRIPE_SECRET (secret) · missing; SHOP_NAME (variable) · set')
    expect(answer.text).toContain('p-1 · focus · as user story — Move refunds out')
    expect(answer.text).toContain(`next: the user types STRIPE_SECRET at ${status.inputsUrl}`)
  })

  test('update_card decides proposals by changing their status alone', async () => {
    const proposals = JSON.stringify({ version: 1, items: [
      { id: 'p-1', kind: WorkProposalKind.Focus, title: 'Move refunds out', status: WorkProposalStatus.Open },
      { id: 'p-2', kind: WorkProposalKind.Focus, title: 'Split exports', status: WorkProposalStatus.Open },
    ] })
    const { api, executed } = fake({ cards: [card({ id: 'f1', type: VIABLE_FEATURE_TYPE })], proposals })

    await tool('update_card').run({ cardId: 'f1', proposals: [{ id: 'p-2', decision: 'dismiss' }] }, depsOf(api))

    expect(executed).toHaveLength(1)
    expect(executed[0]).toMatchObject({ card: 'doc-1', action: TransitionAction.Update, expectSeq: 7 })
    expect(JSON.parse((executed[0]!.changes as { body: string }).body).items.map((item: { status: string }) => item.status))
      .toEqual([WorkProposalStatus.Open, WorkProposalStatus.Dismissed])
  })

  test('a platform older than the cards routes is said so, never a raw 404', async () => {
    const { api } = fake({ cards: [card({ id: 'c1' }), card({ id: 'c2' })], missing: true })

    expect((await tool('card_status').run({ cardId: 'c1' }, depsOf(api))).text).toBe(CARDS_UNSUPPORTED)
    expect((await tool('run_cards_together').run({ cards: ['c1', 'c2'] }, depsOf(api))).text).toBe(CARDS_UNSUPPORTED)
  })
})

describe('viable-sdk — modify_project triages the request', () => {
  test('a cards client asks the request route; the filed cards and the start are reported', async () => {
    const view: ConnectRequestView = {
      kind: TriageKind.Card,
      cards: [{ id: 's1', code: 'SPEC-1', type: VIABLE_SPEC_CARD_TYPE, title: 'Billing' }, { id: 'u1', code: 'US-9', type: VIABLE_USER_STORY_TYPE, title: 'Invoice a class' }],
      start: { card: 's1', started: false, refusal: ResilientError.marshal(new ConnectOutOfCredits(ConnectOutOfCredits.encode('spec', 3, 0, 'https://web/billing')), { includeStack: false }).message },
    }
    const { api, calls } = fake({ request: view })

    const answer = await tool('modify_project').run({ prompt: 'Add billing and run it now' }, depsOf(api))

    expect(calls).toEqual([['request', { id: 'p1', prompt: 'Add billing and run it now' }]])
    expect(answer.text).toContain('2 card(s) filed')
    expect(answer.text).toContain('SPEC-1 · spec — Billing')
    expect(answer.text).toContain('Not started: Nothing was started: a spec or a feature needs at least 100,000 credits')
    expect(answer.structured).toMatchObject({ request: view, project: STATUS })
  })

  test('an older platform answers the released open-ended change, exactly as before — and is asked once', async () => {
    const { api, calls } = fake({ request: 'missing' })
    const deps = depsOf(api)

    const first = await tool('modify_project').run({ prompt: 'Bold the title' }, deps)
    await tool('modify_project').run({ prompt: 'Bold the title again' }, deps)

    expect(calls.map(([name]) => name)).toEqual(['request', 'modify', 'modify'])
    expect(first.structured).toEqual({ project: STATUS })
  })

  test('a fix and a question read as such', async () => {
    for (const [kind, word] of [[TriageKind.Fix, 'small FIX'], [TriageKind.Question, 'QUESTION']] as const) {
      const { api } = fake({ request: { kind } })
      expect((await tool('modify_project').run({ prompt: 'x' }, depsOf(api))).text).toContain(word)
    }
  })
})

describe('viable-sdk — the cards routes over HTTP', () => {
  test('each member addresses its route with only the named fields and the tool deadline', async () => {
    const context = await makeSdkContext({ apiUrl: 'http://127.0.0.1:9', token: `${CONNECT_TOKEN_PREFIX}offline_test_token` })
    const calls = captureTransport(context, () => ({}))
    const api = makeRemoteConnectorApi(context)

    await api.project.request('p1', 'Add billing')
    await api.cards.status('p1', 'c1')
    await api.cards.together('p1', { cards: ['c1', 'c2'], start: true })
    await api.cards.plan('p1')
    await api.cards.runAll('p1', { assignment: { placements: [] } })
    await api.cards.rerun('p1', { card: 'c1', scope: WorkRerunScope.Failed, extra: 'x' } as never)

    expect(calls.map(call => [call.alias, call.path, call.body ?? null, call.timeout])).toEqual([
      [connect.project.request, '/connect/project/:id/request', { prompt: 'Add billing' }, TOOL_DEADLINE_MS],
      [connect.cards.status, '/connect/project/:id/cards/:cardId/status', null, TOOL_DEADLINE_MS],
      [connect.cards.together, '/connect/project/:id/cards/together', { cards: ['c1', 'c2'], start: true }, TOOL_DEADLINE_MS],
      [connect.cards.plan, '/connect/project/:id/cards/plan', null, TOOL_DEADLINE_MS],
      [connect.cards.runAll, '/connect/project/:id/cards/run-all', { assignment: { placements: [] } }, TOOL_DEADLINE_MS],
      [connect.cards.rerun, '/connect/project/:id/cards/rerun', { card: 'c1', scope: WorkRerunScope.Failed }, TOOL_DEADLINE_MS],
    ])
  })
})
