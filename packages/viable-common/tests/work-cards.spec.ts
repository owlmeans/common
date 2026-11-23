import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import { CodeScope, CodeStyle, FORMER_CODES_FIELD, makeSchemaRegistry, MAX_FORMER_CODES, SpecificationFormat, WorkcardKind } from '@owlmeans/planning'
import { ProjectArea } from '../src/areas/consts.js'
import { UserStoryKind } from '../src/ba/consts.js'
import {
  VIABLE_CONTAINER_TYPES, VIABLE_FEATURE_MEMBERS, VIABLE_FEATURE_TYPE, VIABLE_FEATURE_TYPE_SCHEMA, VIABLE_FLOW_SCHEMAS,
  VIABLE_IMPROVEMENT_TYPE, VIABLE_LEAF_TYPES, VIABLE_PROJECT_TYPE, VIABLE_SPEC_CARD_MEMBERS, VIABLE_SPEC_CARD_TYPE,
  VIABLE_SPEC_CARD_TYPE_SCHEMA, VIABLE_TASK_TYPE, VIABLE_TYPE_SCHEMAS, VIABLE_USER_STORY_TYPE, VIABLE_WORK_FLOW,
  VIABLE_WORK_SLOTS, VIABLE_WORK_TYPE_SCHEMAS, VIABLE_WORK_TYPES, VIABLE_WORKCARD_FLOW, ViableFeatureFieldsSchema,
  ViableInitScope, ViableProjectFieldsSchema, ViableSpecCardFieldsSchema, ViableSpecCategory, ViableSpecOrigin,
  ViableTaskFieldsSchema, ViableTypeBy, VIABLE_TYPE_REASON_MAX,
  ViableWorkcardFieldsSchema, viableWorkHelper,
} from '../src/planning/index.js'
import {
  TASK_OPERATIONS_VERSION, TaskOperationKind, TaskOperationStatus, TaskOperationsSchema, WORK_PLAN_VERSION,
  WORK_PROPOSALS_VERSION, WorkOutcome, WorkPlanSchema, WorkProposalKind, WorkProposalStatus, WorkProposalsSchema,
} from '../src/work/index.js'

const ajv = new Ajv({ allErrors: true, strict: false })

describe('viable-common — work card types', () => {
  test('five work types share one flow, one slot set and a code prefix each', () => {
    expect(VIABLE_WORK_FLOW).toBe(VIABLE_WORKCARD_FLOW)
    expect(VIABLE_WORK_TYPE_SCHEMAS.map(type => type.type)).toEqual([...VIABLE_WORK_TYPES])
    expect(VIABLE_WORK_TYPE_SCHEMAS.map(type => type.code?.prefix)).toEqual(['US-', 'SPEC-', 'FEAT-', 'IMP-', 'TASK-'])
    for (const type of VIABLE_WORK_TYPE_SCHEMAS) {
      expect(type.kind).toBe(WorkcardKind.Card)
      expect(type.flows).toEqual([VIABLE_WORK_FLOW])
      expect(type.specifications).toBe(VIABLE_WORK_SLOTS)
      expect(type.code).toEqual(expect.objectContaining({ style: CodeStyle.Random, length: 5, uppercase: true, uniqueWithin: CodeScope.Parent }))
      expect(type.retypes).toEqual(VIABLE_WORK_TYPES.filter(other => other !== type.type))
    }
    expect(VIABLE_WORK_SLOTS.map(slot => [slot.category, slot.format, slot.revisioned])).toEqual([
      [ViableSpecCategory.Design, SpecificationFormat.Json, true],
      [ViableSpecCategory.Requirements, SpecificationFormat.Json, true],
      [ViableSpecCategory.Plan, SpecificationFormat.Json, true],
      [ViableSpecCategory.Operations, SpecificationFormat.Json, true],
      [ViableSpecCategory.Proposals, SpecificationFormat.Json, true],
    ])
  })

  test('a spec holds features, leaves and (by the schema) specs; a feature holds leaves; a leaf holds nothing', () => {
    expect(VIABLE_CONTAINER_TYPES).toEqual([VIABLE_SPEC_CARD_TYPE, VIABLE_FEATURE_TYPE])
    expect(VIABLE_LEAF_TYPES).toEqual([VIABLE_USER_STORY_TYPE, VIABLE_IMPROVEMENT_TYPE, VIABLE_TASK_TYPE])
    expect(VIABLE_SPEC_CARD_TYPE_SCHEMA.children?.types).toEqual([...VIABLE_SPEC_CARD_MEMBERS])
    expect(VIABLE_FEATURE_TYPE_SCHEMA.children?.types).toEqual([...VIABLE_FEATURE_MEMBERS])
    expect(VIABLE_SPEC_CARD_MEMBERS).toContain(VIABLE_SPEC_CARD_TYPE)
    expect(VIABLE_FEATURE_MEMBERS).not.toContain(VIABLE_FEATURE_TYPE)
    expect(VIABLE_SPEC_CARD_TYPE_SCHEMA.parents?.types).toEqual([VIABLE_PROJECT_TYPE, VIABLE_SPEC_CARD_TYPE])
    for (const type of VIABLE_WORK_TYPE_SCHEMAS.filter(schema => VIABLE_LEAF_TYPES.includes(schema.type))) {
      expect(type.children).toBeUndefined()
      expect(type.parents?.types).toEqual([VIABLE_PROJECT_TYPE, VIABLE_SPEC_CARD_TYPE, VIABLE_FEATURE_TYPE])
    }
  })

  test('every work type compiles in the registry and keeps `formerCodes`, `typeBy` and `typeReason` in its fields', () => {
    const registry = makeSchemaRegistry({ version: 1, types: VIABLE_TYPE_SCHEMAS, flows: VIABLE_FLOW_SCHEMAS })
    const former = Array.from({ length: MAX_FORMER_CODES }, (_, index) => `US-A${index}`)
    for (const type of VIABLE_WORK_TYPES) {
      const base = type === VIABLE_USER_STORY_TYPE ? { area: ProjectArea.Guest, primary: false } : {}
      expect(registry.validator(type)({ ...base, [FORMER_CODES_FIELD]: former, typeBy: ViableTypeBy.Model }), type).toBe(true)
      expect(registry.validator(type)({ ...base, typeBy: ViableTypeBy.Model, typeReason: 'It changes configuration only.' }), type).toBe(true)
      expect(registry.validator(type)({ ...base, typeReason: 'x'.repeat(VIABLE_TYPE_REASON_MAX + 1) }), type).toBe(false)
      expect(viableWorkHelper.fieldsFor(type, { typeReason: 'kept' })).toMatchObject({ typeReason: 'kept' })
      expect(registry.validator(type)({ ...base, [FORMER_CODES_FIELD]: [...former, 'US-OVER'] }), type).toBe(false)
      expect(registry.validator(type)({ ...base, typeBy: null }), type).toBe(true)
    }
  })

  test('each kind declares its own fields and refuses another kind\'s', () => {
    const spec = ajv.compile(ViableSpecCardFieldsSchema)
    const feature = ajv.compile(ViableFeatureFieldsSchema)
    const task = ajv.compile(ViableTaskFieldsSchema)
    const story = ajv.compile(ViableWorkcardFieldsSchema)

    expect(spec({ warning: '2 of 3', origin: ViableSpecOrigin.Together })).toBe(true)
    expect(spec({ area: ProjectArea.User })).toBe(false)
    expect(feature({ area: ProjectArea.Admin, actor: null, kind: UserStoryKind.Flow })).toBe(true)
    expect(feature({ primary: false })).toBe(false)
    expect(task({ warning: '' })).toBe(true)
    expect(task({ value: 'secret' })).toBe(false)
    expect(story({ area: ProjectArea.User, primary: false, typeBy: ViableTypeBy.Person, formerCodes: ['FEAT-ABCDE'] })).toBe(true)
  })

  test('a project records the confirm\'s choice — preview only or the first spec implemented', () => {
    const project = ajv.compile(ViableProjectFieldsSchema)

    expect(project({ initScope: ViableInitScope.Implement })).toBe(true)
    expect(project({ initScope: ViableInitScope.Preview })).toBe(true)
    expect(project({ initScope: null })).toBe(true)
    expect(project({ initScope: 'everything' })).toBe(false)
  })
})

describe('viable-common — the work helper', () => {
  test('tells work cards and containers apart and finds a member\'s container', () => {
    const card = (type: string) => ({ kind: WorkcardKind.Card, type }) as never
    expect(viableWorkHelper.isWorkCard(card(VIABLE_TASK_TYPE))).toBe(true)
    expect(viableWorkHelper.isWorkCard(card('viable:bug'))).toBe(false)
    expect(viableWorkHelper.isWorkCard({ kind: WorkcardKind.Project, type: VIABLE_USER_STORY_TYPE } as never)).toBe(false)
    expect(viableWorkHelper.isContainer(card(VIABLE_FEATURE_TYPE))).toBe(true)
    expect(viableWorkHelper.isContainer(card(VIABLE_USER_STORY_TYPE))).toBe(false)
    expect(viableWorkHelper.containerIdOf({ parent: 'project', parents: ['project', 'spec'] })).toBe('spec')
    expect(viableWorkHelper.containerIdOf({ parent: 'project', parents: ['project'] })).toBeUndefined()
  })

  test('fits fields to a type: undeclared keys dropped, a story\'s required ones filled', () => {
    const story = { area: ProjectArea.User, primary: false, landing: true, actor: 'human', formerCodes: ['FEAT-AAAAA'] }

    expect(viableWorkHelper.fieldsFor(VIABLE_TASK_TYPE, story)).toEqual({ formerCodes: ['FEAT-AAAAA'] })
    expect(viableWorkHelper.fieldsFor(VIABLE_FEATURE_TYPE, story)).toEqual({ area: ProjectArea.User, actor: 'human', formerCodes: ['FEAT-AAAAA'] })
    expect(viableWorkHelper.fieldsFor(VIABLE_USER_STORY_TYPE, { warning: 'x' })).toEqual({ warning: 'x', area: ProjectArea.Guest, primary: false })
    expect(viableWorkHelper.unsetFor(VIABLE_TASK_TYPE, story)).toEqual(['fields.area', 'fields.primary', 'fields.landing', 'fields.actor'])
  })
})

describe('viable-common — work documents', () => {
  test('a plan names its members, steps, targets and outcomes, and only grows optional', () => {
    const plan = ajv.compile(WorkPlanSchema)

    expect(plan({ version: WORK_PLAN_VERSION, steps: ['design', 'implement'] })).toBe(true)
    expect(plan({
      version: WORK_PLAN_VERSION,
      members: [{ card: 'c1', code: 'US-AAAAA' }, { card: 'c2', code: null }],
      steps: ['registry', 'api', 'reconcile'],
      targets: [{ unit: 'IMP-AAAAA', part: 'screen:orders', path: 'sources/web/src/orders.tsx', change: 'Sort by date' }],
      helpers: ['widget'], rationale: 'Only the list changes', decisions: ['One orders store'], notes: null,
      outcomes: [{ card: 'c1', outcome: WorkOutcome.Completed }, { card: 'c2', outcome: WorkOutcome.Dropped, reason: 'design failed' }],
    })).toBe(true)
    expect(plan({
      version: WORK_PLAN_VERSION, steps: [],
      drafts: [{ ref: 'd-1', narrative: 'As a manager, I export the orders', area: 'admin' }, { ref: 'd-2', narrative: 'x', card: 'c9', code: 'US-BBBBB' }],
    })).toBe(true)
    expect(plan({ version: WORK_PLAN_VERSION, steps: [], drafts: [{ ref: 'd-1', narrative: '' }] })).toBe(false)
    expect(plan({ version: WORK_PLAN_VERSION })).toBe(false)
    expect(plan({ version: WORK_PLAN_VERSION, steps: [], targets: [{ unit: 'x', part: 'y' }] })).toBe(false)
  })

  test('a task\'s operations carry names, statuses, counts and backup ids — never a value', () => {
    const operations = ajv.compile(TaskOperationsSchema)
    const operation = { id: 'op-1', kind: TaskOperationKind.DatabaseChange, name: 'orders', status: TaskOperationStatus.Done, backupId: 'b-1', rows: 3 }

    expect(operations({ version: TASK_OPERATIONS_VERSION, operations: [operation] })).toBe(true)
    expect(operations({ version: TASK_OPERATIONS_VERSION, operations: [{ ...operation, value: 'new' }] })).toBe(false)
    expect(operations({ version: TASK_OPERATIONS_VERSION, operations: [{ ...operation, kind: TaskOperationKind.Secret, name: 'STRIPE_KEY', status: TaskOperationStatus.Waiting }] })).toBe(true)
  })

  test('proposals are accepted or dismissed one by one', () => {
    const proposals = ajv.compile(WorkProposalsSchema)
    const item = { id: 'p-1', kind: WorkProposalKind.Focus, title: 'Move exports out', status: WorkProposalStatus.Open, requirements: ['R3'] }

    expect(proposals({ version: WORK_PROPOSALS_VERSION, items: [item] })).toBe(true)
    expect(proposals({ version: WORK_PROPOSALS_VERSION, items: [{ ...item, requirements: ['X1'] }] })).toBe(false)
    expect(proposals({ version: WORK_PROPOSALS_VERSION, items: [{ ...item, status: 'maybe' }] })).toBe(false)
  })
})
