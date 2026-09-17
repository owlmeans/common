import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import type { LazyService } from '@owlmeans/context'
import type { AbstractRequest, EntrypointProtocolDeclaration } from '@owlmeans/entrypoint'
import type {
  CommitFilter, CommitSource, CommitState, PlanningFacade, PlanningProtocols, PlanningSchemaRegistry,
  PlanningScope, PlanningService, Relationship, RelationshipQuery, TransitionAction, Workcard,
  WorkcardKind, WorkcardQuery,
} from '@owlmeans/planning'
import type { Criteria, ResourceRecord } from '@owlmeans/resource'
import type { Connection } from '@owlmeans/socket'
import type { StateAlias, StateResource } from '@owlmeans/state'

export interface Config extends ClientConfig { }

export interface Context<C extends Config = Config> extends ClientContext<C> { }

/**
 * Opens the commit socket. Injected, because the way a socket is opened is the host's: a browser
 * wraps `@owlmeans/client-socket` (which puts the session token on the connection), a Node client
 * usually has no socket at all. Answering `null` means "no socket" — the client then long-polls.
 */
export interface PlanningSocketOpener {
  (protocol: EntrypointProtocolDeclaration, request?: Partial<AbstractRequest>): Promise<Connection | null>
}

export interface PlanningClientOptions {
  /** The tree the server mounted — the same `makePlanningProtocols` call, alias for alias. */
  protocols: PlanningProtocols
  /**
   * The default facade's scope. Advisory on a client: the server derives the entity and the actor
   * from the credential, never from anything this sends.
   */
  scope?: Partial<PlanningScope>
  /** How the commit socket is opened. Without it `commits.wait` long-polls only. */
  socket?: PlanningSocketOpener
  /**
   * Load the schema bundle in the background once the context is ready (default `true`). The load
   * never fails or blocks the context; whatever needs the schemas (`model()`, `loadSchemas()`)
   * loads them on first use either way.
   */
  schemas?: boolean
  /** The longest single long poll, in seconds (default `DEFAULT_COMMIT_POLL`). */
  poll?: number
  /** Bind the protocol tree as client entrypoints (default `true`). */
  bind?: boolean
  /** The HTTP deadline of every call that is not a long poll, in milliseconds. */
  timeout?: number
}

/** What `appendPlanningClient` registers under `PLANNING_SERVICE`. */
export interface PlanningClientService extends PlanningService, LazyService {
  /** A facade over the remote tree. The scope is advisory (see {@link PlanningClientOptions.scope}). */
  for: (scope?: Partial<PlanningScope>) => PlanningFacade
  commits: RemoteCommitSource
  /** The registry, loaded from the server's bundle — once, unless `force`d. */
  loadSchemas: (opts?: { force?: boolean }) => Promise<PlanningSchemaRegistry>
  /** Release the shared commit socket. */
  close: () => Promise<void>
}

export interface WithPlanningClient {
  planning: () => PlanningClientService
}

export interface RemoteCommitSource extends CommitSource {
  /** A socket is open under this source. */
  connected: () => boolean
  /** Release the shared socket. Subscriptions stop receiving until the next `subscribe`. */
  close: () => Promise<void>
}

export interface RemoteCommitSourceOptions {
  socket?: PlanningSocketOpener
  /** Seconds. */
  poll?: number
  /** Milliseconds, for the non-holding status read. */
  timeout?: number
  /** The state mirror a settled commit is folded into, when one is registered. */
  stores?: () => PlanningStores | null
}

export interface RemoteFacadeOptions {
  commits: RemoteCommitSource
  schemas: PlanningSchemaRegistry
  /** Resolves the registry before a model is built. */
  loadSchemas?: () => Promise<PlanningSchemaRegistry>
  timeout?: number
  stores?: () => PlanningStores | null
}

/** One row per transition the client wrote or saw settle. */
export interface PlanningCommitRecord extends ResourceRecord {
  /** The transition id. */
  id: string
  card?: string
  entityId?: string
  project?: string
  kind?: WorkcardKind
  type?: string
  seq?: number
  action?: TransitionAction
  state: CommitState
  at?: string
  error?: string
}

export interface PlanningStoreAliases {
  cards: StateAlias<Workcard>
  links: StateAlias<Relationship>
  commits: StateAlias<PlanningCommitRecord>
}

export interface PlanningStores {
  cards: StateResource<Workcard>
  links: StateResource<Relationship>
  commits: StateResource<PlanningCommitRecord>
}

export interface WithPlanningStores {
  planningStores: () => PlanningStores
}

export interface SyncOptions {
  /** Ids never dropped by this sync — records written by a commit while the list was in flight. */
  keep?: Iterable<string>
}

export interface PlanningFeedOptions {
  /** What the seeding list asks for. Unpaged unless the query pages. */
  query?: WorkcardQuery
  /**
   * The part of the store the seed is authoritative for: rows matching it that the answer does not
   * name are dropped. `criteriaOf(query)` when omitted; a PAGED seed never drops anything.
   */
  where?: Criteria<Workcard>
  /** Also seed the link store from this query. */
  links?: RelationshipQuery
  /** Which commit frames fold into the store. Every frame the server sends when omitted. */
  filter?: CommitFilter
  /** Re-seed on this interval, in milliseconds — the authoritative poll beside the socket. */
  refresh?: number
  scope?: Partial<PlanningScope>
  /** Called on every change of {@link PlanningFeedState}. */
  onChange?: (state: PlanningFeedState) => void
}

export interface PlanningFeedState {
  /** The commit socket is open. */
  connected: boolean
  /** The authoritative list has been written into the store at least once. */
  seeded: boolean
  /** What the last seeding call threw, if it threw. */
  error: Error | null
}

export interface PlanningFeed extends Readonly<PlanningFeedState> {
  /** Settles after the first seed attempt (it never rejects — read `error`). */
  ready: Promise<void>
  /** Seed again now. */
  refresh: () => Promise<void>
  /** Stop folding frames and refreshing. The shared socket stays open. */
  stop: () => Promise<void>
}
