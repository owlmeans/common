import { IntrinsicPolicy, IntrinsicStatus, SpecificationFormat, WorkcardKind } from '@owlmeans/planning'
import type {
  AnyTypeSchema, ProjectTypeSchema, RelationshipType, SpecificationSlot, StatusFlowSchema,
  WorkcardTypeSchema,
} from '@owlmeans/planning'
import { STORY_DESIGN_VERSION } from '../design/consts.js'
import { StoryDesignSchema } from '../design/schemas.js'
import { ScaffoldPlanSchema } from '../scaffold/schemas.js'
import {
  VIABLE_BUG_CODE, VIABLE_BUG_TYPE, VIABLE_DESIGN_REVISIONS_KEPT, VIABLE_IMPROVEMENT_CODE,
  VIABLE_IMPROVEMENT_TYPE, VIABLE_PROJECT_CODE, VIABLE_PROJECT_FLOW, VIABLE_PROJECT_TYPE,
  VIABLE_REQUIREMENT_CODE, VIABLE_REQUIREMENT_TYPE, VIABLE_SPEC_FLOW, VIABLE_SPEC_TYPE,
  VIABLE_STORY_CODE, VIABLE_STORY_FLOW, VIABLE_STORY_TYPE, ViableProjectStatus,
  ViableProjectTransition, ViableRelationship, ViableSpecCategory, ViableSpecStatus,
  ViableStoryStatus, ViableStoryTransition, ViableTone,
} from './consts.js'
import {
  ViableOpenFieldsSchema, ViableProjectFieldsSchema, ViableSpecFieldsSchema, ViableStoryFieldsSchema,
} from './schemas.js'

/**
 * The story flow.
 *
 * `failed` maps to PLANNED: a failed story is work still to do, so "done" is the closed count and
 * a retry is simply `start` again. `reset` from anywhere is the manual recovery — the one move a
 * completed story still accepts.
 */
export const VIABLE_STORY_FLOW_SCHEMA: StatusFlowSchema = {
  id: VIABLE_STORY_FLOW,
  version: 1,
  statuses: [
    { key: ViableStoryStatus.Planned, intrinsic: IntrinsicStatus.Planned, initial: true, tone: ViableTone.Blue },
    { key: ViableStoryStatus.InProgress, intrinsic: IntrinsicStatus.InProgress, tone: ViableTone.Yellow },
    { key: ViableStoryStatus.Completed, intrinsic: IntrinsicStatus.Closed, tone: ViableTone.Green },
    { key: ViableStoryStatus.Failed, intrinsic: IntrinsicStatus.Planned, tone: ViableTone.Red },
  ],
  transitions: [
    {
      name: ViableStoryTransition.Start,
      from: [ViableStoryStatus.Planned, ViableStoryStatus.Failed],
      to: ViableStoryStatus.InProgress,
      explicit: true,
    },
    {
      name: ViableStoryTransition.Complete,
      from: [ViableStoryStatus.InProgress],
      to: ViableStoryStatus.Completed,
      explicit: true,
    },
    {
      name: ViableStoryTransition.Fail,
      from: [ViableStoryStatus.InProgress],
      to: ViableStoryStatus.Failed,
    },
    { name: ViableStoryTransition.Reset, from: '*', to: ViableStoryStatus.Planned, explicit: true },
  ],
}

/**
 * The project flow.
 *
 * A create lands at `draft`; confirming the brief is `confirm`; the end of an initialization is
 * `activate`. A reinitialization and a failed initialization are SLOT facts, not transitions, and
 * destroying a project is a `delete` plus the platform's cascade — never `archive`.
 */
export const VIABLE_PROJECT_FLOW_SCHEMA: StatusFlowSchema = {
  id: VIABLE_PROJECT_FLOW,
  version: 1,
  statuses: [
    { key: ViableProjectStatus.Draft, intrinsic: IntrinsicStatus.Planned, initial: true, tone: ViableTone.Blue },
    { key: ViableProjectStatus.Confirmed, intrinsic: IntrinsicStatus.InProgress, tone: ViableTone.Yellow },
    { key: ViableProjectStatus.Active, intrinsic: IntrinsicStatus.InProgress, tone: ViableTone.Green },
    { key: ViableProjectStatus.Archived, intrinsic: IntrinsicStatus.Closed, tone: ViableTone.Neutral },
  ],
  transitions: [
    {
      name: ViableProjectTransition.Confirm,
      from: [ViableProjectStatus.Draft],
      to: ViableProjectStatus.Confirmed,
      explicit: true,
    },
    {
      name: ViableProjectTransition.Activate,
      from: [ViableProjectStatus.Confirmed],
      to: ViableProjectStatus.Active,
    },
    { name: ViableProjectTransition.Archive, from: '*', to: ViableProjectStatus.Archived, explicit: true },
    {
      name: ViableProjectTransition.Reopen,
      from: [ViableProjectStatus.Archived],
      to: ViableProjectStatus.Active,
      explicit: true,
    },
  ],
}

/** A document is written or revised; it has no lifecycle to move through. */
export const VIABLE_SPEC_FLOW_SCHEMA: StatusFlowSchema = {
  id: VIABLE_SPEC_FLOW,
  version: 1,
  statuses: [
    { key: ViableSpecStatus.Current, intrinsic: IntrinsicStatus.Closed, initial: true, tone: ViableTone.Neutral },
  ],
  transitions: [],
}

const slot = (
  category: ViableSpecCategory, format: SpecificationFormat, extra: Partial<SpecificationSlot> = {},
): SpecificationSlot => ({ category, format, type: VIABLE_SPEC_TYPE, ...extra })

/** The brief a person confirms, and the plan the scaffold draws from it. */
export const VIABLE_PROJECT_SLOTS: SpecificationSlot[] = [
  slot(ViableSpecCategory.Specification, SpecificationFormat.Markdown, { required: true }),
  slot(ViableSpecCategory.Vision, SpecificationFormat.Markdown),
  slot(ViableSpecCategory.DesignSystem, SpecificationFormat.Markdown),
  slot(ViableSpecCategory.Scaffold, SpecificationFormat.Json, {
    revisioned: true, keepRevisions: VIABLE_DESIGN_REVISIONS_KEPT, schema: ScaffoldPlanSchema,
  }),
]

/** A story's design — the payload the implementation stage consumes. */
export const VIABLE_STORY_SLOTS: SpecificationSlot[] = [
  slot(ViableSpecCategory.Design, SpecificationFormat.Json, {
    revisioned: true,
    keepRevisions: VIABLE_DESIGN_REVISIONS_KEPT,
    schema: StoryDesignSchema,
    version: STORY_DESIGN_VERSION,
  }),
]

const storyLink = (name: ViableRelationship): RelationshipType =>
  ({ name, from: [VIABLE_STORY_TYPE], to: [VIABLE_STORY_TYPE], single: true })

export const VIABLE_STORY_RELATIONSHIPS: RelationshipType[] = [
  storyLink(ViableRelationship.Follows),
  storyLink(ViableRelationship.SharesWidget),
  storyLink(ViableRelationship.SharesScreen),
]

export const VIABLE_PROJECT_TYPE_SCHEMA: ProjectTypeSchema = {
  type: VIABLE_PROJECT_TYPE,
  kind: WorkcardKind.Project,
  version: 1,
  fields: ViableProjectFieldsSchema,
  flows: [VIABLE_PROJECT_FLOW],
  intrinsic: IntrinsicPolicy.Primary,
  specifications: VIABLE_PROJECT_SLOTS,
  code: VIABLE_PROJECT_CODE,
  cardTypes: [VIABLE_STORY_TYPE],
}

export const VIABLE_STORY_TYPE_SCHEMA: WorkcardTypeSchema = {
  type: VIABLE_STORY_TYPE,
  kind: WorkcardKind.Card,
  version: 1,
  fields: ViableStoryFieldsSchema,
  flows: [VIABLE_STORY_FLOW],
  intrinsic: IntrinsicPolicy.Primary,
  specifications: VIABLE_STORY_SLOTS,
  relationships: VIABLE_STORY_RELATIONSHIPS,
  code: VIABLE_STORY_CODE,
}

export const VIABLE_SPEC_TYPE_SCHEMA: WorkcardTypeSchema = {
  type: VIABLE_SPEC_TYPE,
  kind: WorkcardKind.Specification,
  version: 1,
  fields: ViableSpecFieldsSchema,
  flows: [VIABLE_SPEC_FLOW],
  specifications: [],
}

const reserved = (type: string, code: WorkcardTypeSchema['code']): WorkcardTypeSchema => ({
  type,
  kind: WorkcardKind.Card,
  version: 1,
  fields: ViableOpenFieldsSchema,
  flows: [VIABLE_STORY_FLOW],
  intrinsic: IntrinsicPolicy.Primary,
  specifications: [],
  code,
})

/** Registered so their prefixes and flow are decided once; not creatable under a project yet. */
export const VIABLE_RESERVED_TYPE_SCHEMAS: WorkcardTypeSchema[] = [
  reserved(VIABLE_BUG_TYPE, VIABLE_BUG_CODE),
  reserved(VIABLE_IMPROVEMENT_TYPE, VIABLE_IMPROVEMENT_CODE),
  reserved(VIABLE_REQUIREMENT_TYPE, VIABLE_REQUIREMENT_CODE),
]

/** Every Viable type — what a planning plugin registers. */
export const VIABLE_TYPE_SCHEMAS: AnyTypeSchema[] = [
  VIABLE_PROJECT_TYPE_SCHEMA,
  VIABLE_STORY_TYPE_SCHEMA,
  VIABLE_SPEC_TYPE_SCHEMA,
  ...VIABLE_RESERVED_TYPE_SCHEMAS,
]

/** Every Viable flow — registered beside the types. */
export const VIABLE_FLOW_SCHEMAS: StatusFlowSchema[] = [
  VIABLE_PROJECT_FLOW_SCHEMA,
  VIABLE_STORY_FLOW_SCHEMA,
  VIABLE_SPEC_FLOW_SCHEMA,
]
