import type { AnySchema, ValidateFunction } from 'ajv'
import type { ListOptions, ListResult, ResourceRecord, Criteria } from '@owlmeans/resource'
import type { AssigneeKind } from '../consts.js'

/** Identity in an external authentication domain; neither email nor nickname is its key. */
export interface AssigneeAuthentication {
  provider: string
  externalId: string
}

export interface AssigneeTypeSchema {
  type: string
  version: number
  kind: AssigneeKind
  fields: AnySchema
  authentication?: 'required' | 'optional'
  label?: string
  overridable?: boolean
}

export interface PlanningRecord extends ResourceRecord {
  id?: string
  entityId: string
  version: number
  createdAt: string
  updatedAt?: string
}

export interface Assignee extends PlanningRecord {
  nickname: string
  /** Organization-scoped, Unicode-normalized, case-insensitive identity key. */
  nicknameKey: string
  kind: AssigneeKind
  type: string
  fields: Record<string, unknown>
  authentication?: AssigneeAuthentication
  retired?: boolean
}

export interface Team extends PlanningRecord {
  name: string
  externalId?: string
  fields: Record<string, unknown>
}

export interface Comment extends PlanningRecord {
  card: string
  /** Immutable author, resolved by the host from a trusted planning scope. */
  author: string
  body: string
}

/** A derived mention of a stable assignee id; revision is the source comment's version. */
export interface CommentMention extends PlanningRecord {
  comment: string
  card: string
  assignee: string
  revision: number
}

export interface AssigneeDraft {
  nickname: string
  kind: AssigneeKind
  type: string
  fields?: Record<string, unknown>
  authentication?: AssigneeAuthentication
}

export interface TeamDraft {
  name: string
  externalId?: string
  fields?: Record<string, unknown>
}

export interface CommentDraft {
  card: string
  body: string
}

/** Compare-and-set version is mandatory for updates/removal, optional for retiring an assignee. */
export interface PlanningWriteOptions { version: number }

export interface AssigneeQuery extends ListOptions<Assignee> {
  ids?: string[]
  nickname?: string
  kind?: AssigneeKind
  type?: string
  authentication?: AssigneeAuthentication
  retired?: boolean
}
export interface TeamQuery extends ListOptions<Team> { ids?: string[], externalId?: string }
export interface CommentQuery extends ListOptions<Comment> { card?: string, author?: string }
export interface MentionQuery extends ListOptions<CommentMention> { comment?: string, card?: string, assignee?: string }

/** Durable versioned resource port. put expects stored version + 1, with 1 for creation. */
export interface PlanningRecordStore<R extends PlanningRecord> {
  get: (id: string, entityId: string) => Promise<R | null>
  list: (where: Criteria<R>, opts?: ListOptions<R>) => Promise<ListResult<R>>
  put: (record: R) => Promise<R>
  drop: (id: string, entityId: string, version: number) => Promise<void>
}

export interface PlanningResourceFacade {
  assignees: {
    get: (id: string) => Promise<Assignee>
    load: (id: string) => Promise<Assignee | null>
    list: (query?: AssigneeQuery) => Promise<ListResult<Assignee>>
    create: (draft: AssigneeDraft) => Promise<Assignee>
    update: (id: string, changes: Partial<AssigneeDraft>, opts: PlanningWriteOptions) => Promise<Assignee>
    retire: (id: string, opts: PlanningWriteOptions) => Promise<Assignee>
  }
  teams: {
    get: (id: string) => Promise<Team>
    load: (id: string) => Promise<Team | null>
    list: (query?: TeamQuery) => Promise<ListResult<Team>>
    create: (draft: TeamDraft) => Promise<Team>
    update: (id: string, changes: Partial<TeamDraft>, opts: PlanningWriteOptions) => Promise<Team>
    remove: (id: string, opts: PlanningWriteOptions) => Promise<void>
    members: (team: string) => Promise<Assignee[]>
    addMember: (team: string, assignee: string) => Promise<void>
    removeMember: (team: string, assignee: string) => Promise<void>
    projects: (team: string) => Promise<string[]>
    attach: (team: string, project: string) => Promise<void>
    detach: (team: string, project: string) => Promise<void>
    assignees: (project: string) => Promise<Assignee[]>
  }
  comments: {
    get: (id: string) => Promise<Comment>
    load: (id: string) => Promise<Comment | null>
    list: (query?: CommentQuery) => Promise<ListResult<Comment>>
    create: (draft: CommentDraft) => Promise<Comment>
    update: (id: string, changes: Pick<CommentDraft, 'body'>, opts: PlanningWriteOptions) => Promise<Comment>
    remove: (id: string, opts: PlanningWriteOptions) => Promise<void>
  }
  mentions: {
    get: (id: string) => Promise<CommentMention>
    load: (id: string) => Promise<CommentMention | null>
    list: (query?: MentionQuery) => Promise<ListResult<CommentMention>>
    rebuild: (comment: string) => Promise<CommentMention[]>
  }
}

export interface AssigneeSchemaRegistry {
  registerAssigneeType: (schema: AssigneeTypeSchema) => void
  assigneeType: (type: string) => AssigneeTypeSchema
  assigneeTypes: () => AssigneeTypeSchema[]
  assigneeValidator: (type: string) => ValidateFunction
}
