import {
  CodeScope, CodeStyle, CommitState, IntrinsicPolicy, IntrinsicStatus, SpecificationFormat,
  TransitionAction, WorkcardKind,
} from '../src/consts.js'
import { makeSchemaRegistry } from '../src/registry.js'
import type {
  PlanningSchemaRegistry, ProjectTypeSchema, StatusFlowSchema, Transition, WorkcardTypeSchema,
} from '../src/types.js'

export const ENTITY = 'entity-1'
export const AT = '2026-09-16T10:00:00.000Z'
export const LATER = '2026-09-16T11:00:00.000Z'

/** The story shape: `start` declared twice (from planned, from failed), `reset` from anywhere. */
export const STORY_FLOW: StatusFlowSchema = {
  id: 'test:story',
  version: 1,
  statuses: [
    { key: 'planned', intrinsic: IntrinsicStatus.Planned, initial: true },
    { key: 'in-progress', intrinsic: IntrinsicStatus.InProgress },
    { key: 'completed', intrinsic: IntrinsicStatus.Closed, terminal: true },
    { key: 'failed', intrinsic: IntrinsicStatus.Planned },
  ],
  transitions: [
    { name: 'start', from: ['planned'], to: 'in-progress', explicit: true },
    { name: 'complete', from: ['in-progress'], to: 'completed' },
    { name: 'fail', from: ['in-progress'], to: 'failed' },
    { name: 'reset', from: '*', to: 'planned', explicit: true },
    { name: 'start', from: ['failed'], to: 'in-progress', explicit: true },
  ],
}

/** A second flow: its `reopen` wildcard is declared BEFORE the specific rule it must lose to. */
export const REVIEW_FLOW: StatusFlowSchema = {
  id: 'test:review',
  version: 1,
  statuses: [
    { key: 'pending', intrinsic: IntrinsicStatus.Planned, initial: true },
    { key: 'reviewing', intrinsic: IntrinsicStatus.InProgress },
    { key: 'approved', intrinsic: IntrinsicStatus.Closed },
  ],
  transitions: [
    { name: 'review', from: ['pending'], to: 'reviewing' },
    { name: 'approve', from: ['reviewing'], to: 'approved' },
    { name: 'reopen', from: '*', to: 'pending' },
    { name: 'reopen', from: ['approved'], to: 'reviewing' },
  ],
}

export const STORY_TYPE: WorkcardTypeSchema = {
  type: 'test:story',
  kind: WorkcardKind.Card,
  version: 1,
  fields: {
    type: 'object',
    properties: {
      area: { type: 'string', enum: ['guest', 'user'] },
      primary: { type: 'boolean' },
      warning: { type: 'string', nullable: true },
    },
    required: ['area', 'primary'],
    additionalProperties: false,
  },
  flows: [STORY_FLOW.id],
  specifications: [
    { category: 'design', format: SpecificationFormat.Json, revisioned: true, keepRevisions: 3 },
  ],
  relationships: [{ name: 'follows', single: true }],
  labels: ['ui', 'api'],
  code: { prefix: 'US-', style: CodeStyle.Random, length: 5, uppercase: true, uniqueWithin: CodeScope.Parent },
}

/** Runs both flows; closed only when both are. */
export const TASK_TYPE: WorkcardTypeSchema = {
  type: 'test:task',
  kind: WorkcardKind.Card,
  version: 1,
  fields: { type: 'object', additionalProperties: true },
  flows: [STORY_FLOW.id, REVIEW_FLOW.id],
  intrinsic: IntrinsicPolicy.All,
  specifications: [],
}

export const PROJECT_TYPE: ProjectTypeSchema = {
  type: 'test:project',
  kind: WorkcardKind.Project,
  version: 1,
  fields: { type: 'object', additionalProperties: true },
  flows: [STORY_FLOW.id],
  specifications: [
    { category: 'specification', format: SpecificationFormat.Markdown, required: true },
    { category: 'scaffold', format: SpecificationFormat.Json, revisioned: true, keepRevisions: 3 },
  ],
  cardTypes: [STORY_TYPE.type, TASK_TYPE.type],
  code: { style: CodeStyle.Slug, uniqueWithin: CodeScope.Entity },
}

export const SPEC_TYPE: WorkcardTypeSchema = {
  type: 'test:spec',
  kind: WorkcardKind.Specification,
  version: 1,
  fields: { type: 'object', additionalProperties: true },
  flows: [STORY_FLOW.id],
  specifications: [],
}

export const makeRegistry = (): PlanningSchemaRegistry => makeSchemaRegistry({
  flows: [STORY_FLOW, REVIEW_FLOW],
  types: [STORY_TYPE, TASK_TYPE, PROJECT_TYPE, SPEC_TYPE],
})

/** A transition with everything a fold does not care about filled in. */
export const transitionOf = (partial: Partial<Transition> & Pick<Transition, 'card' | 'seq' | 'action'>): Transition => ({
  entityId: ENTITY,
  kind: WorkcardKind.Card,
  type: STORY_TYPE.type,
  changes: {},
  actor: {},
  at: AT,
  commit: { state: CommitState.Pending },
  ...partial,
})

export { TransitionAction }
