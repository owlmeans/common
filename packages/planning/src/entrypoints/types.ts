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
  base: EntrypointProtocol<OpenRequest, OpenValue>
  schema: {
    /** The plain bundle — or, on a tree declared with `definitions`, a layer's scoped one. */
    list: EntrypointProtocol<{ query?: SchemaListQuery }, ScopedSchemaBundle>
    /** Present on a tree declared with `definitions` only. */
    define?: EntrypointProtocol<{ body: SchemaDefineRequest }, SchemaDefineReply>
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
