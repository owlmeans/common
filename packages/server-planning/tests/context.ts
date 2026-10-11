import { AppType, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import {
  CodeScope, CodeStyle, IntrinsicStatus, SpecificationFormat, TransitionAction, WorkcardKind,
} from '@owlmeans/planning'
import type {
  AnyTypeSchema, PlanningFacade, PlanningPlugin, PlanningService, StatusFlowSchema, TransitionReceipt,
  WithPlanningService, Workcard,
} from '@owlmeans/planning'
import { appendPlanningService } from '../src/service.js'
import { makeMemoryPlanningStore } from '../src/store/memory.js'
import type { MemoryPlanningStore, MemoryPlanningStoreOptions } from '../src/store/types.js'
import type { PlanningServiceOptions } from '../src/types.js'

export const ENTITY = 'entity-1'
export const OTHER_ENTITY = 'entity-2'
export const PROFILE = 'profile-1'

export const PROJECT = 'test:project'
export const TASK = 'test:task'
export const BUG = 'test:bug'
export const NOTE = 'test:note'
export const SPEC = 'test:spec'

const flows: StatusFlowSchema[] = [
  {
    id: 'test:task',
    version: 1,
    statuses: [
      { key: 'todo', intrinsic: IntrinsicStatus.Planned, initial: true },
      { key: 'doing', intrinsic: IntrinsicStatus.InProgress },
      { key: 'done', intrinsic: IntrinsicStatus.Closed, terminal: true },
    ],
    transitions: [
      { name: 'start', from: ['todo'], to: 'doing', explicit: true },
      { name: 'finish', from: ['doing'], to: 'done', explicit: true },
      { name: 'reopen', from: '*', to: 'todo' },
    ],
  },
  {
    id: 'test:review',
    version: 1,
    statuses: [
      { key: 'waiting', intrinsic: IntrinsicStatus.Planned, initial: true },
      { key: 'approved', intrinsic: IntrinsicStatus.Closed },
    ],
    transitions: [{ name: 'approve', from: ['waiting'], to: 'approved' }],
  },
  {
    id: 'test:project',
    version: 1,
    statuses: [
      { key: 'open', intrinsic: IntrinsicStatus.Planned, initial: true },
      { key: 'active', intrinsic: IntrinsicStatus.InProgress },
    ],
    transitions: [{ name: 'activate', from: ['open'], to: 'active' }],
  },
  {
    id: 'test:doc',
    version: 1,
    statuses: [{ key: 'draft', intrinsic: IntrinsicStatus.Planned, initial: true }],
    transitions: [],
  },
]

const types: AnyTypeSchema[] = [
  {
    type: PROJECT,
    kind: WorkcardKind.Project,
    version: 1,
    fields: { type: 'object', additionalProperties: true },
    flows: ['test:project'],
    cardTypes: [TASK, BUG],
    projectTypes: [PROJECT],
    specifications: [
      { category: 'brief', format: SpecificationFormat.Markdown },
      {
        category: 'plan',
        format: SpecificationFormat.Json,
        revisioned: true,
        keepRevisions: 3,
        schema: { type: 'object', required: ['steps'], properties: { steps: { type: 'array' } } },
      },
    ],
    code: { style: CodeStyle.Slug, uniqueWithin: CodeScope.Entity, mutable: true },
  },
  {
    type: TASK,
    kind: WorkcardKind.Card,
    version: 1,
    fields: {
      type: 'object',
      properties: { area: { type: 'string', enum: ['guest', 'user'] }, primary: { type: 'boolean' } },
      additionalProperties: false,
    },
    flows: ['test:task', 'test:review'],
    specifications: [{ category: 'design', format: SpecificationFormat.Json, revisioned: true }],
    relationships: [{ name: 'follows', to: [TASK], single: true }, { name: 'blocks' }],
    labels: ['urgent', 'later'],
    code: { prefix: 'T-', style: CodeStyle.Random, length: 5, uppercase: true, uniqueWithin: CodeScope.Parent },
  },
  {
    type: BUG,
    kind: WorkcardKind.Card,
    version: 1,
    fields: { type: 'object' },
    flows: ['test:task'],
    specifications: [],
  },
  {
    type: NOTE,
    kind: WorkcardKind.Card,
    version: 1,
    fields: { type: 'object' },
    flows: ['test:task'],
    specifications: [],
  },
  {
    type: SPEC,
    kind: WorkcardKind.Specification,
    version: 1,
    fields: { type: 'object' },
    flows: ['test:doc'],
    specifications: [],
  },
]

/** The fixture types and flows, as a plugin contributes them. */
export const fixturePlugin: PlanningPlugin = { name: 'fixtures', order: 0, schemas: { types, flows } }

export interface TestPlanning {
  context: BasicContext<BasicConfig> & WithPlanningService
  service: PlanningService
  store: MemoryPlanningStore
  facade: (entityId?: string) => PlanningFacade
}

/**
 * One real context the way a backend wires planning: a memory store, the fixture plugin, and a
 * clock that never repeats a timestamp, so ordering by `at` is deterministic.
 */
export const makeTestPlanning = async (
  options: PlanningServiceOptions = {}, storeOptions: MemoryPlanningStoreOptions = {}
): Promise<TestPlanning> => {
  let tick = Date.parse('2026-01-01T00:00:00.000Z')
  const now = () => new Date(tick++).toISOString()
  const store = makeMemoryPlanningStore({ now, ...storeOptions })

  const cfg: BasicConfig = { ready: false, service: 'server-planning-tests', type: AppType.Backend, services: {} }
  const context = appendPlanningService(makeBasicContext(cfg), {
    now,
    store,
    ...options,
    plugins: [fixturePlugin, ...(options.plugins ?? [])],
  })
  context.configure()
  await context.init()

  const service = context.planning()

  return {
    context,
    service,
    store,
    facade: (entityId = ENTITY) => service.for({ entityId, profileId: PROFILE, channel: 'test' }),
  }
}

export const createProject = async (
  facade: PlanningFacade, title: string = 'Test Project', extra: Record<string, unknown> = {}
): Promise<Workcard> => (await facade.execute({
  card: { kind: WorkcardKind.Project, type: PROJECT, title, ...extra },
  action: TransitionAction.Create,
}, { wait: true })).card!

export const createTask = async (
  facade: PlanningFacade, project: string, title: string = 'A task', extra: Record<string, unknown> = {}
): Promise<TransitionReceipt> => await facade.execute({
  card: { kind: WorkcardKind.Card, type: TASK, parent: project, title, ...extra },
  action: TransitionAction.Create,
}, { wait: true })

/** A protocol-bound handler run with the smallest binding context the transport needs. */
export const invoke = async (handler: any, context: unknown, req: Record<string, unknown>): Promise<any> => {
  const res: any = { resolve: (value: unknown) => { res.value = value }, reject: (e: Error) => { res.error = e } }
  await handler.bind({ ref: { ctx: context } })({ headers: {}, params: {}, query: {}, body: {}, ...req }, res)
  if (res.error != null) {
    throw res.error
  }
  return res.value
}

/** An authenticated request of one organization. */
export const session = (entityId: string = ENTITY, patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  entity: { id: entityId, slug: entityId, iamKey: entityId },
  auth: { type: 'test', userId: 'user-1', profileId: PROFILE, entitySlug: entityId, scopes: ['*'] },
  ...patch,
})
