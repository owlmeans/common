import type { JSONSchemaType } from 'ajv'
import { CODE_MAX, MAX_FORMER_CODES, IntrinsicPolicy, IntrinsicStatus, SpecificationFormat, WorkcardKind, AnyTypeSchema, ProjectTypeSchema, RelationshipType, SpecificationSlot, StatusFlowSchema, WorkcardTypeSchema } from '@owlmeans/planning'
import { AREA_KEY_MAX, AREA_KEY_PATTERN, ORIGIN_TENANCY_LIST_MAX, ORIGIN_TENANCY_WORD_MAX, TENANCY_QUOTE_MAX } from '../areas/consts.js'
import { TARGET_AREA_MAX } from '../topology/apps/consts.js'
import { ViableAppsDecisionSchema } from '../topology/schemas.js'
import { ViableStructureDecisionSchema } from '../topology/structure/schemas.js'
import { BOT_PLATFORM_ID_FORMAT, BOT_PLATFORMS_MAX, BotKit, CASE_QUOTE_MAX, WorkKind } from '../stack/consts.js'
import { REQUIREMENTS_VERSION, UserStoryKind } from '../ba/consts.js'
import { RequirementsDocumentSchema } from '../ba/schemas.js'
import { ConnectLlm, ConnectTarget } from '../connect/consts.js'
import { WorkMode } from '../execution/consts.js'
import { ProjectOriginSchema } from '../convert/schemas.js'
import { WorkcardActor, WORKCARD_DESIGN_VERSION } from '../design/consts.js'
import type { ViableFeatureFields, ViableImprovementFields, ViableProjectFields, ViableSpecCardFields, ViableTaskFields, ViableWorkcardFields } from './types.js'
import { WorkcardDesignSchema } from '../design/schemas.js'
import { ScaffoldPlanSchema } from '../scaffold/schemas.js'
import { TASK_OPERATIONS_VERSION, WORK_PLAN_VERSION, WORK_PROPOSALS_VERSION } from '../work/consts.js'
import { TaskOperationsSchema, WorkPlanSchema, WorkProposalsSchema } from '../work/schemas.js'
import { VIABLE_BUG_CODE, VIABLE_BUG_TYPE, VIABLE_DESIGN_REVISIONS_KEPT, VIABLE_FEATURE_CODE, VIABLE_FEATURE_MEMBERS, VIABLE_FEATURE_TYPE, VIABLE_IMPROVEMENT_CODE, VIABLE_IMPROVEMENT_TYPE, VIABLE_PROJECT_CODE, VIABLE_PROJECT_FLOW, VIABLE_PROJECT_TYPE, VIABLE_REQUIREMENT_CODE, VIABLE_REQUIREMENT_TYPE, VIABLE_SPEC_CARD_CODE, VIABLE_SPEC_CARD_MEMBERS, VIABLE_SPEC_CARD_TYPE, VIABLE_SPEC_FLOW, VIABLE_SPEC_TYPE, VIABLE_TASK_CODE, VIABLE_TASK_TYPE, VIABLE_USER_STORY_CODE, VIABLE_WORK_FLOW, VIABLE_WORK_TYPES, VIABLE_WORKCARD_FLOW, VIABLE_USER_STORY_TYPE, ViableProjectStatus, ViableProjectTransition, ViableRelationship, ViableInitScope, ViableSpecCategory, ViableSpecOrigin, ViableSpecStatus, ViableTypeBy, ViableWorkcardStatus, ViableWorkcardTransition, ViableTone, VIABLE_TYPE_REASON_MAX, VIABLE_BLUEPRINT_SOURCES } from './consts.js'

/**
 * The `fields` schema of a `viable:project` card.
 *
 * A record-element schema: hand-written, cast, every optional key nullable with its type, every
 * nullable enum listing `null`. Plain strings where the vocabulary grows in a library this record
 * does not redeploy with (blueprint, case, game kind).
 */
export const ViableProjectFieldsSchema = {
  type: 'object',
  properties: {
    formerAliases: {
      type: 'array', items: { type: 'string', minLength: 1, maxLength: CODE_MAX }, nullable: true,
    },
    language: { type: 'string', minLength: 2, maxLength: 16, nullable: true },
    blueprint: { type: 'string', minLength: 1, maxLength: 64, nullable: true },
    blueprintCase: { type: 'string', minLength: 1, maxLength: 64, nullable: true },
    gameKind: { type: 'string', minLength: 1, maxLength: 64, nullable: true },
    workKind: { type: 'string', enum: [...Object.values(WorkKind), null], nullable: true },
    botPlatforms: {
      type: 'array',
      items: { type: 'string', pattern: BOT_PLATFORM_ID_FORMAT },
      minItems: 1,
      maxItems: BOT_PLATFORMS_MAX,
      uniqueItems: true,
      nullable: true,
    },
    botKit: { type: 'string', enum: [...Object.values(BotKit), null], nullable: true },
    caseQuote: { type: 'string', minLength: 1, maxLength: CASE_QUOTE_MAX, nullable: true },
    target: { type: 'string', enum: [...Object.values(ConnectTarget), null], nullable: true },
    origin: { ...ProjectOriginSchema, nullable: true },
    connectLlmMode: { type: 'string', enum: [...Object.values(ConnectLlm), null], nullable: true },
    workMode: { type: 'string', enum: [...Object.values(WorkMode), null], nullable: true },
    // `story: null` is a DECIDED "no gate" and must stay spellable; an absent `landing` is "never
    // decided". `at` carries no `format`: the planning registry compiles without ajv-formats.
    landing: {
      type: 'object',
      nullable: true,
      properties: {
        story: { type: 'string', minLength: 1, maxLength: CODE_MAX, nullable: true },
        at: { type: 'string', minLength: 1, maxLength: 32 },
      },
      required: ['at'],
      additionalProperties: false,
    },
    // An absent `tenancy` is "never decided"; a recorded one always carries both flags, so a
    // reader never has to guess what a missing flag meant.
    tenancy: {
      type: 'object',
      nullable: true,
      properties: {
        operators: { type: 'boolean' },
        users: { type: 'boolean' },
        quotes: {
          type: 'object',
          nullable: true,
          properties: {
            operators: { type: 'string', minLength: 1, maxLength: TENANCY_QUOTE_MAX, nullable: true },
            users: { type: 'string', minLength: 1, maxLength: TENANCY_QUOTE_MAX, nullable: true },
          },
          required: [],
          additionalProperties: false,
        },
        by: { type: 'string', enum: ['model', 'owner'] },
        at: { type: 'string', minLength: 1, maxLength: 32 },
        // A converted project's origin tenant, compacted (`OriginTenancyFacts`). Bounded like
        // every list a card carries: the card rides on every planning read.
        origin: {
          type: 'object',
          nullable: true,
          properties: {
            label: { type: 'string', minLength: 1, maxLength: ORIGIN_TENANCY_WORD_MAX },
            keys: {
              type: 'array',
              items: { type: 'string', minLength: 1, maxLength: ORIGIN_TENANCY_WORD_MAX },
              maxItems: ORIGIN_TENANCY_LIST_MAX,
            },
            people: {
              type: 'array',
              items: { type: 'string', minLength: 1, maxLength: ORIGIN_TENANCY_WORD_MAX },
              maxItems: ORIGIN_TENANCY_LIST_MAX,
            },
          },
          required: ['label', 'keys', 'people'],
          additionalProperties: false,
        },
      },
      required: ['operators', 'users', 'by', 'at'],
      additionalProperties: false,
    },
    // An absent `apps` is one app, `main`, over the four standard areas — never written for a
    // project that has not been split. The rules between entries are `appMapHelper.validate`'s.
    apps: { ...ViableAppsDecisionSchema, nullable: true },
    // An absent `structure` is the one `apps` derives — written only when it differs. No `format` and
    // no `multipleOf` inside it: the browser's planning validator refuses both.
    structure: { ...ViableStructureDecisionSchema, nullable: true },
    caseBy: { type: 'string', enum: [...VIABLE_BLUEPRINT_SOURCES, null], nullable: true },
    // The confirm's choice — absent (or `null`) is the preview.
    initScope: { type: 'string', enum: [...Object.values(ViableInitScope), null], nullable: true },
  },
  required: [],
  additionalProperties: false,
} as unknown as JSONSchemaType<ViableProjectFields>

/** Who decided the type — a nullable enum carrying `null`. */
const typeByProperty = () => ({ type: 'string', enum: [...Object.values(ViableTypeBy), null], nullable: true })

/** The codes a retype took from the card (`@owlmeans/planning`'s `formerCodes`), oldest first. */
const formerCodesProperty = () => ({
  type: 'array', items: { type: 'string', minLength: 1, maxLength: CODE_MAX }, maxItems: MAX_FORMER_CODES, nullable: true,
})

const warningProperty = () => ({ type: 'string', maxLength: 1024, nullable: true })

/** Why the type check retyped the card (`typeBy: model`) — cleared by a person's retype. */
const typeReasonProperty = () => ({ type: 'string', maxLength: VIABLE_TYPE_REASON_MAX, nullable: true })

const areaProperty = () => ({ type: 'string', minLength: 1, maxLength: AREA_KEY_MAX, pattern: AREA_KEY_PATTERN.source })

const areasProperty = () => ({
  type: 'array',
  items: areaProperty(),
  maxItems: TARGET_AREA_MAX,
  uniqueItems: true,
  nullable: true,
})

/**
 * The `fields` schema of a `viable:user-story` card.
 *
 * `area` is required, and a create that carries none is still valid by the time it is checked:
 * validation runs after the planning middlewares, and the viable plugin's re-format hook fills the
 * area of a narrative a person wrote. It is the area's KEY — a kebab-case slug, so every card written
 * with one of the four standard kinds (`'user'`) validates unchanged; whether the project's map knows
 * the key is the writer's check, never the schema's.
 */
export const ViableWorkcardFieldsSchema = {
  type: 'object',
  properties: {
    area: areaProperty(),
    primary: { type: 'boolean' },
    actor: { type: 'string', enum: [...Object.values(WorkcardActor), null], nullable: true },
    warning: warningProperty(),
    kind: { type: 'string', enum: [...Object.values(UserStoryKind), null], nullable: true },
    landing: { type: 'boolean', nullable: true },
    areas: areasProperty(),
    typeBy: typeByProperty(),
    typeReason: typeReasonProperty(),
    formerCodes: formerCodesProperty(),
  },
  required: ['area', 'primary'],
  additionalProperties: false,
} as unknown as JSONSchemaType<ViableWorkcardFields>

/** The `fields` schema of a `viable:spec-card`. */
export const ViableSpecCardFieldsSchema = {
  type: 'object',
  properties: {
    warning: warningProperty(),
    origin: { type: 'string', enum: [...Object.values(ViableSpecOrigin), null], nullable: true },
    typeBy: typeByProperty(),
    typeReason: typeReasonProperty(),
    formerCodes: formerCodesProperty(),
  },
  required: [],
  additionalProperties: false,
} as unknown as JSONSchemaType<ViableSpecCardFields>

/**
 * The `fields` schema of a `viable:feature`. `area` is the role the capability serves; optional here
 * because a person's create may leave it to the formatting, which fills it before the write.
 */
export const ViableFeatureFieldsSchema = {
  type: 'object',
  properties: {
    area: { ...areaProperty(), nullable: true },
    actor: { type: 'string', enum: [...Object.values(WorkcardActor), null], nullable: true },
    warning: warningProperty(),
    kind: { type: 'string', enum: [...Object.values(UserStoryKind), null], nullable: true },
    typeBy: typeByProperty(),
    typeReason: typeReasonProperty(),
    formerCodes: formerCodesProperty(),
  },
  required: [],
  additionalProperties: false,
} as unknown as JSONSchemaType<ViableFeatureFields>

/** The `fields` schema of a `viable:improvement`. */
export const ViableImprovementFieldsSchema = {
  type: 'object',
  properties: {
    area: { ...areaProperty(), nullable: true },
    areas: areasProperty(),
    warning: warningProperty(),
    kind: { type: 'string', enum: [...Object.values(UserStoryKind), null], nullable: true },
    typeBy: typeByProperty(),
    typeReason: typeReasonProperty(),
    formerCodes: formerCodesProperty(),
  },
  required: [],
  additionalProperties: false,
} as unknown as JSONSchemaType<ViableImprovementFields>

/** The `fields` schema of a `viable:task` — names and states live in its `operations` document, values nowhere on the card. */
export const ViableTaskFieldsSchema = {
  type: 'object',
  properties: {
    warning: warningProperty(),
    typeBy: typeByProperty(),
    typeReason: typeReasonProperty(),
    formerCodes: formerCodesProperty(),
  },
  required: [],
  additionalProperties: false,
} as unknown as JSONSchemaType<ViableTaskFields>

/** The open `fields` of a reserved card type — nothing is decided about them yet. */
export const ViableOpenFieldsSchema = {
  type: 'object',
  properties: {},
  required: [],
  additionalProperties: true,
} as unknown as JSONSchemaType<Record<string, unknown>>

/** A document carries nothing under `fields`: its payload is the specification body. */
export const ViableSpecFieldsSchema = {
  type: 'object',
  properties: {},
  required: [],
  additionalProperties: false,
} as unknown as JSONSchemaType<Record<string, never>>

/**
 * The story flow.
 *
 * `failed` maps to PLANNED: a failed story is work still to do, so "done" is the closed count and
 * a retry is simply `start` again. `reset` from anywhere is the manual recovery — the one move a
 * completed story still accepts.
 */
export const VIABLE_WORKCARD_FLOW_SCHEMA: StatusFlowSchema = {
  id: VIABLE_WORKCARD_FLOW,
  version: 1,
  statuses: [
    { key: ViableWorkcardStatus.Planned, intrinsic: IntrinsicStatus.Planned, initial: true, tone: ViableTone.Blue },
    { key: ViableWorkcardStatus.InProgress, intrinsic: IntrinsicStatus.InProgress, tone: ViableTone.Yellow },
    { key: ViableWorkcardStatus.Completed, intrinsic: IntrinsicStatus.Closed, tone: ViableTone.Green },
    { key: ViableWorkcardStatus.Failed, intrinsic: IntrinsicStatus.Planned, tone: ViableTone.Red },
  ],
  transitions: [
    {
      name: ViableWorkcardTransition.Start,
      from: [ViableWorkcardStatus.Planned, ViableWorkcardStatus.Failed],
      to: ViableWorkcardStatus.InProgress,
      explicit: true,
    },
    {
      name: ViableWorkcardTransition.Complete,
      from: [ViableWorkcardStatus.InProgress],
      to: ViableWorkcardStatus.Completed,
      explicit: true,
    },
    {
      name: ViableWorkcardTransition.Fail,
      from: [ViableWorkcardStatus.InProgress],
      to: ViableWorkcardStatus.Failed,
    },
    { name: ViableWorkcardTransition.Reset, from: '*', to: ViableWorkcardStatus.Planned, explicit: true },
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

/** The stated requirements — the same slot on a project card and on a story card. */
const requirementsSlot = (): SpecificationSlot => slot(ViableSpecCategory.Requirements, SpecificationFormat.Json, {
  revisioned: true,
  keepRevisions: VIABLE_DESIGN_REVISIONS_KEPT,
  schema: RequirementsDocumentSchema,
  version: REQUIREMENTS_VERSION,
})

/** The brief a person confirms, the plan the scaffold draws from it, and the stated requirements. */
export const VIABLE_PROJECT_SLOTS: SpecificationSlot[] = [
  slot(ViableSpecCategory.Specification, SpecificationFormat.Markdown, { required: true }),
  slot(ViableSpecCategory.Vision, SpecificationFormat.Markdown),
  slot(ViableSpecCategory.DesignSystem, SpecificationFormat.Markdown),
  slot(ViableSpecCategory.Scaffold, SpecificationFormat.Json, {
    revisioned: true, keepRevisions: VIABLE_DESIGN_REVISIONS_KEPT, schema: ScaffoldPlanSchema,
  }),
  requirementsSlot(),
]

const revisionedJson = (category: ViableSpecCategory, schema: object, version: number): SpecificationSlot =>
  slot(category, SpecificationFormat.Json, { revisioned: true, keepRevisions: VIABLE_DESIGN_REVISIONS_KEPT, schema, version })

/**
 * Every work card's documents — ONE set for all five work types, so a retype never orphans one:
 * `design` (the payload the implementation consumes; a container's holds the run design), the stated
 * `requirements`, the run's `plan` (`WorkPlan`), a task's `operations` (`TaskOperations`) and the
 * review's `proposals` (`WorkProposals`).
 */
export const VIABLE_WORK_SLOTS: SpecificationSlot[] = [
  revisionedJson(ViableSpecCategory.Design, WorkcardDesignSchema, WORKCARD_DESIGN_VERSION),
  requirementsSlot(),
  revisionedJson(ViableSpecCategory.Plan, WorkPlanSchema, WORK_PLAN_VERSION),
  revisionedJson(ViableSpecCategory.Operations, TaskOperationsSchema, TASK_OPERATIONS_VERSION),
  revisionedJson(ViableSpecCategory.Proposals, WorkProposalsSchema, WORK_PROPOSALS_VERSION),
]

/** A user story's documents — the work set. */
export const VIABLE_WORKCARD_SLOTS: SpecificationSlot[] = VIABLE_WORK_SLOTS

const workcardLink = (name: ViableRelationship): RelationshipType =>
  ({ name, from: [...VIABLE_WORK_TYPES], to: [...VIABLE_WORK_TYPES], single: true })

export const VIABLE_WORKCARD_RELATIONSHIPS: RelationshipType[] = [
  workcardLink(ViableRelationship.Follows),
  workcardLink(ViableRelationship.SharesWidget),
  workcardLink(ViableRelationship.SharesScreen),
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
  cardTypes: [...VIABLE_WORK_TYPES],
}

/** The other work types a work card may become — every one, the rules (PV) say when. */
const retypesOf = (type: string): string[] => VIABLE_WORK_TYPES.filter(other => other !== type)

/** Where a leaf may sit: under its project, inside a spec or a feature. */
const LEAF_PARENTS = [VIABLE_PROJECT_TYPE, VIABLE_SPEC_CARD_TYPE, VIABLE_FEATURE_TYPE]

const workType = (
  type: string, fields: unknown, code: WorkcardTypeSchema['code'], hierarchy: Pick<WorkcardTypeSchema, 'parents' | 'children'>,
): WorkcardTypeSchema => ({
  type,
  kind: WorkcardKind.Card,
  version: 1,
  fields: fields as WorkcardTypeSchema['fields'],
  flows: [VIABLE_WORK_FLOW],
  intrinsic: IntrinsicPolicy.Primary,
  specifications: VIABLE_WORK_SLOTS,
  relationships: VIABLE_WORKCARD_RELATIONSHIPS,
  code,
  ...hierarchy,
  retypes: retypesOf(type),
})

export const VIABLE_USER_STORY_TYPE_SCHEMA: WorkcardTypeSchema = workType(
  VIABLE_USER_STORY_TYPE, ViableWorkcardFieldsSchema, VIABLE_USER_STORY_CODE, { parents: { types: LEAF_PARENTS } },
)

/** A spec: a container built together in one pass — a spec inside a spec is the schema's, the board refuses it. */
export const VIABLE_SPEC_CARD_TYPE_SCHEMA: WorkcardTypeSchema = workType(
  VIABLE_SPEC_CARD_TYPE, ViableSpecCardFieldsSchema, VIABLE_SPEC_CARD_CODE,
  { parents: { types: [VIABLE_PROJECT_TYPE, VIABLE_SPEC_CARD_TYPE] }, children: { types: [...VIABLE_SPEC_CARD_MEMBERS] } },
)

/** A feature: one capability for one role, standing alone or inside a spec. */
export const VIABLE_FEATURE_TYPE_SCHEMA: WorkcardTypeSchema = workType(
  VIABLE_FEATURE_TYPE, ViableFeatureFieldsSchema, VIABLE_FEATURE_CODE,
  { parents: { types: [VIABLE_PROJECT_TYPE, VIABLE_SPEC_CARD_TYPE] }, children: { types: [...VIABLE_FEATURE_MEMBERS] } },
)

export const VIABLE_IMPROVEMENT_TYPE_SCHEMA: WorkcardTypeSchema = workType(
  VIABLE_IMPROVEMENT_TYPE, ViableImprovementFieldsSchema, VIABLE_IMPROVEMENT_CODE, { parents: { types: LEAF_PARENTS } },
)

export const VIABLE_TASK_TYPE_SCHEMA: WorkcardTypeSchema = workType(
  VIABLE_TASK_TYPE, ViableTaskFieldsSchema, VIABLE_TASK_CODE, { parents: { types: LEAF_PARENTS } },
)

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
  flows: [VIABLE_WORKCARD_FLOW],
  intrinsic: IntrinsicPolicy.Primary,
  specifications: [],
  code,
})

/** Registered so their prefixes and flow are decided once; not creatable under a project yet. */
export const VIABLE_RESERVED_TYPE_SCHEMAS: WorkcardTypeSchema[] = [
  reserved(VIABLE_BUG_TYPE, VIABLE_BUG_CODE),
  reserved(VIABLE_REQUIREMENT_TYPE, VIABLE_REQUIREMENT_CODE),
]

/** The five work types, in {@link VIABLE_WORK_TYPES} order. */
export const VIABLE_WORK_TYPE_SCHEMAS: WorkcardTypeSchema[] = [
  VIABLE_USER_STORY_TYPE_SCHEMA,
  VIABLE_SPEC_CARD_TYPE_SCHEMA,
  VIABLE_FEATURE_TYPE_SCHEMA,
  VIABLE_IMPROVEMENT_TYPE_SCHEMA,
  VIABLE_TASK_TYPE_SCHEMA,
]

/** Every Viable type — what a planning plugin registers. */
export const VIABLE_TYPE_SCHEMAS: AnyTypeSchema[] = [
  VIABLE_PROJECT_TYPE_SCHEMA,
  ...VIABLE_WORK_TYPE_SCHEMAS,
  VIABLE_SPEC_TYPE_SCHEMA,
  ...VIABLE_RESERVED_TYPE_SCHEMAS,
]

/** Every Viable flow — registered beside the types. */
export const VIABLE_FLOW_SCHEMAS: StatusFlowSchema[] = [
  VIABLE_PROJECT_FLOW_SCHEMA,
  VIABLE_WORKCARD_FLOW_SCHEMA,
  VIABLE_SPEC_FLOW_SCHEMA,
]
