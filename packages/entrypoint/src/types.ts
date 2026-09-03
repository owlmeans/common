import type { ResolvedServiceRoute, RouteAddress, RouteModel, RouteProtocols } from '@owlmeans/route'
import type { InitializedService, LazyService, BasicEntrypoint } from '@owlmeans/context'
import type { AnySchemaObject } from 'ajv'
import type { EntrypointOutcome } from './consts.js'
import type { Auth } from '@owlmeans/auth'

/**
 * A URL unit: an immutable route declaration plus what guards, gates and schemas it answers under.
 *
 * Nothing here is rewritten once declared. Every address question — segment, path, mount, service,
 * host — is a question about the declaration asked against the context the entrypoint is registered
 * in, so the same declaration answers differently in a client and in a server without being touched.
 */
export interface CommonEntrypoint extends BasicEntrypoint {
  route: RouteModel
  /**
   * @property {boolean} - if true — router attaches this entrypoint unconditionally
   * @default false
   */
  sticky: boolean
  /** The guards declared on this entrypoint alone — see `getGuards()` for the inherited set. */
  guards?: string[]
  gate?: string
  gateParams?: string | string[]
  filter?: Filter
  handle?: EntrypointHandler

  /** The segment this entrypoint contributes under its parent. */
  segment: () => string
  /** Every ancestor's segment, then this one. */
  path: () => string
  /** `base` + `path()` — what a server mounts and a client requests. */
  mount: () => string
  service: () => ResolvedServiceRoute
  address: () => RouteAddress
  /** Does this entrypoint belong to the service its context IS? */
  isLocal: () => boolean
  parent: () => CommonEntrypoint | null
  /** Own guards and every ancestor's, deduped. Recomputed on each call. */
  getGuards: () => string[]
  /** Own gate and every ancestor's, as `[gate, params]`. Recomputed on each call. */
  getGates: () => [string, string[]][]
}

export interface CommonEntrypointOptions extends Partial<CommonEntrypoint> { }

export interface EntrypointMatch {
  <R extends AbstractRequest, P extends AbstractResponse<any>>(req: R, res: P): Promise<boolean>
}

export interface EntrypointHandler {
  <
    T, R extends AbstractRequest<any> = AbstractRequest<any>,
    P extends AbstractResponse<any> = AbstractResponse<any>,
  >(req: R, res: P): T | Promise<T>
}

export interface EntrypointAssert {
  <R extends AbstractRequest, P extends AbstractResponse<any>>(req: R, res: P, params: string[]): Promise<void>
}

export interface AbstractRequest<T extends {} = {}> {
  alias: string
  auth?: Auth
  /**
   * The organization entity this request acts for, resolved from `auth.entitySlug` once, at the
   * server boundary.
   *
   * The slug on the token is renameable and therefore unusable as a key; `entity.id` is the stable
   * value that records, grants and minted infrastructure names are keyed by. Resolving it here —
   * rather than in each handler — is what keeps a rename from meaning a sweep of every call site,
   * and it is absent whenever no resolver is registered (an implementation that has no notion of
   * an organization store), so consumers must handle that rather than assume it.
   */
  entity?: ResolvedEntity
  params: Record<string, string | number | undefined | null> | Partial<T>
  body?: Record<string, any> | Partial<T>
  headers: Record<string, string[] | string | undefined>
  query: Record<string, string | number | undefined | null> | Partial<T>
  path: string
  original?: any
  canceled?: boolean
  cancel?: () => void
  host?: string
  base?: string | boolean
  unsecure?: boolean
  // Per-request HTTP timeout (ms) forwarded to the transport (axios). Omit/0 = no
  // timeout. Lets callers bound a single round-trip so a stuck peer can't hang forever.
  timeout?: number
  // Abort signal forwarded to the transport (axios) so a caller can cancel/abort an
  // in-flight request (e.g. a timeout-driven AbortController).
  signal?: AbortSignal
}

/**
 * An organization entity as request handlers see it: the stable id to key by, the current slug to
 * compose user-facing names from, and the frozen key that external systems already know it under.
 */
export interface ResolvedEntity {
  id: string
  slug: string
  /**
   * The identifier this organization is known by in systems whose names cannot be rewritten —
   * an IAM realm, an object-storage prefix, a cluster object. Minted once and never recomputed,
   * so it stays valid across every later rename.
   */
  iamKey: string
}

export interface AbstractResponse<T> {
  responseProvider?: any
  value?: T,
  outcome?: EntrypointOutcome
  error?: Error
  resolve: (value: T, outcome?: EntrypointOutcome) => void
  reject: (error: Error) => void
}

export interface GuardService extends InitializedService {
  // Client guard
  token?: string
  authenticated: (req?: Partial<AbstractRequest>) => Promise<string | null>
  // Server guard
  match: EntrypointMatch
  handle: EntrypointHandler
}

export interface GateService extends LazyService {
  /**
   * @throws {Error}
   */
  assert: EntrypointAssert
}

export interface Filter {
  query?: AnySchemaObject
  params?: AnySchemaObject
  body?: AnySchemaObject
  response?: AnySchemaObject
  headers?: AnySchemaObject
}

/**
 * How a call to an entrypoint is actually carried.
 *
 * The transport is chosen by the route's protocol, so a consumer always writes `ep.call(...)` and
 * never learns whether that became an HTTP request, a socket message or a queued job. An
 * application binds a protocol by registering a transport service under `transportAlias(protocol)`.
 */
export interface EntrypointTransport extends InitializedService {
  readonly protocol: RouteProtocols
  handle: EntrypointHandler
}
