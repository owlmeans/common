import type { ResolvedServiceRoute, RouteAddress, RouteModel, RouteProtocol } from '@owlmeans/route'
import type { InitializedService, LazyService, BasicEntrypoint, EntrypointReference } from '@owlmeans/context'
import type { AnySchemaObject, JSONSchemaType } from 'ajv'
import type { EntrypointOutcome } from './consts.js'
import type { Auth } from '@owlmeans/auth'

import type { AnyShapeSource, entrypointSchemaType, SourceValue, TypeToken, UrlRequest } from './types.local.js'

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
 * never learns which built-in or package-owned carrier handled it. An
 * application binds a protocol by registering a transport service under `transportAlias(protocol)`.
 */
export interface EntrypointTransport extends InitializedService {
  readonly protocol: RouteProtocol
  handle: EntrypointHandler
}

/** A deliberately broad value used only by declarations without an I/O contract. */
export type OpenValue = object | string | number | boolean | bigint | null | undefined

/** The four independent request sections an entrypoint may declare. */
export interface RequestShape {
  body?: OpenValue
  params?: object
  query?: object
  headers?: object
}

export interface RuntimeRequestSchemas {
  body?: AnySchemaObject
  params?: AnySchemaObject
  query?: AnySchemaObject
  headers?: AnySchemaObject
}

export interface RuntimeResponseSchemas {
  default?: AnySchemaObject
  byStatus?: Readonly<Record<number, AnySchemaObject>>
}

/** The runtime schemas and compile-time request/response pair attached to one protocol. */
export interface EntrypointContract<Request extends RequestShape, Response> {
  readonly kind: 'entrypoint-contract'
  readonly requestSchemas: RuntimeRequestSchemas
  readonly responseSchemas?: RuntimeResponseSchemas
  readonly requestType?: Request
  readonly responseType?: Response
}

/** Runtime fields common to every protocol, regardless of its compile-time request/reply pair. */
export interface EntrypointProtocolDeclaration {
  readonly kind: 'entrypoint-protocol'
  readonly alias: string
  readonly route: RouteModel
  readonly contract?: Pick<EntrypointContract<RequestShape, OpenValue>,
    'kind' | 'requestSchemas' | 'responseSchemas'>
  readonly sticky: boolean
  readonly guards: readonly string[]
  readonly gate?: {
    readonly alias: string
    readonly params: readonly string[]
  }
}

/** A context-bound entrypoint made from an immutable protocol declaration. */
export interface MaterializedEntrypoint<Protocol extends EntrypointProtocolDeclaration> extends CommonEntrypoint { readonly protocol: Protocol }

/** The request accepted by a declaration that intentionally supplies no contract. */
export interface OpenRequest {
  body?: object
  params?: object
  query?: object
  headers?: object
}

/** Addressing and transport controls are never part of an entrypoint's payload contract. */
export interface CallOptions {
  auth?: Auth
  host?: string
  base?: string | boolean
  unsecure?: boolean
  timeout?: number
  signal?: AbortSignal
}

/** A type-only contract source, optionally paired with an AJV schema. */
export interface Typed<T> extends TypeToken { readonly value?: T }

// Kept as a type: `JSONSchemaType` is a conditional type; an interface cannot extend it.
/**
 * A JSON schema carrying the model type it validates.  Use `schema<Model>(...)` once beside the
 * model; every protocol that consumes it then infers the model without another generic.
 */
export type EntrypointSchema<T> = JSONSchemaType<T> & {
  readonly [entrypointSchemaType]: T
}

/** A schema or an explicit type-only source for one request/response value. */
export type ShapeSource<T> = EntrypointSchema<T> | JSONSchemaType<T> | Typed<T>

export interface RequestSources {
  body?: AnyShapeSource
  params?: AnyShapeSource
  query?: AnyShapeSource
  headers?: AnyShapeSource
}

/** An access gate declared by a protocol, including inherited parent declarations. */
export interface EntrypointGate {
  readonly alias: string
  readonly params: readonly string[]
}

export type RequestFromSources<Sources extends RequestSources> =
  (Sources extends { body: infer Source } ? { body: SourceValue<Source> } : {})
  & (Sources extends { params: infer Source } ? { params: SourceValue<Source> } : {})
  & (Sources extends { query: infer Source } ? { query: SourceValue<Source> } : {})
  & (Sources extends { headers: infer Source } ? { headers: SourceValue<Source> } : {})

export interface EntrypointOptions {
  sticky?: boolean
  guards?: string | readonly string[]
  gate?: {
    alias: string
    params?: string | readonly string[]
  }
}

export interface EntrypointResult<Response> {
  value: Response
  outcome: EntrypointOutcome
}

export type CallArguments<Request extends RequestShape> = {} extends Request
  ? [request?: Request & CallOptions]
  : [request: Request & CallOptions]

export type UrlArguments<Request extends RequestShape> = {} extends UrlRequest<Request>
  ? [request?: UrlRequest<Request> & CallOptions]
  : [request: UrlRequest<Request> & CallOptions]

export interface EntrypointRequestMeta {
  alias: string
  auth?: Auth
  entity?: ResolvedEntity
  path: string
  canceled?: boolean
  cancel?: () => void
}

// Kept as a type: it intersects the `Request` type parameter, which an interface cannot extend.
/**
 * A protocol request at an implementation boundary.
 *
 * Transport metadata and empty request sections remain available to handlers; a declared section
 * then refines that base shape to its protocol contract.
 */
export type HandlerRequest<Request extends RequestShape> = AbstractRequest & Request & EntrypointRequestMeta

/**
 * An immutable shared declaration.  Its inherited reference type is what gives a context lookup
 * the exact registered entrypoint type without a consumer-supplied generic.
 */
export interface EntrypointProtocol<
  Request extends RequestShape = RequestShape,
  Response = OpenValue,
> extends EntrypointProtocolDeclaration, EntrypointReference<RegisteredEntrypoint<Request, Response>> {
  readonly contract?: EntrypointContract<Request, Response>
}

/** The context-bound counterpart of an immutable protocol declaration. */
export interface RegisteredEntrypoint<Request extends RequestShape, Response> extends BasicEntrypoint {
  readonly protocol: EntrypointProtocol<Request, Response>
  call: (...args: CallArguments<Request>) => Promise<Response>
  invoke: (...args: CallArguments<Request>) => Promise<EntrypointResult<Response>>
  url: (...args: UrlArguments<Request>) => Promise<string>
  validate: (...args: CallArguments<Request>) => Promise<boolean>
}

export type RequestOf<Protocol extends EntrypointProtocolDeclaration> = Protocol extends EntrypointProtocol<infer Request, infer _Response>
  ? Request
  : OpenRequest

export type ResponseOf<Protocol extends EntrypointProtocolDeclaration> = Protocol extends EntrypointProtocol<infer _Request, infer Response>
  ? Response
  : OpenValue

export type BodyOf<Protocol extends EntrypointProtocolDeclaration> = RequestOf<Protocol> extends { body: infer Body }
  ? Body
  : OpenValue

export type ParamsOf<Protocol extends EntrypointProtocolDeclaration> = RequestOf<Protocol> extends { params: infer Params }
  ? Params
  : object

export type QueryOf<Protocol extends EntrypointProtocolDeclaration> = RequestOf<Protocol> extends { query: infer Query }
  ? Query
  : object

export type HeadersOf<Protocol extends EntrypointProtocolDeclaration> = RequestOf<Protocol> extends { headers: infer Headers }
  ? Headers
  : object

// Kept as a type: `RequestOf` is a conditional type; an interface cannot extend it.
export type CallRequestOf<Protocol extends EntrypointProtocolDeclaration> = RequestOf<Protocol> & CallOptions

export interface EntrypointTree {
  readonly [key: string]: EntrypointProtocolDeclaration | EntrypointTree
}
