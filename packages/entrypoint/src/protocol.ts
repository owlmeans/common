import type { Auth } from '@owlmeans/auth'
import type { BasicEntrypoint, EntrypointReference } from '@owlmeans/context'
import type { JSONSchemaType, AnySchemaObject } from 'ajv'
import type { RouteModel } from '@owlmeans/route'
import type { EntrypointOutcome } from './consts.js'
import type { ResolvedEntity } from './types.js'
import type { AbstractRequest } from './types.js'

/** A deliberately broad value used only by declarations without an I/O contract. */
export type OpenValue = object | string | number | boolean | bigint | null | undefined

/** The request accepted by a declaration that intentionally supplies no contract. */
export interface OpenRequest {
  body?: object
  params?: object
  query?: object
  headers?: object
}

/** The four independent request sections an entrypoint may declare. */
export interface RequestShape {
  body?: OpenValue
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

interface TypeToken {
  readonly kind: 'entrypoint-type'
  readonly schema?: AnySchemaObject
}

/** A type-only contract source, optionally paired with an AJV schema. */
export type Typed<T> = TypeToken & { readonly value?: T }

declare const entrypointSchemaType: unique symbol

/**
 * A JSON schema carrying the model type it validates.  Use `schema<Model>(...)` once beside the
 * model; every protocol that consumes it then infers the model without another generic.
 */
export type EntrypointSchema<T> = JSONSchemaType<T> & {
  readonly [entrypointSchemaType]: T
}

export const schema = <T>(value: JSONSchemaType<T>): EntrypointSchema<T> =>
  value as EntrypointSchema<T>

/** A schema or an explicit type-only source for one request/response value. */
export type ShapeSource<T> = EntrypointSchema<T> | JSONSchemaType<T> | Typed<T>

type AnyShapeSource = AnySchemaObject | TypeToken

/**
 * Supplies type information where a response has no runtime schema, or attaches a type to an
 * otherwise untyped schema literal at the declaration boundary.
 */
export function typed<T>(): Typed<T>
export function typed<T>(schema: JSONSchemaType<T>): Typed<T>
export function typed<T>(schema?: JSONSchemaType<T>): Typed<T> {
  return schema == null
    ? { kind: 'entrypoint-type' }
    : { kind: 'entrypoint-type', schema }
}

export interface RequestSources {
  body?: AnyShapeSource
  params?: AnyShapeSource
  query?: AnyShapeSource
  headers?: AnyShapeSource
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

/** An access gate declared by a protocol, including inherited parent declarations. */
export interface EntrypointGate {
  readonly alias: string
  readonly params: readonly string[]
}

type SourceValue<Source> =
  Source extends Typed<infer Value> ? Value extends OpenValue ? Value : OpenValue
    : Source extends EntrypointSchema<infer Value> ? Value extends OpenValue ? Value : OpenValue
      : Source extends JSONSchemaType<infer Value>
        ? Value extends OpenValue ? Value : OpenValue
        : OpenValue

type RequestFromSources<Sources extends RequestSources> =
  (Sources extends { body: infer Source } ? { body: SourceValue<Source> } : {})
  & (Sources extends { params: infer Source } ? { params: SourceValue<Source> } : {})
  & (Sources extends { query: infer Source } ? { query: SourceValue<Source> } : {})
  & (Sources extends { headers: infer Source } ? { headers: SourceValue<Source> } : {})

const schemaOf = (source: AnyShapeSource | undefined): AnySchemaObject | undefined => {
  if (source == null) return undefined
  const schema = 'kind' in source && source.kind === 'entrypoint-type'
    ? source.schema
    : source

  return schema == null ? undefined : structuredClone(schema)
}

const responseSchemasOf = (source: AnyShapeSource | undefined): RuntimeResponseSchemas | undefined => {
  const schema = schemaOf(source)
  return schema == null ? undefined : { default: schema }
}

/**
 * Declare an exact request and response.  The primary overload means a body request; use
 * `contract.request` for independently-shaped request sections.
 */
export function contract(): EntrypointContract<{}, undefined>
export function contract<ResponseSource extends AnyShapeSource>(
  response: ResponseSource
): EntrypointContract<{}, SourceValue<ResponseSource>>
export function contract<BodySource extends AnyShapeSource, ResponseSource extends AnyShapeSource>(
  body: BodySource, response: ResponseSource
): EntrypointContract<{ body: SourceValue<BodySource> }, SourceValue<ResponseSource>>
export function contract(
  first?: AnyShapeSource, second?: AnyShapeSource
): EntrypointContract<any, any> {
  const body = second == null ? undefined : first
  const response = second ?? first

  return {
    kind: 'entrypoint-contract',
    requestSchemas: { body: schemaOf(body) },
    responseSchemas: responseSchemasOf(response),
  }
}

export namespace contract {
  /**
   * Keep the exact `typed<T>()` source through inference.  Constraining only the response
   * value as `ShapeSource<Response>` widens an otherwise precise declaration to `OpenValue`.
   */
  export function request<Sources extends RequestSources, ResponseSource extends AnyShapeSource>(
    request: Sources,
    response: ResponseSource
  ): EntrypointContract<RequestFromSources<Sources>, SourceValue<ResponseSource>> {
    return {
      kind: 'entrypoint-contract',
      requestSchemas: {
        body: schemaOf(request.body),
        params: schemaOf(request.params),
        query: schemaOf(request.query),
        headers: schemaOf(request.headers),
      },
      responseSchemas: responseSchemasOf(response),
    }
  }
}

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

type UrlRequest<Request extends RequestShape> =
  (Request extends { params: infer Params } ? { params: Params }
    : Request extends { params?: infer Params } ? { params?: Params } : {})
  & (Request extends { query: infer Query } ? { query: Query }
    : Request extends { query?: infer Query } ? { query?: Query } : {})

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

/**
 * A protocol request at an implementation boundary.
 *
 * Transport metadata and empty request sections remain available to handlers; a declared section
 * then refines that base shape to its protocol contract.
 */
export type HandlerRequest<Request extends RequestShape> = AbstractRequest & Request & EntrypointRequestMeta

/** The context-bound counterpart of an immutable protocol declaration. */
export interface RegisteredEntrypoint<Request extends RequestShape, Response> extends BasicEntrypoint {
  readonly protocol: EntrypointProtocol<Request, Response>
  call: (...args: CallArguments<Request>) => Promise<Response>
  invoke: (...args: CallArguments<Request>) => Promise<EntrypointResult<Response>>
  url: (...args: UrlArguments<Request>) => Promise<string>
  validate: (...args: CallArguments<Request>) => Promise<boolean>
}

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

export type CallRequestOf<Protocol extends EntrypointProtocolDeclaration> = RequestOf<Protocol> & CallOptions

const guardsOf = (guards: EntrypointOptions['guards']): readonly string[] => guards == null
  ? []
  : typeof guards === 'string' ? [guards] : [...guards]

const gateOf = (gate: EntrypointOptions['gate']): EntrypointProtocol['gate'] => gate == null
  ? undefined
  : {
      alias: gate.alias,
      params: gate.params == null ? [] : typeof gate.params === 'string' ? [gate.params] : [...gate.params],
    }

/** Create an immutable protocol declaration from a route and its contract. */
export const protocol = <Request extends RequestShape, Response>(
  route: RouteModel,
  entrypointContract: EntrypointContract<Request, Response>,
  options?: EntrypointOptions
): EntrypointProtocol<Request, Response> => Object.freeze({
  kind: 'entrypoint-protocol' as const,
  alias: route.route.alias,
  route: Object.freeze({ route: Object.freeze({ ...route.route }) }),
  contract: entrypointContract,
  sticky: options?.sticky ?? false,
  guards: Object.freeze(guardsOf(options?.guards)),
  gate: gateOf(options?.gate),
})

export const openProtocol = (
  route: RouteModel,
  options?: EntrypointOptions
): EntrypointProtocol<OpenRequest, OpenValue> => Object.freeze({
  kind: 'entrypoint-protocol' as const,
  alias: route.route.alias,
  route: Object.freeze({ route: Object.freeze({ ...route.route }) }),
  sticky: options?.sticky ?? false,
  guards: Object.freeze(guardsOf(options?.guards)),
  gate: gateOf(options?.gate),
})

export const entrypointRef = <Request extends RequestShape = OpenRequest, Response = OpenValue>(
  alias: string
): EntrypointReference<RegisteredEntrypoint<Request, Response>> => ({ alias })

export const aliasOf = (reference: EntrypointReference | string): string =>
  typeof reference === 'string' ? reference : reference.alias

export const isEntrypointProtocol = (value: object): value is EntrypointProtocolDeclaration =>
  'kind' in value && value.kind === 'entrypoint-protocol'

export interface EntrypointTree {
  readonly [key: string]: EntrypointProtocolDeclaration | EntrypointTree
}

/** Flatten an exported protocol tree for a layer-specific materializer. */
export const protocols = (tree: EntrypointTree): EntrypointProtocolDeclaration[] => {
  const result: EntrypointProtocolDeclaration[] = []

  const visit = (node: EntrypointTree): void => {
    Object.values(node).forEach((entry) => {
      if (isEntrypointProtocol(entry)) {
        result.push(entry)
      } else {
        visit(entry)
      }
    })
  }

  visit(tree)
  return result
}

/**
 * Rebuild an immutable protocol tree while transforming its declarations.
 *
 * Protocol consumers keep addressing declarations by their exported tree path; a cross-cutting
 * concern such as a coguard therefore never needs to flatten the tree and recover declarations
 * by alias.
 */
export const mapProtocols = <Tree extends EntrypointTree>(
  tree: Tree,
  mapper: (protocol: EntrypointProtocolDeclaration) => EntrypointProtocolDeclaration,
): Tree => Object.freeze(Object.fromEntries(
  Object.entries(tree).map(([key, entry]) => [
    key,
    isEntrypointProtocol(entry) ? mapper(entry) : mapProtocols(entry, mapper),
  ])
)) as Tree

/** Resolve the gates a protocol inherits through its route parents without materializing it. */
export const gatesOf = (
  protocol: EntrypointProtocolDeclaration,
  tree: EntrypointTree,
): readonly EntrypointGate[] => {
  const byAlias = new Map(protocols(tree).map(candidate => [candidate.alias, candidate]))
  const result: EntrypointGate[] = []
  const visited = new Set<string>()
  let current: EntrypointProtocolDeclaration | undefined = protocol

  while (current != null && !visited.has(current.alias)) {
    visited.add(current.alias)
    if (current.gate != null && !result.some(gate => gate.alias === current!.gate!.alias)) {
      result.push(current.gate)
    }
    current = current.route.route.parent == null
      ? undefined
      : byAlias.get(current.route.route.parent)
  }

  return result
}

/** Clone an immutable protocol while preserving its request/response pair. */
export const decorateEntrypoint = <Protocol extends EntrypointProtocolDeclaration>(
  protocol: Protocol,
  options: EntrypointOptions
): Protocol => Object.freeze({
  ...protocol,
  sticky: options.sticky ?? protocol.sticky,
  guards: options.guards == null ? protocol.guards : guardsOf(options.guards),
  gate: options.gate == null ? protocol.gate : gateOf(options.gate),
})
