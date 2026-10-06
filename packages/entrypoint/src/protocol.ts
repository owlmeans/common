import type { EntrypointReference } from '@owlmeans/context'
import type { JSONSchemaType, AnySchemaObject } from 'ajv'
import type { RouteModel } from '@owlmeans/route'
import type { AnyShapeSource } from './types.local.js'
import type { EntrypointContract, EntrypointGate, EntrypointOptions, EntrypointProtocol, EntrypointProtocolDeclaration, EntrypointSchema, EntrypointTree, OpenRequest, OpenValue, RegisteredEntrypoint, RequestFromSources, RequestShape, RequestSources, RuntimeResponseSchemas, ShapeSource, Typed } from './types.js'

export const schema = <T>(value: JSONSchemaType<T>): EntrypointSchema<T> =>
  value as EntrypointSchema<T>

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
export function contract<Response>(response: ShapeSource<Response>): EntrypointContract<{}, Response>
export function contract<Body extends OpenValue, Response>(
  body: ShapeSource<Body>, response: ShapeSource<Response>
): EntrypointContract<{ body: Body }, Response>
export function contract(
  first?: AnyShapeSource, second?: AnyShapeSource
): EntrypointContract<RequestShape, OpenValue> {
  const body = second == null ? undefined : first
  const response = second ?? first

  return {
    kind: 'entrypoint-contract',
    requestSchemas: { body: schemaOf(body) },
    responseSchemas: responseSchemasOf(response),
  }
}

export namespace contract {
  export function request<Sources extends RequestSources, Response>(
    request: Sources,
    response: ShapeSource<Response>
  ): EntrypointContract<RequestFromSources<Sources>, Response> {
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
