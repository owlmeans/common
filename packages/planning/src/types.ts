import type { BasicConfig, BasicContext } from '@owlmeans/context'
import type { EntrypointProtocol, OpenRequest, OpenValue } from '@owlmeans/entrypoint'
import type { Criteria, ListOptions, ListResult, ResourceRecord } from '@owlmeans/resource'
import type { RouteParent } from '@owlmeans/route'
import type { AnySchema, ValidateFunction } from 'ajv'
import type {
  CodeScope, CodeStyle, CommitState, IntrinsicPolicy, IntrinsicStatus, SpecificationFormat,
  TransitionAction, WorkcardKind,
} from './consts.js'

// ─── Records ─────────────────────────────────────────────────────────────────────────────────────

/**
 * The super type. Base fields live at the top level; everything a provider's type declares lives in
 * `fields` and is validated by that type's `fields` JSON schema. Generic code — lists, boards,
 * gates, the executor — reads only the top level. Timestamps are ISO-8601 UTC strings.
 */
export interface Workcard extends ResourceRecord {
  id?: string
  kind: WorkcardKind
  /** A registered type key (`viable:user-story`). */
  type: string
  /** Organization entity (tenant) — the stable id, never a slug. */
  entityId: string
  code?: string
  title: string
  description?: string
  /** Primary parent id. Absent on a root project. */
  parent?: string
  /** EVERY parent — many-to-many membership with no junction row. Always contains `parent`. */
  parents: string[]
  /** Status key of the PRIMARY flow. Mirror of `flows[primaryFlow]`. */
  status: string
  /** Mirror of the type's intrinsic resolution over `flows`. */
  intrinsic: IntrinsicStatus
  /** Status per flow the type declares, INCLUDING the primary one. Authoritative. */
  flows: Record<string, string>
  labels: string[]
  /** A double — a card may sit between two others (`3.5`). */
  order?: number
  /** Type-declared fields. Keys may not contain `.` or `$`. */
  fields: Record<string, unknown>
  /** Sequence of the last transition FOLDED into this record. */
  seq: number
  /** Highest sequence ALLOCATED. `head > seq` means a transition is in flight. */
  head?: number
  createdBy?: string
  createdAt: string
  updatedAt?: string
  closedAt?: string
}

export interface Project extends Workcard {
  kind: WorkcardKind.Project
}

export interface Card extends Workcard {
  kind: WorkcardKind.Card
}

/**
 * A document attached to a parent card through a slot the PARENT's type declares. One record per
 * `(parent, category)` unless the slot is `multiple`; a `revisioned` slot increments `revision` in
 * place and earlier bodies are read back from the transition log.
 */
export interface Specification extends Workcard {
  kind: WorkcardKind.Specification
  category: string
  format: SpecificationFormat
  body?: string
  ref?: string
  revision?: number
  version?: number
  bodyChars?: number
}

export type AnyWorkcard = Card | Project | Specification

/** A typed many-to-many edge. Membership is `parent`/`parents`, never a relationship. */
export interface Relationship extends ResourceRecord {
  id?: string
  entityId: string
  type: string
  from: string
  to: string
  project?: string
  fields?: Record<string, unknown>
  createdAt: string
  /** The transition that created it. */
  transition?: string
}

export interface RelationshipDraft {
  type: string
  /** Defaults to the card the transition is about. */
  from?: string
  to: string
  fields?: Record<string, unknown>
}

/** Who wrote a transition. Filled by the server from the authenticated request — never the wire. */
export interface TransitionActor {
  profileId?: string
  userId?: string
  service?: string
  agent?: string
  runId?: string
  /** Where the write came from (`web`, `connect`, `agent` …) — a provider's own vocabulary. */
  channel?: string
}

export interface TransitionCommit {
  state: CommitState
  at?: string
  error?: string
}

/**
 * The values a transition writes.
 *
 * Every key carries a NEW VALUE, never a delta. `fields` and `flows` merge shallowly into the
 * card's; every other key replaces. Clearing is `Transition.unset`.
 */
export type WorkcardChanges =
  & Partial<Omit<Workcard, 'id' | 'kind' | 'type' | 'entityId' | 'seq' | 'head' | 'createdAt'>>
  & Partial<Pick<Specification, 'category' | 'format' | 'body' | 'ref' | 'revision' | 'version' | 'bodyChars'>>

/** The event. Append-only, never edited; folding every transition of a card in `seq` order IS the card. */
export interface Transition extends ResourceRecord {
  id?: string
  entityId: string
  card: string
  kind: WorkcardKind
  type: string
  /** The project the card belongs to — a project's OWN id on its own rows. */
  project?: string
  /** 1 is the create. */
  seq: number
  action: TransitionAction
  flow?: string
  transition?: string
  from?: string
  to?: string
  changes: WorkcardChanges
  /** Top-level field names, or `fields.<key>` / `flows.<id>`, to clear. */
  unset?: string[]
  link?: RelationshipDraft
  /** Relationships created together with the card (create only). */
  links?: RelationshipDraft[]
  actor: TransitionActor
  cause?: string
  /** Idempotency key, unique per entity. */
  key?: string
  at: string
  commit: TransitionCommit
}

// ─── Type and flow schemas (data, not code) ──────────────────────────────────────────────────────

export interface StatusDefinition {
  key: string
  intrinsic: IntrinsicStatus
  initial?: boolean
  terminal?: boolean
  label?: string
  tone?: string
}

/**
 * One named move. A name may repeat with different `from` sets (`start` from `planned` and from
 * `failed`); `'*'` matches every status and is consulted last.
 */
export interface StatusTransitionRule {
  name: string
  from: string[] | '*'
  to: string
  label?: string
  /** Offered to a person as an action. */
  explicit?: boolean
}

/** Shareable across types; a type may run several. */
export interface StatusFlowSchema {
  id: string
  version: number
  statuses: StatusDefinition[]
  transitions: StatusTransitionRule[]
  label?: string
}

export interface SpecificationSlot {
  category: string
  format: SpecificationFormat
  required?: boolean
  /** Several documents of this category under one parent. */
  multiple?: boolean
  /** An update increments `revision` in place. */
  revisioned?: boolean
  /** The minimum history depth `revisions()` must answer. */
  keepRevisions?: number
  /** A JSON slot's body schema. */
  schema?: AnySchema
  version?: number
  label?: string
  /** The specification type records of this slot use; the sole registered one when omitted. */
  type?: string
}

export interface CodePolicy {
  prefix?: string
  style: CodeStyle
  length?: number
  uppercase?: boolean
  uniqueWithin: CodeScope
  mutable?: boolean
}

export interface RelationshipType {
  name: string
  /** Card types allowed at the `from` end. Any when omitted. */
  from?: string[]
  /** Card types allowed at the `to` end. Any when omitted. */
  to?: string[]
  inverse?: string
  /** At most one relationship of this type leaves a card. */
  single?: boolean
  label?: string
}

export interface WorkcardTypeSchema {
  type: string
  kind: WorkcardKind.Card | WorkcardKind.Specification
  version: number
  /** JSON schema of `fields`. */
  fields: AnySchema
  /** Flow ids; `[0]` is the primary flow. */
  flows: string[]
  intrinsic?: IntrinsicPolicy
  /** Slots the type's cards carry as children. */
  specifications: SpecificationSlot[]
  relationships?: RelationshipType[]
  /** Allowed labels. Any when omitted. */
  labels?: string[]
  code?: CodePolicy
  label?: string
}

export interface ProjectTypeSchema extends Omit<WorkcardTypeSchema, 'kind'> {
  kind: WorkcardKind.Project
  cardTypes: string[]
  projectTypes?: string[]
}

export type AnyTypeSchema = WorkcardTypeSchema | ProjectTypeSchema

export interface PlanningSchemaBundle {
  version: number
  types: AnyTypeSchema[]
  flows: StatusFlowSchema[]
}

export interface PlanningSchemaRegistry {
  registerType: (schema: AnyTypeSchema) => void
  registerFlow: (flow: StatusFlowSchema) => void
  types: () => AnyTypeSchema[]
  /** @throws {UnknownWorkcardType} */
  type: (type: string) => AnyTypeSchema
  has: (type: string) => boolean
  flows: () => StatusFlowSchema[]
  /** @throws {UnknownStatusFlow} */
  flow: (id: string) => StatusFlowSchema
  /** @throws {UnknownWorkcardType | UnknownStatusFlow} */
  primaryFlow: (type: string) => StatusFlowSchema
  /** The compiled, cached validator of a type's `fields`. */
  validator: (type: string) => ValidateFunction
  bundle: () => PlanningSchemaBundle
  /** Replace everything with a bundle — a client's boot. */
  load: (bundle: PlanningSchemaBundle) => void
}

// ─── Execution and receipts ──────────────────────────────────────────────────────────────────────

export interface WorkcardDraft {
  kind: WorkcardKind
  type: string
  parent?: string
  parents?: string[]
  title: string
  description?: string
  code?: string
  labels?: string[]
  order?: number
  fields?: Record<string, unknown>
  /** Initial status of the primary flow; the flow's initial status when omitted. */
  status?: string
  createdBy?: string
  category?: string
  format?: SpecificationFormat
  body?: string
  ref?: string
  version?: number
}

export interface TransitionExecution {
  /** A card id, or the draft of the card a `create` makes. */
  card: string | WorkcardDraft
  action: TransitionAction
  transition?: string
  flow?: string
  changes?: WorkcardChanges
  unset?: string[]
  link?: RelationshipDraft
  links?: RelationshipDraft[]
  /** Ignored on the wire — the server fills it from the request. */
  actor?: TransitionActor
  cause?: string
  key?: string
  /**
   * Optimistic concurrency against the card's HEAD. A model fills it from its record unless given
   * `null`, which opts out.
   */
  expectSeq?: number | null
}

export interface ExecuteOptions {
  wait?: boolean
  timeout?: number
}

export interface ExecuteRequest extends TransitionExecution, ExecuteOptions { }

export interface TransitionReceipt {
  transition: Transition
  /** Present when the commit already landed; `null` for a committed delete. */
  card?: Workcard | null
  /** @throws {CommitFailed | CommitTimeout} */
  committed: (opts?: { timeout?: number }) => Promise<Workcard | null>
}

export interface TransitionReceiptView {
  transition: Transition
  card?: Workcard | null
}

// ─── Commits ─────────────────────────────────────────────────────────────────────────────────────

/** On a cross-process bus it carries ids only; `record` is filled where a subscriber needs it. */
export interface CommitEvent {
  transition: string
  card: string
  entityId: string
  project?: string
  kind: WorkcardKind
  type: string
  seq: number
  action: TransitionAction
  state: CommitState
  at: string
  error?: string
  record?: Workcard | null
}

export interface CommitStatus {
  transition: string
  state: CommitState
  at?: string
  error?: string
  card?: Workcard | null
}

export interface CommitFilter {
  entityId?: string
  project?: string
  card?: string
  kind?: WorkcardKind
}

export type Unsubscribe = () => void

export interface CommitSource {
  status: (transition: string) => Promise<CommitStatus>
  subscribe: (listener: (event: CommitEvent) => void | Promise<void>, filter?: CommitFilter) => Unsubscribe | Promise<Unsubscribe>
  /** @throws {CommitFailed | CommitTimeout} */
  wait: (transition: string, opts?: { timeout?: number }) => Promise<Workcard | null>
}

// ─── Ports ───────────────────────────────────────────────────────────────────────────────────────

export interface TransitionWhere {
  entityId: string
  card?: string | string[]
  project?: string
  sinceSeq?: number
  state?: CommitState
  action?: TransitionAction | TransitionAction[]
}

export interface TransitionStore {
  append: (transition: Transition) => Promise<Transition>
  get: (id: string) => Promise<Transition | null>
  byKey: (entityId: string, key: string) => Promise<Transition | null>
  list: (where: TransitionWhere, opts?: ListOptions<Transition>) => Promise<ListResult<Transition>>
  /** Allocates the next seq with a CAS against the head. @throws {WorkcardConflict} */
  nextSeq: (card: string, expect?: number | null) => Promise<number>
  head: (card: string) => Promise<number>
  commit: (id: string, commit: TransitionCommit) => Promise<void>
  purge: (where: TransitionWhere) => Promise<number>
}

export interface IntrinsicCounts extends Record<IntrinsicStatus, number> {
  total: number
}

/** Counts of DIRECT children per parent. A parent with no children has no key. */
export interface SummaryView {
  [parent: string]: IntrinsicCounts
}

export interface ProjectionStore {
  get: (id: string, entityId: string) => Promise<Workcard | null>
  list: (where: Criteria<Workcard>, opts?: ListOptions<Workcard>) => Promise<ListResult<Workcard>>
  count: (where: Criteria<Workcard>) => Promise<number>
  summary: (parents: string[], where?: Criteria<Workcard>) => Promise<SummaryView>
  put: (card: Workcard) => Promise<void>
  drop: (id: string, entityId: string) => Promise<void>
  /** Fold what is pending for the card — now (a sync store) or queued (a durable one). */
  project: (card: string, hint?: { transition?: string }) => Promise<void>
  /** Remove a project and everything under it. */
  purge: (project: string, entityId: string) => Promise<number>
}

export interface SpecificationRevision {
  revision: number
  body?: string
  ref?: string
  bodyChars?: number
  version?: number
  at: string
  by?: TransitionActor
  transition: string
}

export interface SpecificationRevisionList {
  items: SpecificationRevision[]
}

export interface SpecificationStore {
  current: (parent: string, category: string, entityId: string) => Promise<Specification | null>
  list: (parent: string, entityId: string, query?: SpecificationQuery) => Promise<ListResult<Specification>>
  revisions: (id: string, entityId: string, limit?: number) => Promise<SpecificationRevision[]>
}

export interface RelationshipWhere {
  entityId: string
  id?: string
  from?: string | string[]
  to?: string | string[]
  type?: string | string[]
}

export interface RelationshipStore {
  list: (where: RelationshipWhere, opts?: ListOptions<Relationship>) => Promise<ListResult<Relationship>>
  put: (link: Relationship) => Promise<Relationship>
  drop: (where: RelationshipWhere) => Promise<number>
}

export interface PlanningStoreCapabilities {
  transitions: boolean
  sync: boolean
  purge: boolean
  revisions: boolean
}

/** Only `cards` is required — which is what keeps a foreign provider possible. */
export interface PlanningStore {
  alias?: string
  capabilities?: PlanningStoreCapabilities
  /** The id a new card gets. */
  newId?: () => string
  transitions?: TransitionStore
  cards: ProjectionStore
  specs?: SpecificationStore
  links?: RelationshipStore
  commits?: CommitSource
}

// ─── Queries ─────────────────────────────────────────────────────────────────────────────────────

export interface WorkcardQuery extends ListOptions<Workcard> {
  kind?: WorkcardKind | WorkcardKind[]
  type?: string | string[]
  /** Direct children only. */
  parent?: string
  /** Membership anywhere — matched against `parents`. */
  within?: string
  status?: string | string[]
  intrinsic?: IntrinsicStatus | IntrinsicStatus[]
  flow?: { id: string, status: string | string[] }
  /** Any of. */
  labels?: string[]
  code?: string | string[]
  ids?: string[]
  /** Equality per key, read as `fields.<key>`. */
  fields?: Record<string, unknown>
  /** Title or description contains, or code starts with. */
  q?: string
  category?: string | string[]
  updatedSince?: string
}

export interface SpecificationQuery extends ListOptions<Specification> {
  category?: string | string[]
  /** Every document of the slot, not only the current one. */
  all?: boolean
}

export interface RelationshipQuery extends ListOptions<Relationship> {
  from?: string | string[]
  to?: string | string[]
  type?: string | string[]
}

export interface TransitionQuery extends ListOptions<Transition> {
  card?: string
  project?: string
  sinceSeq?: number
  action?: TransitionAction | TransitionAction[]
  state?: CommitState
}

export interface SummaryQuery {
  parents: string[]
  kind?: WorkcardKind
  type?: string | string[]
}

/**
 * The query objects as they travel in a URL.
 *
 * A query string carries neither arrays nor nested objects through the OwlMeans transport (axios
 * writes `key[]=`, fastify reads that key literally), so every value is a scalar: a list is
 * comma-joined (JSON when an element holds a comma), an object is JSON, a sort is
 * `field,-field`. `encode*Query` writes this shape, `decode*Query` reads it back and also accepts
 * the rich form.
 */
export interface ListWire {
  page?: number
  size?: number
  sort?: string
}

export interface WorkcardQueryWire extends ListWire {
  kind?: string
  type?: string
  parent?: string
  within?: string
  status?: string
  intrinsic?: string
  flow?: string
  labels?: string
  code?: string
  ids?: string
  fields?: string
  q?: string
  category?: string
  updatedSince?: string
}

export interface SpecificationQueryWire extends ListWire {
  category?: string
  all?: boolean
}

export interface RelationshipQueryWire extends ListWire {
  from?: string
  to?: string
  type?: string
}

export interface TransitionQueryWire extends ListWire {
  card?: string
  project?: string
  sinceSeq?: number
  action?: string
  state?: string
}

export interface SummaryQueryWire {
  parents: string
  kind?: string
  type?: string
}

export interface WorkcardParams {
  id: string
}

export interface TransitionParams {
  transition: string
}

export interface CommitQuery {
  /** Seconds to hold the poll; clamped by the server. */
  wait?: number
}

export interface CommitFeedQuery {
  project?: string
  card?: string
}

export interface RevisionsQuery {
  limit?: number
}

// ─── Facade, scope, service, plugin seam ─────────────────────────────────────────────────────────

export interface PlanningScope {
  entityId: string
  profileId?: string
  userId?: string
  service?: string
  channel?: string
  actor?: TransitionActor
}

export interface PlanningFacade {
  scope: PlanningScope
  schemas: PlanningSchemaRegistry
  cards: {
    /** @throws {WorkcardNotFound} */
    get: (id: string) => Promise<Workcard>
    load: (id: string) => Promise<Workcard | null>
    list: (query?: WorkcardQuery) => Promise<ListResult<Workcard>>
    count: (query?: WorkcardQuery) => Promise<number>
    summary: (parents: string[], query?: Omit<SummaryQuery, 'parents'>) => Promise<SummaryView>
  }
  specifications: {
    current: (parent: string, category: string) => Promise<Specification | null>
    list: (parent: string, query?: SpecificationQuery) => Promise<ListResult<Specification>>
    /** @throws {WorkcardNotFound} */
    get: (id: string) => Promise<Specification>
    revisions: (id: string, limit?: number) => Promise<SpecificationRevision[]>
  }
  relationships: {
    list: (query?: RelationshipQuery) => Promise<ListResult<Relationship>>
  }
  transitions: {
    get: (id: string) => Promise<Transition>
    list: (query: TransitionQuery) => Promise<ListResult<Transition>>
  }
  commits: CommitSource
  execute: (exec: TransitionExecution, opts?: ExecuteOptions) => Promise<TransitionReceipt>
  model: <T extends Workcard = Workcard>(card: T | string) => Promise<WorkcardModel<T>>
}

export interface WithPlanningService {
  planning: () => PlanningService
}

export interface PlanningExecContext {
  context: BasicContext<BasicConfig>
  scope: PlanningScope
  schemas: PlanningSchemaRegistry
  store: PlanningStore
  /** So a middleware can read (count what is in progress, and so on). */
  facade: PlanningFacade
  card?: Workcard
  parent?: Workcard
  type?: AnyTypeSchema
  flow?: StatusFlowSchema
  plugin: PlanningPlugin
}

export interface PlanningHookContext {
  context: BasicContext<BasicConfig>
  schemas: PlanningSchemaRegistry
  store: PlanningStore
  plugin: PlanningPlugin
  /** A facade scoped to the event's entity, acting as the service itself. */
  facade: PlanningFacade
  transition?: Transition
}

export interface PlanningMiddleware {
  (exec: TransitionExecution, ctx: PlanningExecContext): Promise<TransitionExecution | void>
}

export interface PlanningCommitHook {
  (event: CommitEvent, ctx: PlanningHookContext): Promise<void>
}

export interface PlanningMappers {
  toRecord?: (external: unknown, type: string) => Workcard
  fromRecord?: (card: Workcard) => unknown
}

export interface PlanningPlugin {
  name: string
  /** Ascending; `DEFAULT_PLUGIN_ORDER` (50) when omitted. */
  order?: number
  schemas?: { types?: AnyTypeSchema[], flows?: StatusFlowSchema[] }
  owns?: (type: string) => boolean
  store?: PlanningStore | ((ctx: BasicContext<BasicConfig>) => PlanningStore)
  mintCode?: (draft: WorkcardDraft, taken: (code: string) => Promise<boolean>, ctx: PlanningExecContext) => Promise<string | undefined>
  before?: PlanningMiddleware
  after?: PlanningCommitHook
  mappers?: PlanningMappers
}

export interface PlanningService {
  use: (plugin: PlanningPlugin) => void
  plugins: () => PlanningPlugin[]
  schemas: PlanningSchemaRegistry
  store: (type?: string) => PlanningStore
  for: (scope: PlanningScope) => PlanningFacade
  /** Runs the ordered `after` chain — called by the process that FOLDED the transition. */
  committed: (event: CommitEvent) => Promise<void>
}

// ─── Models ──────────────────────────────────────────────────────────────────────────────────────

export interface ExecuteMeta {
  actor?: TransitionActor
  cause?: string
  key?: string
  expectSeq?: number | null
}

export type ModelExecuteOptions = ExecuteOptions & ExecuteMeta

export interface SpecificationWriteOptions extends ModelExecuteOptions {
  format?: SpecificationFormat
  version?: number
  ref?: string
  /** The title a new document gets; the category when omitted. */
  title?: string
  /** The specification type; resolved from the slot and the registry when omitted. */
  type?: string
}

export interface WorkcardModel<T extends Workcard = Workcard> {
  record: T
  id: string
  kind: WorkcardKind
  type: string
  schema: () => AnyTypeSchema
  flow: (id?: string) => StatusFlowSchema
  statusOf: (flowId?: string) => string
  intrinsicOf: (flowId?: string) => IntrinsicStatus
  can: (transition: string, flowId?: string) => boolean
  available: (flowId?: string) => StatusTransitionRule[]
  pending: () => boolean
  transit: (transition: string, changes?: WorkcardChanges, opts?: ModelExecuteOptions & { flow?: string }) => Promise<TransitionReceipt>
  update: (changes: WorkcardChanges, opts?: ModelExecuteOptions & { unset?: string[] }) => Promise<TransitionReceipt>
  remove: (opts?: ModelExecuteOptions) => Promise<TransitionReceipt>
  link: (type: string, to: string, fields?: Record<string, unknown>, opts?: ModelExecuteOptions) => Promise<TransitionReceipt>
  unlink: (type: string, to: string, opts?: ModelExecuteOptions) => Promise<TransitionReceipt>
  children: (query?: Omit<WorkcardQuery, 'parent'>) => Promise<ListResult<Workcard>>
  relationships: (query?: RelationshipQuery) => Promise<ListResult<Relationship>>
  transitions: (query?: Omit<TransitionQuery, 'card'>) => Promise<ListResult<Transition>>
  specification: (category: string) => Promise<Specification | null>
  specifications: (query?: SpecificationQuery) => Promise<ListResult<Specification>>
  revisions: (category: string, limit?: number) => Promise<SpecificationRevision[]>
  /** Create the slot's document, or revise it when it already exists. */
  write: (category: string, body: string, opts?: SpecificationWriteOptions) => Promise<TransitionReceipt>
  reload: () => Promise<WorkcardModel<T>>
}

export interface ProjectModel extends WorkcardModel<Project> {
  cards: (query?: Omit<WorkcardQuery, 'within' | 'kind'>) => Promise<ListResult<Workcard>>
  projects: (query?: Omit<WorkcardQuery, 'within' | 'kind'>) => Promise<ListResult<Workcard>>
  summary: (query?: Omit<SummaryQuery, 'parents'>) => Promise<IntrinsicCounts>
  /** A `delete` of the project — the store removes everything under it. */
  purge: (opts?: ModelExecuteOptions) => Promise<TransitionReceipt>
  reload: () => Promise<ProjectModel>
}

export interface SpecificationModel extends WorkcardModel<Specification> {
  body: () => string | undefined
  revise: (body: string, opts?: ModelExecuteOptions & { version?: number, ref?: string }) => Promise<TransitionReceipt>
  history: (limit?: number) => Promise<SpecificationRevision[]>
  reload: () => Promise<SpecificationModel>
}

// ─── Protocol tree ───────────────────────────────────────────────────────────────────────────────

export interface PlanningBaseOptions {
  /** The base alias every leaf alias derives from (`planningAliases`). */
  alias: string
  /** Defaults to `PLANNING_PATH`. */
  path?: string
  parent?: RouteParent
  service?: string
}

export interface PlanningProtocolOptions {
  base: PlanningBaseOptions
  /** The guard(s) the base carries; every HTTP leaf inherits them. */
  guards: string | readonly string[]
  gate?: { alias: string, params?: string | readonly string[] }
  /**
   * The socket base the commit feed hangs under. The feed inherits THAT base's guards; the
   * planning base when omitted.
   */
  socketBase?: RouteParent
}

export interface PlanningProtocols {
  base: EntrypointProtocol<OpenRequest, OpenValue>
  schema: {
    list: EntrypointProtocol<{}, PlanningSchemaBundle>
  }
  card: {
    list: EntrypointProtocol<{ query: WorkcardQueryWire }, ListResult<Workcard>>
    summary: EntrypointProtocol<{ query: SummaryQueryWire }, SummaryView>
    get: EntrypointProtocol<{ params: WorkcardParams }, Workcard>
    transitions: EntrypointProtocol<{ params: WorkcardParams, query: TransitionQueryWire }, ListResult<Transition>>
    specifications: EntrypointProtocol<{ params: WorkcardParams, query: SpecificationQueryWire }, ListResult<Specification>>
  }
  spec: {
    get: EntrypointProtocol<{ params: WorkcardParams }, Specification>
    revisions: EntrypointProtocol<{ params: WorkcardParams, query: RevisionsQuery }, SpecificationRevisionList>
  }
  link: {
    list: EntrypointProtocol<{ query: RelationshipQueryWire }, ListResult<Relationship>>
  }
  transition: {
    get: EntrypointProtocol<{ params: TransitionParams }, Transition>
  }
  execute: EntrypointProtocol<{ body: ExecuteRequest }, TransitionReceiptView>
  commit: {
    get: EntrypointProtocol<{ params: TransitionParams, query: CommitQuery }, CommitStatus>
    events: EntrypointProtocol<{ query: CommitFeedQuery }, CommitEvent>
  }
}

