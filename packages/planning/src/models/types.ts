import type { ListResult } from '@owlmeans/resource'
import type { IntrinsicStatus, SpecificationFormat, WorkcardKind } from '../consts.js'
import type {
  AnyTypeSchema, ExecuteOptions, IntrinsicCounts, Project, Relationship, RelationshipQuery, Specification,
  SpecificationQuery, SpecificationRevision, StatusFlowSchema, StatusTransitionRule, SummaryQuery, Transition,
  TransitionActor, TransitionQuery, TransitionReceipt, Workcard, WorkcardChanges, WorkcardQuery,
} from '../types.js'

export interface ExecuteMeta {
  actor?: TransitionActor
  cause?: string
  key?: string
  expectSeq?: number | null
}

export interface ModelExecuteOptions extends ExecuteOptions, ExecuteMeta {}

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
