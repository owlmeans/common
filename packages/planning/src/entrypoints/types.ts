import type { PlanningReply } from '../helpers/reply/types.js'
import type { PlanningResourceProtocols } from '../resources/protocol/types.js'
import type { Assignee, Team, Comment, CommentMention } from '../resources/types.js'
import type { EntrypointProtocol, OpenRequest, OpenValue } from '@owlmeans/entrypoint'
import type { ListResult } from '@owlmeans/resource'
import type { RouteParent } from '@owlmeans/route'
import type {
  CommitEvent, CommitFeedQuery, CommitQuery, CommitStatus, ExecuteRequest, Relationship, RelationshipQueryWire,
  RevisionsQuery, SchemaDefineReply, SchemaDefineRequest, SchemaListQuery, ScopedSchemaBundle, Specification,
  SpecificationQueryWire, SpecificationRevisionList, SummaryQueryWire, SummaryView, Transition, TransitionParams,
  TransitionQueryWire, TransitionReceiptView, Workcard, WorkcardParams, WorkcardQueryWire,
} from '../types.js'

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
  /** Mount the separate assignee, team, comment and mention protocol branches. Off by default. */
  resources?: boolean
  /**
   * The socket base the commit feed hangs under. The feed inherits THAT base's guards; the
   * planning base when omitted.
   */
  socketBase?: RouteParent
  /**
   * Declare the data-defined schema surface: `schema.list` takes a `project` query and answers
   * that layer's scoped bundle, and `schema.define` writes. Off by default — a tree without it
   * declares exactly the other leaves.
   */
  definitions?: boolean
}

export interface PlanningProtocols {
  assignees?: PlanningResourceProtocols<Assignee>
  teams?: PlanningResourceProtocols<Team>
  comments?: PlanningResourceProtocols<Comment>
  mentions?: PlanningResourceProtocols<CommentMention>
  base: EntrypointProtocol<OpenRequest, OpenValue>
  schema: {
    /** The plain bundle — or, on a tree declared with `definitions`, a layer's scoped one. */
    list: EntrypointProtocol<{ query?: SchemaListQuery }, PlanningReply<ScopedSchemaBundle>>
    /** Present on a tree declared with `definitions` only. */
    define?: EntrypointProtocol<{ body: SchemaDefineRequest }, PlanningReply<SchemaDefineReply>>
  }
  card: {
    list: EntrypointProtocol<{ query: WorkcardQueryWire }, PlanningReply<ListResult<Workcard>>>
    summary: EntrypointProtocol<{ query: SummaryQueryWire }, SummaryView>
    get: EntrypointProtocol<{ params: WorkcardParams }, PlanningReply<Workcard>>
    transitions: EntrypointProtocol<{ params: WorkcardParams, query: TransitionQueryWire }, PlanningReply<ListResult<Transition>>>
    specifications: EntrypointProtocol<{ params: WorkcardParams, query: SpecificationQueryWire }, PlanningReply<ListResult<Specification>>>
  }
  spec: {
    get: EntrypointProtocol<{ params: WorkcardParams }, PlanningReply<Specification>>
    revisions: EntrypointProtocol<{ params: WorkcardParams, query: RevisionsQuery }, SpecificationRevisionList>
  }
  link: {
    list: EntrypointProtocol<{ query: RelationshipQueryWire }, PlanningReply<ListResult<Relationship>>>
  }
  transition: {
    get: EntrypointProtocol<{ params: TransitionParams }, PlanningReply<Transition>>
  }
  execute: EntrypointProtocol<{ body: ExecuteRequest }, PlanningReply<TransitionReceiptView>>
  commit: {
    get: EntrypointProtocol<{ params: TransitionParams, query: CommitQuery }, PlanningReply<CommitStatus>>
    events: EntrypointProtocol<{ query: CommitFeedQuery }, PlanningReply<CommitEvent>>
  }
}
