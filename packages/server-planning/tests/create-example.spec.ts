import { describe, expect, test } from 'bun:test'
import { AppType, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig } from '@owlmeans/context'
import {
  CommitState, IntrinsicStatus, PLANNING_SERVICE, SchemaInvalid, TransitionAction, WorkcardKind,
} from '@owlmeans/planning'
import type {
  PlanningPlugin, StatusFlowSchema, TransitionExecution, WithPlanningService, WorkcardTypeSchema,
} from '@owlmeans/planning'
import { appendPlanningService, makePlanningService } from '../src/service.js'
import { makeMemoryPlanningStore } from '../src/store/memory.js'
import type { MemoryPlanningStoreOptions } from '../src/store/types.js'
import type { PlanningHostService } from '../src/types.js'

/**
 * The create example the `planning`, `server-planning` and `planning-postgres` skills show, run as
 * written — and the wrong forms beside it, each answered the way the skills say.
 */

const SHED: PlanningPlugin = {
  name: 'shed-planning',
  schemas: {
    flows: [
      {
        id: 'shed:site', version: 1,
        statuses: [
          { key: 'open', intrinsic: IntrinsicStatus.Planned, initial: true },
          { key: 'closed', intrinsic: IntrinsicStatus.Closed, terminal: true },
        ],
        transitions: [{ name: 'close', from: ['open'], to: 'closed' }],
      },
      {
        id: 'shed:loan', version: 1,
        statuses: [
          { key: 'available', intrinsic: IntrinsicStatus.Planned, initial: true, label: 'Available' },
          { key: 'lent', intrinsic: IntrinsicStatus.InProgress, label: 'Lent out' },
          { key: 'retired', intrinsic: IntrinsicStatus.Closed, terminal: true },
        ],
        transitions: [
          { name: 'lend', from: ['available'], to: 'lent', label: 'Lend', explicit: true },
          { name: 'return', from: ['lent'], to: 'available', label: 'Return', explicit: true },
          { name: 'retire', from: '*', to: 'retired' },
        ],
        label: 'Loan',
      },
    ],
    types: [
      {
        type: 'shed:shed', kind: WorkcardKind.Project, version: 1, label: 'Tool shed',
        fields: { type: 'object' }, flows: ['shed:site'], specifications: [],
        cardTypes: ['shed:tool'], scopedCardTypes: true,
      },
      {
        type: 'shed:tool', kind: WorkcardKind.Card, version: 1, label: 'Tool',
        fields: { type: 'object', properties: { brand: { type: 'string' } }, additionalProperties: false },
        flows: ['shed:loan'], specifications: [],
      },
    ],
  },
}

const cfg = (): BasicConfig => ({ ready: false, service: 'shed-tests', type: AppType.Backend, services: {} })

/** A target's shape: the service registered as a plain service, no `ctx.planning()`. */
const bootTarget = async (store: MemoryPlanningStoreOptions = {}) => {
  const memory = makeMemoryPlanningStore({ schemas: true, ...store })
  const context = makeBasicContext(cfg())
  context.registerService(makePlanningService({ store: memory, plugins: [SHED] }))
  context.configure()
  await context.init()

  return { context, memory }
}

const scope = { entityId: 'org-1', profileId: 'profile-1' }

describe('creating a card — the documented form', () => {
  test('scoped facade → create a project and a card under it with { wait: true } → read back', async () => {
    const { context } = await bootTarget()
    const planning = context.service<PlanningHostService>(PLANNING_SERVICE).for(scope)

    const shed = await planning.execute({
      action: TransitionAction.Create,
      card: { kind: WorkcardKind.Project, type: 'shed:shed', title: 'Maple Street shed' },
    }, { wait: true })
    const shedId = shed.card!.id!

    const drill = await planning.execute({
      action: TransitionAction.Create,
      card: {
        kind: WorkcardKind.Card, type: 'shed:tool', parent: shedId, title: 'Cordless drill',
        fields: { brand: 'Acme' },
      },
    }, { wait: true })

    expect(drill.transition.commit.state).toBe(CommitState.Committed)
    expect(drill.card).toMatchObject({ title: 'Cordless drill', status: 'available', parent: shedId })

    const again = await planning.cards.get(drill.card!.id!)
    expect(again.fields).toEqual({ brand: 'Acme' })
    const tools = await planning.cards.list({ parent: shedId, type: 'shed:tool' })
    expect(tools.items.map(tool => tool.title)).toEqual(['Cordless drill'])

    const lent = await planning.execute({
      action: TransitionAction.Transit, card: drill.card!.id!, transition: 'lend',
    }, { wait: true })
    expect(lent.card?.status).toBe('lent')
  })

  test('a data-defined type and flow with the exact keys, then a card of that type', async () => {
    const { context } = await bootTarget()
    const planning = context.service<PlanningHostService>(PLANNING_SERVICE).for(scope)
    const shedId = (await planning.execute({
      action: TransitionAction.Create,
      card: { kind: WorkcardKind.Project, type: 'shed:shed', title: 'Maple Street shed' },
    }, { wait: true })).card!.id!

    const records = await planning.definitions!.define({
      flows: [{
        id: 'shed:repair', version: 1, label: 'Repair',
        statuses: [
          { key: 'reported', intrinsic: IntrinsicStatus.Planned, initial: true, label: 'Reported' },
          { key: 'fixed', intrinsic: IntrinsicStatus.Closed, terminal: true, label: 'Fixed' },
        ],
        transitions: [{ name: 'fix', from: ['reported'], to: 'fixed', label: 'Mark fixed', explicit: true }],
      }],
      types: [{
        type: 'shed:repair', kind: WorkcardKind.Card, version: 1, label: 'Repair ticket',
        fields: { type: 'object', properties: { tool: { type: 'string' } }, additionalProperties: false },
        flows: ['shed:repair'], specifications: [],
      }],
    }, { project: shedId })
    expect(records.map(record => `${record.kind}:${record.key}:${record.version}`))
      .toEqual(['flow:shed:repair:1', 'type:shed:repair:1'])

    const ticket = await planning.execute({
      action: TransitionAction.Create,
      card: { kind: WorkcardKind.Card, type: 'shed:repair', parent: shedId, title: 'Drill chuck slips' },
    }, { wait: true })
    expect(ticket.card?.status).toBe('reported')
  })
})

describe('creating a card — the wrong forms', () => {
  test('`draft:` in place of `card:` is refused before anything is written', async () => {
    const { context } = await bootTarget()
    const planning = context.service<PlanningHostService>(PLANNING_SERVICE).for(scope)
    const wrong = { action: TransitionAction.Create, draft: { kind: WorkcardKind.Project, type: 'shed:shed', title: 'x' } }

    await expect(planning.execute(wrong as unknown as TransitionExecution, { wait: true }))
      .rejects.toThrow('planning:malformed:create-without-draft')
  })

  test('`wait: true` inside the execution is ignored in process — the receipt is back before the commit', async () => {
    const { context, memory } = await bootTarget({ sync: false })
    const planning = context.service<PlanningHostService>(PLANNING_SERVICE).for(scope)
    const create: TransitionExecution = {
      action: TransitionAction.Create,
      card: { kind: WorkcardKind.Project, type: 'shed:shed', title: 'Maple Street shed' },
    }

    const early = await planning.execute({ ...create, wait: true } as TransitionExecution)
    expect(early.transition.commit.state).toBe(CommitState.Pending)
    expect(early.card).toBeUndefined()

    // In the second argument it holds until the commit lands — here, until the store folds.
    const folding = setInterval(() => void memory.flush(), 5)
    try {
      const held = await planning.execute({
        ...create, card: { ...(create.card as object), title: 'Oak Lane shed' },
      } as TransitionExecution, { wait: true })
      expect(held.transition.commit.state).toBe(CommitState.Committed)
      expect(held.card?.title).toBe('Oak Lane shed')
    } finally {
      clearInterval(folding)
    }
  })

  test('`ctx.planning()` exists only where appendPlanningService ran; the service alias always works', async () => {
    const { context } = await bootTarget()
    expect((context as Partial<WithPlanningService>).planning).toBeUndefined()
    expect(context.service<PlanningHostService>(PLANNING_SERVICE).for(scope).scope.entityId).toBe('org-1')

    const appended = appendPlanningService(makeBasicContext(cfg()), { plugins: [SHED] })
    appended.configure()
    await appended.init()
    expect(appended.planning()).toBe(appended.service<PlanningHostService>(PLANNING_SERVICE))
  })

  test('a declaration with `name` / `key` instead of `label` / `type` / `id` is SchemaInvalid', async () => {
    const { context } = await bootTarget()
    const planning = context.service<PlanningHostService>(PLANNING_SERVICE).for(scope)
    const flow = SHED.schemas!.flows![1]
    const type = SHED.schemas!.types![1] as WorkcardTypeSchema

    const named = { ...flow, id: 'shed:named', name: 'Loan' } as unknown as StatusFlowSchema
    await expect(planning.definitions!.define({ flows: [named] })).rejects.toBeInstanceOf(SchemaInvalid)

    const keyed = { ...type, type: 'shed:keyed', key: 'shed:keyed', name: 'Tool' } as unknown as WorkcardTypeSchema
    await expect(planning.definitions!.define({ types: [keyed] })).rejects.toBeInstanceOf(SchemaInvalid)
  })
})
