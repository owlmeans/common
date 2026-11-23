import type { JSONSchemaType } from 'ajv'
import {
  TASK_OPERATIONS_MAX, TaskOperationKind, TaskOperationStatus, WORK_NAME_MAX, WORK_PLAN_LIST_MAX, WORK_PROPOSALS_MAX,
  WORK_STEP_KEY_MAX, WORK_TEXT_MAX, WorkOutcome, WorkProposalKind, WorkProposalStatus,
} from './consts.js'
import type { TaskOperation, TaskOperations, WorkPlan, WorkProposal, WorkProposals } from './types.js'

const text = (max: number = WORK_TEXT_MAX) => ({ type: 'string', maxLength: max }) as const
const name = { type: 'string', minLength: 1, maxLength: WORK_NAME_MAX } as const
const stepKey = { type: 'string', minLength: 1, maxLength: WORK_STEP_KEY_MAX } as const
const list = (items: object, max: number = WORK_PLAN_LIST_MAX) => ({ type: 'array', items, maxItems: max, nullable: true })

/**
 * The `plan` slot's body — a run's plan (`WORK_PLAN_VERSION`).
 *
 * Validated by the planning store before every write, like the design and the requirements. A
 * stored document only grows optional: a field added later is optional and nullable here. `steps`
 * and `helpers` are the engine's step catalogue keys — the catalogue, not this schema, decides
 * which exist.
 */
export const WorkPlanSchema = {
  type: 'object',
  title: 'WorkPlan',
  description: 'A run\'s plan: its members, the steps it takes and the pieces it changes',
  properties: {
    version: { type: 'integer', minimum: 1 },
    members: list({
      type: 'object',
      properties: { card: name, code: { ...name, nullable: true } },
      required: ['card'],
      additionalProperties: false,
    }),
    drafts: list({
      type: 'object',
      properties: {
        ref: { type: 'string', minLength: 1, maxLength: 64 },
        narrative: { ...text(), minLength: 1 },
        area: { ...name, nullable: true },
        type: { ...name, nullable: true },
        card: { ...name, nullable: true },
        code: { ...name, nullable: true },
      },
      required: ['ref', 'narrative'],
      additionalProperties: false,
    }),
    steps: { type: 'array', items: stepKey, maxItems: WORK_PLAN_LIST_MAX },
    targets: list({
      type: 'object',
      properties: {
        unit: name,
        part: name,
        path: { ...text(1024), nullable: true },
        change: text(),
      },
      required: ['unit', 'part', 'change'],
      additionalProperties: false,
    }),
    helpers: list(stepKey),
    rationale: { ...text(), nullable: true },
    decisions: list(text()),
    notes: list(text()),
    outcomes: list({
      type: 'object',
      properties: {
        card: name,
        outcome: { type: 'string', enum: Object.values(WorkOutcome) },
        reason: { ...text(), nullable: true },
      },
      required: ['card', 'outcome'],
      additionalProperties: false,
    }),
  },
  required: ['version', 'steps'],
  additionalProperties: false,
} as unknown as JSONSchemaType<WorkPlan>

/** One task operation as it is STORED — names, statuses, counts and backup ids; there is no field a value could travel in. */
export const TaskOperationSchema = {
  type: 'object',
  title: 'TaskOperation',
  properties: {
    id: { type: 'string', minLength: 1, maxLength: 64 },
    kind: { type: 'string', enum: Object.values(TaskOperationKind) },
    name,
    status: { type: 'string', enum: Object.values(TaskOperationStatus) },
    backupId: { ...name, nullable: true },
    rows: { type: 'integer', minimum: 0, nullable: true },
    note: { ...text(1024), nullable: true },
  },
  required: ['id', 'kind', 'name', 'status'],
  additionalProperties: false,
} as unknown as JSONSchemaType<TaskOperation>

/** The `operations` slot's body of a task card (`TASK_OPERATIONS_VERSION`). */
export const TaskOperationsSchema = {
  type: 'object',
  title: 'TaskOperations',
  description: 'What a task did: the operations, never a value',
  properties: {
    version: { type: 'integer', minimum: 1 },
    operations: { type: 'array', items: TaskOperationSchema, maxItems: TASK_OPERATIONS_MAX },
  },
  required: ['version', 'operations'],
  additionalProperties: false,
} as unknown as JSONSchemaType<TaskOperations>

export const WorkProposalSchema = {
  type: 'object',
  title: 'WorkProposal',
  properties: {
    id: { type: 'string', minLength: 1, maxLength: 64 },
    kind: { type: 'string', enum: Object.values(WorkProposalKind) },
    title: name,
    summary: { ...text(), nullable: true },
    type: { ...name, nullable: true },
    cards: list(name),
    requirements: list({ type: 'string', pattern: '^[RS][0-9]+$' }),
    status: { type: 'string', enum: Object.values(WorkProposalStatus) },
    reason: { ...text(), nullable: true },
  },
  required: ['id', 'kind', 'title', 'status'],
  additionalProperties: false,
} as unknown as JSONSchemaType<WorkProposal>

/** The `proposals` slot's body (`WORK_PROPOSALS_VERSION`): a feature's focus split, a spec's derived members. */
export const WorkProposalsSchema = {
  type: 'object',
  title: 'WorkProposals',
  description: 'What a review proposes for a card — the person accepts or dismisses each one',
  properties: {
    version: { type: 'integer', minimum: 1 },
    items: { type: 'array', items: WorkProposalSchema, maxItems: WORK_PROPOSALS_MAX },
  },
  required: ['version', 'items'],
  additionalProperties: false,
} as unknown as JSONSchemaType<WorkProposals>
