import type { AssigneeTypeSchema, Assignee, Team, Comment, CommentMention } from './resources/types.js'
import { AssigneeKind, PlanningResourceKind, ProjectMode } from './consts.js'
import type { JSONSchemaType } from 'ajv'
import { IdValueSchema } from '@owlmeans/auth'
import { createListSchema } from '@owlmeans/resource'
import type { ListResult } from '@owlmeans/resource'
import {
  BODY_MAX, CAUSE_MAX, CODE_MAX, CodeScope, CodeStyle, CommitState, DESCRIPTION_MAX, IntrinsicPolicy,
  IntrinsicStatus, KEY_MAX, LABEL_MAX, MAX_COMMIT_POLL, MAX_LABELS, MAX_PARENTS, MAX_QUERY_LIST,
  PlanningSchemaKind, QUERY_TEXT_MAX, REF_MAX, SchemaOrigin, SchemaWriteMode, SpecificationFormat,
  TITLE_MAX, TransitionAction, TYPE_MAX, WorkcardKind,
} from './consts.js'
import type {
  AnyTypeSchema, CodePolicy, CommitEvent, CommitFeedQuery, CommitQuery, CommitStatus, ExecuteRequest,
  PlanningSchemaBundle, ProjectTypeSchema, Relationship, RelationshipDraft, RelationshipQueryWire,
  RelationshipType, RevisionsQuery, SchemaDefineRequest, SchemaKey, SchemaListQuery, ScopedSchemaBundle,
  ScopedSchemaRecord, Specification, SpecificationQueryWire, SpecificationRevision,
  SpecificationRevisionList, SpecificationSlot, StatusDefinition, StatusFlowSchema,
  StatusTransitionRule, SummaryQueryWire, SummaryView, Transition, TransitionActor, TransitionCommit,
  TransitionExecution, TransitionParams, TransitionQueryWire, TransitionReceiptView, Workcard,
  WorkcardChanges, WorkcardDraft, WorkcardParams, WorkcardQueryWire, WorkcardTypeSchema,
} from './types.js'

/**
 * Two rules every schema here keeps, because a record schema may be handed to a Mongo collection
 * as its `$jsonSchema` and Mongo refuses both at boot: no `integer` anywhere (`number` only), and
 * every optional property `nullable: true`. `schemas.spec.ts` walks every export and pins both.
 */

const cast = <T>(schema: object): JSONSchemaType<T> => schema as unknown as JSONSchemaType<T>

const IsoDate = { type: 'string', minLength: 20, maxLength: 32, format: 'date-time' } as const
const OptionalIsoDate = { ...IsoDate, nullable: true } as const
const Id = IdValueSchema
const OptionalId = { ...IdValueSchema, nullable: true }
const OpenObject = { type: 'object', additionalProperties: true, required: [] } as const
const OptionalOpenObject = { ...OpenObject, nullable: true } as const
const Label = { type: 'string', minLength: 1, maxLength: LABEL_MAX } as const
const TypeKey = { type: 'string', minLength: 1, maxLength: TYPE_MAX } as const

export const WorkcardKindSchema = cast<WorkcardKind>({ type: 'string', enum: Object.values(WorkcardKind) })
export const IntrinsicStatusSchema = cast<IntrinsicStatus>({ type: 'string', enum: Object.values(IntrinsicStatus) })
export const IntrinsicPolicySchema = cast<IntrinsicPolicy>({ type: 'string', enum: Object.values(IntrinsicPolicy) })
export const TransitionActionSchema = cast<TransitionAction>({ type: 'string', enum: Object.values(TransitionAction) })
export const CommitStateSchema = cast<CommitState>({ type: 'string', enum: Object.values(CommitState) })
export const SpecificationFormatSchema = cast<SpecificationFormat>({ type: 'string', enum: Object.values(SpecificationFormat) })

// ─── Records ─────────────────────────────────────────────────────────────────────────────────────

export const TransitionActorSchema = cast<TransitionActor>({
  type: 'object',
  properties: {
    profileId: OptionalId,
    userId: OptionalId,
    service: { type: 'string', maxLength: TYPE_MAX, nullable: true },
    agent: { type: 'string', maxLength: TYPE_MAX, nullable: true },
    runId: { type: 'string', maxLength: KEY_MAX, nullable: true },
    channel: { type: 'string', maxLength: LABEL_MAX, nullable: true },
  },
  required: [],
  additionalProperties: false,
})

const workcardProperties = {
  id: OptionalId,
  kind: WorkcardKindSchema,
  type: TypeKey,
  entityId: Id,
  code: { type: 'string', minLength: 1, maxLength: CODE_MAX, nullable: true },
  title: { type: 'string', minLength: 1, maxLength: TITLE_MAX },
  description: { type: 'string', maxLength: DESCRIPTION_MAX, nullable: true },
  parent: OptionalId,
  parentType: { ...TypeKey, nullable: true },
  reporter: OptionalId,
  assignee: OptionalId,
  mode: { type: 'string', enum: [...Object.values(ProjectMode), null], nullable: true },
  parents: { type: 'array', maxItems: MAX_PARENTS, items: Id },
  status: Label,
  intrinsic: IntrinsicStatusSchema,
  flows: { type: 'object', additionalProperties: Label, required: [] },
  labels: { type: 'array', maxItems: MAX_LABELS, items: Label },
  order: { type: 'number', nullable: true },
  fields: OpenObject,
  seq: { type: 'number', minimum: 0 },
  head: { type: 'number', minimum: 0, nullable: true },
  createdBy: OptionalId,
  createdAt: IsoDate,
  updatedAt: OptionalIsoDate,
  closedAt: OptionalIsoDate,
}

const workcardRequired = [
  'kind', 'type', 'entityId', 'title', 'parents', 'status', 'intrinsic', 'flows', 'labels', 'fields',
  'seq', 'createdAt',
]

const specificationProperties = {
  category: Label,
  format: SpecificationFormatSchema,
  body: { type: 'string', maxLength: BODY_MAX, nullable: true },
  ref: { type: 'string', maxLength: REF_MAX, nullable: true },
  revision: { type: 'number', minimum: 1, nullable: true },
  version: { type: 'number', nullable: true },
  bodyChars: { type: 'number', minimum: 0, nullable: true },
}

/** The optional form of a schema: `nullable`, and `null` admitted by an enum too. */
const nullable = (schema: object): object => {
  const enumerated = (schema as { enum?: unknown[] }).enum
  return { ...schema, nullable: true, ...(enumerated != null ? { enum: [...new Set([...enumerated, null])] } : {}) }
}

const nullableOf = (properties: Record<string, object>): Record<string, object> =>
  Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, nullable(value)]))

export const WorkcardSchema = cast<Workcard>({
  type: 'object',
  properties: workcardProperties,
  required: workcardRequired,
  additionalProperties: false,
})

export const SpecificationSchema = cast<Specification>({
  type: 'object',
  properties: { ...workcardProperties, ...specificationProperties },
  required: [...workcardRequired, 'category', 'format'],
  additionalProperties: false,
})

/** Any kind of workcard — what a receipt, a commit or a view carries. */
export const AnyWorkcardSchema = cast<Workcard>({
  type: 'object',
  properties: { ...workcardProperties, ...nullableOf(specificationProperties) },
  required: workcardRequired,
  additionalProperties: false,
})

export const RelationshipDraftSchema = cast<RelationshipDraft>({
  type: 'object',
  properties: {
    type: Label,
    from: OptionalId,
    to: Id,
    fromKind: { type: 'string', enum: [...Object.values(PlanningResourceKind), null], nullable: true },
    toKind: { type: 'string', enum: [...Object.values(PlanningResourceKind), null], nullable: true },
    fields: OptionalOpenObject,
  },
  required: ['type', 'to'],
  additionalProperties: false,
})

export const RelationshipSchema = cast<Relationship>({
  type: 'object',
  properties: {
    id: OptionalId,
    entityId: Id,
    type: Label,
    from: Id,
    to: Id,
    fromKind: { type: 'string', enum: [...Object.values(PlanningResourceKind), null], nullable: true },
    toKind: { type: 'string', enum: [...Object.values(PlanningResourceKind), null], nullable: true },
    project: OptionalId,
    fields: OptionalOpenObject,
    createdAt: IsoDate,
    transition: OptionalId,
  },
  required: ['entityId', 'type', 'from', 'to', 'createdAt'],
  additionalProperties: false,
})

/** Every changeable field, each nullable: `null` in an update asks for the field to be cleared. */
export const WorkcardChangesSchema = cast<WorkcardChanges>({
  type: 'object',
  properties: nullableOf({
    code: workcardProperties.code,
    title: workcardProperties.title,
    description: workcardProperties.description,
    parent: workcardProperties.parent,
    parentType: workcardProperties.parentType,
    reporter: workcardProperties.reporter,
    assignee: workcardProperties.assignee,
    mode: workcardProperties.mode,
    parents: workcardProperties.parents,
    status: workcardProperties.status,
    intrinsic: workcardProperties.intrinsic,
    flows: workcardProperties.flows,
    labels: workcardProperties.labels,
    order: workcardProperties.order,
    fields: workcardProperties.fields,
    createdBy: workcardProperties.createdBy,
    updatedAt: workcardProperties.updatedAt,
    closedAt: workcardProperties.closedAt,
    ...specificationProperties,
  }),
  required: [],
  additionalProperties: false,
})

export const TransitionCommitSchema = cast<TransitionCommit>({
  type: 'object',
  properties: {
    state: CommitStateSchema,
    at: OptionalIsoDate,
    error: { type: 'string', maxLength: DESCRIPTION_MAX, nullable: true },
  },
  required: ['state'],
  additionalProperties: false,
})

const UnsetSchema = { type: 'array', maxItems: 64, items: { type: 'string', minLength: 1, maxLength: TYPE_MAX } }

export const TransitionSchema = cast<Transition>({
  type: 'object',
  properties: {
    id: OptionalId,
    entityId: Id,
    card: Id,
    kind: WorkcardKindSchema,
    type: TypeKey,
    project: OptionalId,
    seq: { type: 'number', minimum: 1 },
    action: TransitionActionSchema,
    flow: { ...Label, nullable: true },
    transition: { ...Label, nullable: true },
    from: { ...Label, nullable: true },
    to: { ...Label, nullable: true },
    changes: WorkcardChangesSchema,
    unset: { ...UnsetSchema, nullable: true },
    link: { ...RelationshipDraftSchema, nullable: true },
    links: { type: 'array', maxItems: MAX_PARENTS, items: RelationshipDraftSchema, nullable: true },
    actor: TransitionActorSchema,
    cause: { type: 'string', maxLength: CAUSE_MAX, nullable: true },
    key: { type: 'string', minLength: 1, maxLength: KEY_MAX, nullable: true },
    at: IsoDate,
    commit: TransitionCommitSchema,
  },
  required: ['entityId', 'card', 'kind', 'type', 'seq', 'action', 'changes', 'actor', 'at', 'commit'],
  additionalProperties: false,
})

// ─── Type and flow schemas ───────────────────────────────────────────────────────────────────────

export const StatusDefinitionSchema = cast<StatusDefinition>({
  type: 'object',
  properties: {
    key: Label,
    intrinsic: IntrinsicStatusSchema,
    initial: { type: 'boolean', nullable: true },
    terminal: { type: 'boolean', nullable: true },
    label: { type: 'string', maxLength: TITLE_MAX, nullable: true },
    tone: { type: 'string', maxLength: LABEL_MAX, nullable: true },
  },
  required: ['key', 'intrinsic'],
  additionalProperties: false,
})

export const StatusTransitionRuleSchema = cast<StatusTransitionRule>({
  type: 'object',
  properties: {
    name: Label,
    /** An array of status keys, or `'*'`. */
    from: { type: ['array', 'string'], maxLength: 1, items: Label },
    to: Label,
    label: { type: 'string', maxLength: TITLE_MAX, nullable: true },
    explicit: { type: 'boolean', nullable: true },
  },
  required: ['name', 'from', 'to'],
  additionalProperties: false,
})

export const StatusFlowSchemaSchema = cast<StatusFlowSchema>({
  type: 'object',
  properties: {
    id: TypeKey,
    version: { type: 'number', minimum: 1 },
    statuses: { type: 'array', minItems: 1, items: StatusDefinitionSchema },
    transitions: { type: 'array', items: StatusTransitionRuleSchema },
    label: { type: 'string', maxLength: TITLE_MAX, nullable: true },
    overridable: { type: 'boolean', nullable: true },
  },
  required: ['id', 'version', 'statuses', 'transitions'],
  additionalProperties: false,
})

export const SpecificationSlotSchema = cast<SpecificationSlot>({
  type: 'object',
  properties: {
    category: Label,
    format: SpecificationFormatSchema,
    required: { type: 'boolean', nullable: true },
    multiple: { type: 'boolean', nullable: true },
    revisioned: { type: 'boolean', nullable: true },
    keepRevisions: { type: 'number', minimum: 0, nullable: true },
    schema: OptionalOpenObject,
    version: { type: 'number', nullable: true },
    label: { type: 'string', maxLength: TITLE_MAX, nullable: true },
    type: { ...TypeKey, nullable: true },
  },
  required: ['category', 'format'],
  additionalProperties: false,
})

export const CodePolicySchema = cast<CodePolicy>({
  type: 'object',
  properties: {
    prefix: { type: 'string', maxLength: 16, nullable: true },
    style: { type: 'string', enum: Object.values(CodeStyle) },
    length: { type: 'number', minimum: 1, maximum: CODE_MAX, nullable: true },
    uppercase: { type: 'boolean', nullable: true },
    uniqueWithin: { type: 'string', enum: Object.values(CodeScope) },
    mutable: { type: 'boolean', nullable: true },
  },
  required: ['style', 'uniqueWithin'],
  additionalProperties: false,
})

export const RelationshipTypeSchema = cast<RelationshipType>({
  type: 'object',
  properties: {
    name: Label,
    from: { type: 'array', items: TypeKey, nullable: true },
    to: { type: 'array', items: TypeKey, nullable: true },
    fromKind: { type: 'string', enum: [...Object.values(PlanningResourceKind), null], nullable: true },
    toKind: { type: 'string', enum: [...Object.values(PlanningResourceKind), null], nullable: true },
    field: { ...TypeKey, nullable: true },
    multiple: { type: 'boolean', nullable: true },
    inverse: { ...Label, nullable: true },
    single: { type: 'boolean', nullable: true },
    label: { type: 'string', maxLength: TITLE_MAX, nullable: true },
  },
  required: ['name'],
  additionalProperties: false,
})

const typeProperties = {
  type: TypeKey,
  version: { type: 'number', minimum: 1 },
  fields: OpenObject,
  flows: { type: 'array', minItems: 1, items: TypeKey },
  intrinsic: nullable(IntrinsicPolicySchema),
  specifications: { type: 'array', items: SpecificationSlotSchema },
  parents: { type: 'object', properties: { types: { type: 'array', items: TypeKey, nullable: true }, required: { type: 'boolean', nullable: true } }, required: [], additionalProperties: false, nullable: true },
  children: { type: 'object', properties: { types: { type: 'array', items: TypeKey } }, required: ['types'], additionalProperties: false, nullable: true },
  relationships: { type: 'array', items: RelationshipTypeSchema, nullable: true },
  labels: { type: 'array', items: Label, nullable: true },
  code: { ...CodePolicySchema, nullable: true },
  label: { type: 'string', maxLength: TITLE_MAX, nullable: true },
  overridable: { type: 'boolean', nullable: true },
}

const typeRequired = ['type', 'kind', 'version', 'fields', 'flows', 'specifications']

export const WorkcardTypeSchemaSchema = cast<WorkcardTypeSchema>({
  type: 'object',
  properties: {
    ...typeProperties,
    kind: { type: 'string', enum: [WorkcardKind.Card, WorkcardKind.Specification] },
  },
  required: typeRequired,
  additionalProperties: false,
})

export const ProjectTypeSchemaSchema = cast<ProjectTypeSchema>({
  type: 'object',
  properties: {
    ...typeProperties,
    kind: { type: 'string', enum: [WorkcardKind.Project] },
    cardTypes: { type: 'array', items: TypeKey },
    projectTypes: { type: 'array', items: TypeKey, nullable: true },
    scopedCardTypes: { type: 'boolean', nullable: true },
  },
  required: [...typeRequired, 'cardTypes'],
  additionalProperties: false,
})

/** Either type schema — `cardTypes` is required by the project kind only. */
export const AnyTypeSchemaSchema = cast<AnyTypeSchema>({
  type: 'object',
  properties: {
    ...typeProperties,
    kind: WorkcardKindSchema,
    cardTypes: { type: 'array', items: TypeKey, nullable: true },
    projectTypes: { type: 'array', items: TypeKey, nullable: true },
    scopedCardTypes: { type: 'boolean', nullable: true },
  },
  required: typeRequired,
  additionalProperties: false,
})

export const AssigneeTypeSchemaSchema = cast<AssigneeTypeSchema>({
  type: 'object', properties: {
    type: TypeKey, version: { type: 'number', minimum: 1 }, kind: { type: 'string', enum: Object.values(AssigneeKind) },
    fields: OpenObject, authentication: { type: 'string', enum: ['required', 'optional', null], nullable: true },
    label: { type: 'string', maxLength: TITLE_MAX, nullable: true }, overridable: { type: 'boolean', nullable: true },
  }, required: ['type', 'version', 'kind', 'fields'], additionalProperties: false,
})
const planningRecordProperties = { id: OptionalId, entityId: Id, version: { type: 'number', minimum: 1 }, createdAt: IsoDate, updatedAt: OptionalIsoDate }
const planningRecordRequired = ['entityId', 'version', 'createdAt']
export const AssigneeSchema = cast<Assignee>({
  type: 'object', properties: { ...planningRecordProperties,
    nickname: { type: 'string', minLength: 1, maxLength: TYPE_MAX }, nicknameKey: TypeKey,
    kind: { type: 'string', enum: Object.values(AssigneeKind) }, type: TypeKey, fields: OpenObject,
    authentication: { type: 'object', properties: { provider: TypeKey, externalId: { type: 'string', minLength: 1, maxLength: REF_MAX } }, required: ['provider', 'externalId'], additionalProperties: false, nullable: true },
    retired: { type: 'boolean', nullable: true },
  }, required: [...planningRecordRequired, 'nickname', 'nicknameKey', 'kind', 'type', 'fields'], additionalProperties: false,
})
export const TeamSchema = cast<Team>({
  type: 'object', properties: { ...planningRecordProperties, name: { type: 'string', minLength: 1, maxLength: TITLE_MAX }, externalId: { type: 'string', minLength: 1, maxLength: REF_MAX, nullable: true }, fields: OpenObject },
  required: [...planningRecordRequired, 'name', 'fields'], additionalProperties: false,
})
export const CommentSchema = cast<Comment>({
  type: 'object', properties: { ...planningRecordProperties, card: Id, author: Id, body: { type: 'string', minLength: 1, maxLength: BODY_MAX } },
  required: [...planningRecordRequired, 'card', 'author', 'body'], additionalProperties: false,
})
export const CommentMentionSchema = cast<CommentMention>({
  type: 'object', properties: { ...planningRecordProperties, comment: Id, card: Id, assignee: Id, revision: { type: 'number', minimum: 1 } },
  required: [...planningRecordRequired, 'comment', 'card', 'assignee', 'revision'], additionalProperties: false,
})

export const PlanningSchemaBundleSchema = cast<PlanningSchemaBundle>({
  type: 'object',
  properties: {
    version: { type: 'number', minimum: 1 },
    types: { type: 'array', items: AnyTypeSchemaSchema },
    flows: { type: 'array', items: StatusFlowSchemaSchema },
    assigneeTypes: { type: 'array', items: AssigneeTypeSchemaSchema, nullable: true },
  },
  required: ['version', 'types', 'flows'],
  additionalProperties: false,
})

// ─── Data-defined (scoped) schemas ───────────────────────────────────────────────────────────────

export const PlanningSchemaKindSchema = cast<PlanningSchemaKind>({ type: 'string', enum: Object.values(PlanningSchemaKind) })
export const SchemaOriginSchema = cast<SchemaOrigin>({ type: 'string', enum: Object.values(SchemaOrigin) })
export const SchemaWriteModeSchema = cast<SchemaWriteMode>({ type: 'string', enum: Object.values(SchemaWriteMode) })

export const ScopedSchemaRecordSchema = cast<ScopedSchemaRecord>({
  type: 'object',
  properties: {
    id: OptionalId,
    entityId: Id,
    project: OptionalId,
    kind: PlanningSchemaKindSchema,
    key: TypeKey,
    version: { type: 'number', minimum: 1 },
    /** A card type or a flow — its own schema is applied by `assertTypeSchema` / `assertFlowSchema`. */
    definition: OpenObject,
    retired: { type: 'boolean', nullable: true },
    rev: { type: 'number', minimum: 0, nullable: true },
    createdAt: IsoDate,
    updatedAt: OptionalIsoDate,
    by: { ...TransitionActorSchema, nullable: true },
  },
  required: ['entityId', 'kind', 'key', 'version', 'definition', 'createdAt'],
  additionalProperties: false,
})

export const SchemaKeySchema = cast<SchemaKey>({
  type: 'object',
  properties: { kind: PlanningSchemaKindSchema, key: TypeKey },
  required: ['kind', 'key'],
  additionalProperties: false,
})

const originMap = () => ({ type: 'object', additionalProperties: { type: 'string', enum: Object.values(SchemaOrigin) }, required: [] })
const keyList = () => ({ type: 'array', items: TypeKey })

export const ScopedSchemaBundleSchema = cast<ScopedSchemaBundle>({
  type: 'object',
  properties: {
    version: { type: 'number', minimum: 1 },
    types: { type: 'array', items: AnyTypeSchemaSchema },
    flows: { type: 'array', items: StatusFlowSchemaSchema },
    assigneeTypes: { type: 'array', items: AssigneeTypeSchemaSchema, nullable: true },
    scope: {
      type: 'object',
      properties: { entityId: Id, project: OptionalId },
      required: ['entityId'],
      additionalProperties: false,
      nullable: true,
    },
    revision: { type: 'number', minimum: 0, nullable: true },
    origins: {
      type: 'object',
      properties: { types: originMap(), flows: originMap(), assigneeTypes: { ...originMap(), nullable: true } },
      required: ['types', 'flows'],
      additionalProperties: false,
      nullable: true,
    },
    retired: {
      type: 'object',
      properties: { types: keyList(), flows: keyList(), assigneeTypes: { ...keyList(), nullable: true } },
      required: ['types', 'flows'],
      additionalProperties: false,
      nullable: true,
    },
  },
  required: ['version', 'types', 'flows'],
  additionalProperties: false,
})

export const SchemaListQuerySchema = cast<SchemaListQuery>({
  type: 'object',
  properties: { project: OptionalId },
  required: [],
  additionalProperties: false,
})

export const SchemaDefineRequestSchema = cast<SchemaDefineRequest>({
  type: 'object',
  properties: {
    project: OptionalId,
    mode: nullable(SchemaWriteModeSchema),
    types: { type: 'array', maxItems: MAX_QUERY_LIST, items: WorkcardTypeSchemaSchema, nullable: true },
    flows: { type: 'array', maxItems: MAX_QUERY_LIST, items: StatusFlowSchemaSchema, nullable: true },
    assigneeTypes: { type: 'array', maxItems: MAX_QUERY_LIST, items: AssigneeTypeSchemaSchema, nullable: true },
    retire: { type: 'array', maxItems: MAX_QUERY_LIST, items: SchemaKeySchema, nullable: true },
  },
  required: [],
  additionalProperties: false,
})

// ─── Execution ───────────────────────────────────────────────────────────────────────────────────

export const WorkcardDraftSchema = cast<WorkcardDraft>({
  type: 'object',
  properties: {
    kind: WorkcardKindSchema,
    type: TypeKey,
    parent: OptionalId,
    reporter: OptionalId,
    assignee: OptionalId,
    mode: workcardProperties.mode,
    parents: { ...workcardProperties.parents, nullable: true },
    title: workcardProperties.title,
    description: workcardProperties.description,
    code: workcardProperties.code,
    labels: { ...workcardProperties.labels, nullable: true },
    order: workcardProperties.order,
    fields: OptionalOpenObject,
    status: { ...Label, nullable: true },
    createdBy: OptionalId,
    ...nullableOf(specificationProperties),
  },
  required: ['kind', 'type', 'title'],
  additionalProperties: false,
})

const executionProperties = {
  /** A card id, or the draft of a create. */
  card: { anyOf: [Id, WorkcardDraftSchema] },
  action: TransitionActionSchema,
  transition: { ...Label, nullable: true },
  flow: { ...TypeKey, nullable: true },
  changes: { ...WorkcardChangesSchema, nullable: true },
  unset: { ...UnsetSchema, nullable: true },
  link: { ...RelationshipDraftSchema, nullable: true },
  links: { type: 'array', maxItems: MAX_PARENTS, items: RelationshipDraftSchema, nullable: true },
  actor: { ...TransitionActorSchema, nullable: true },
  cause: { type: 'string', maxLength: CAUSE_MAX, nullable: true },
  key: { type: 'string', minLength: 1, maxLength: KEY_MAX, nullable: true },
  expectSeq: { type: 'number', minimum: 0, nullable: true },
}

export const TransitionExecutionSchema = cast<TransitionExecution>({
  type: 'object',
  properties: executionProperties,
  required: ['card', 'action'],
  additionalProperties: false,
})

export const ExecuteRequestSchema = cast<ExecuteRequest>({
  type: 'object',
  properties: {
    ...executionProperties,
    wait: { type: 'boolean', nullable: true },
    timeout: { type: 'number', minimum: 0, nullable: true },
  },
  required: ['card', 'action'],
  additionalProperties: false,
})

export const TransitionReceiptViewSchema = cast<TransitionReceiptView>({
  type: 'object',
  properties: {
    transition: TransitionSchema,
    card: { ...AnyWorkcardSchema, nullable: true },
  },
  required: ['transition'],
  additionalProperties: false,
})

// ─── Commits ─────────────────────────────────────────────────────────────────────────────────────

export const CommitStatusSchema = cast<CommitStatus>({
  type: 'object',
  properties: {
    transition: Id,
    state: CommitStateSchema,
    at: OptionalIsoDate,
    error: { type: 'string', maxLength: DESCRIPTION_MAX, nullable: true },
    card: { ...AnyWorkcardSchema, nullable: true },
  },
  required: ['transition', 'state'],
  additionalProperties: false,
})

export const CommitEventSchema = cast<CommitEvent>({
  type: 'object',
  properties: {
    transition: Id,
    card: Id,
    entityId: Id,
    project: OptionalId,
    kind: WorkcardKindSchema,
    type: TypeKey,
    seq: { type: 'number', minimum: 1 },
    action: TransitionActionSchema,
    state: CommitStateSchema,
    at: IsoDate,
    error: { type: 'string', maxLength: DESCRIPTION_MAX, nullable: true },
    record: { ...AnyWorkcardSchema, nullable: true },
  },
  required: ['transition', 'card', 'entityId', 'kind', 'type', 'seq', 'action', 'state', 'at'],
  additionalProperties: false,
})

// ─── Views ───────────────────────────────────────────────────────────────────────────────────────

const Count = { type: 'number', minimum: 0 } as const

export const SummaryViewSchema = cast<SummaryView>({
  type: 'object',
  additionalProperties: {
    type: 'object',
    properties: {
      total: Count,
      [IntrinsicStatus.Planned]: Count,
      [IntrinsicStatus.InProgress]: Count,
      [IntrinsicStatus.Closed]: Count,
    },
    required: ['total', IntrinsicStatus.Planned, IntrinsicStatus.InProgress, IntrinsicStatus.Closed],
    additionalProperties: false,
  },
  required: [],
})

export const SpecificationRevisionSchema = cast<SpecificationRevision>({
  type: 'object',
  properties: {
    revision: { type: 'number', minimum: 1 },
    body: specificationProperties.body,
    ref: specificationProperties.ref,
    bodyChars: specificationProperties.bodyChars,
    version: specificationProperties.version,
    at: IsoDate,
    by: { ...TransitionActorSchema, nullable: true },
    transition: Id,
  },
  required: ['revision', 'at', 'transition'],
  additionalProperties: false,
})

export const SpecificationRevisionListSchema = cast<SpecificationRevisionList>({
  type: 'object',
  properties: { items: { type: 'array', items: SpecificationRevisionSchema } },
  required: ['items'],
  additionalProperties: false,
})

export const WorkcardListSchema: JSONSchemaType<ListResult<Workcard>> = createListSchema(AnyWorkcardSchema)
export const SpecificationListSchema: JSONSchemaType<ListResult<Specification>> = createListSchema(SpecificationSchema)
export const RelationshipListSchema: JSONSchemaType<ListResult<Relationship>> = createListSchema(RelationshipSchema)
export const TransitionListSchema: JSONSchemaType<ListResult<Transition>> = createListSchema(TransitionSchema)

// ─── Wire queries and params ─────────────────────────────────────────────────────────────────────

/**
 * Query-string schemas accept both what `encode*Query` writes (scalars) and what a tolerant
 * transport may already have split (arrays), and coerce numbers and booleans from strings.
 */
// Factories, not shared constants: ajv may extend a `type` array in place when it compiles a
// nullable schema, and a shared array would leak that into every other schema spreading it.
const listValue = () => ({ type: ['string', 'array'], maxLength: 4096, maxItems: MAX_QUERY_LIST, items: { type: 'string', maxLength: 256 }, nullable: true })
const jsonValue = () => ({ type: ['string', 'object'], maxLength: 4096, nullable: true })
const TextValue = { type: 'string', maxLength: QUERY_TEXT_MAX, nullable: true }

const listWireProperties = () => ({
  page: { type: 'number', minimum: 0, nullable: true },
  size: { type: 'number', minimum: 0, nullable: true },
  sort: { type: ['string', 'array'], maxLength: 512, nullable: true },
})

export const WorkcardQuerySchema = cast<WorkcardQueryWire>({
  type: 'object',
  properties: {
    ...listWireProperties(),
    kind: listValue(),
    type: listValue(),
    parent: TextValue,
    within: TextValue,
    status: listValue(),
    intrinsic: listValue(),
    flow: jsonValue(),
    labels: listValue(),
    code: listValue(),
    ids: listValue(),
    fields: jsonValue(),
    q: TextValue,
    category: listValue(),
    updatedSince: TextValue,
  },
  required: [],
  additionalProperties: false,
})

export const SpecificationQuerySchema = cast<SpecificationQueryWire>({
  type: 'object',
  properties: {
    ...listWireProperties(),
    category: listValue(),
    all: { type: 'boolean', nullable: true },
  },
  required: [],
  additionalProperties: false,
})

export const RelationshipQuerySchema = cast<RelationshipQueryWire>({
  type: 'object',
  properties: {
    fromKind: { type: 'string', enum: [...Object.values(PlanningResourceKind), null], nullable: true },
    toKind: { type: 'string', enum: [...Object.values(PlanningResourceKind), null], nullable: true },
    ...listWireProperties(),
    from: listValue(),
    to: listValue(),
    type: listValue(),
  },
  required: [],
  additionalProperties: false,
})

export const TransitionQuerySchema = cast<TransitionQueryWire>({
  type: 'object',
  properties: {
    ...listWireProperties(),
    card: TextValue,
    project: TextValue,
    sinceSeq: { type: 'number', minimum: 0, nullable: true },
    action: listValue(),
    state: TextValue,
  },
  required: [],
  additionalProperties: false,
})

export const SummaryQuerySchema = cast<SummaryQueryWire>({
  type: 'object',
  properties: {
    parents: { type: ['string', 'array'], minLength: 1, maxLength: 4096, minItems: 1, maxItems: MAX_QUERY_LIST, items: { type: 'string', maxLength: 256 } },
    kind: TextValue,
    type: listValue(),
  },
  required: ['parents'],
  additionalProperties: false,
})

export const WorkcardParamsSchema = cast<WorkcardParams>({
  type: 'object',
  properties: { id: Id },
  required: ['id'],
  additionalProperties: false,
})

export const TransitionParamsSchema = cast<TransitionParams>({
  type: 'object',
  properties: { transition: Id },
  required: ['transition'],
  additionalProperties: false,
})

export const CommitQuerySchema = cast<CommitQuery>({
  type: 'object',
  properties: {
    wait: { type: 'number', minimum: 0, maximum: MAX_COMMIT_POLL, nullable: true },
  },
  required: [],
  additionalProperties: false,
})

export const CommitFeedQuerySchema = cast<CommitFeedQuery>({
  type: 'object',
  properties: {
    project: OptionalId,
    card: OptionalId,
  },
  required: [],
  additionalProperties: false,
})

export const RevisionsQuerySchema = cast<RevisionsQuery>({
  type: 'object',
  properties: {
    limit: { type: 'number', minimum: 1, maximum: 1000, nullable: true },
  },
  required: [],
  additionalProperties: false,
})
