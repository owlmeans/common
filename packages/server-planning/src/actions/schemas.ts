import { handlers } from '@owlmeans/server-api'
import { PlanningUnsupported, SchemaWriteMode } from '@owlmeans/planning'
import type {
  PlanningDefinitions, PlanningProtocols, SchemaDefineReply, SchemaDefineRequest, ScopedSchemaBundle, ScopedSchemaRecord,
} from '@owlmeans/planning'
import type { Context, PlanningHandlerOptions } from '../types.js'
import { assertGranted, assertWrites, concealed, handlerScopeOf } from '../utils/index.js'

type RequestHandler = ReturnType<ReturnType<typeof handlers<Context>>['request']>

const text = (value: unknown): string | undefined =>
  value == null || value === '' ? undefined : `${Array.isArray(value) ? value[0] : value}`

/**
 * The schema bundle — what a client loads to answer `can()` with no round trip. Scoped like every
 * other leaf (no organization, no bundle). Where the store holds data-defined schemas it is the
 * resolved layer of the organization, or of the project the `project` query names (a project this
 * scope can see); otherwise the service's code bundle.
 *
 * @throws {WorkcardNotFound} for a project this scope cannot see
 */
export const listSchemas = (
  protocol: PlanningProtocols['schema']['list'], opts?: PlanningHandlerOptions
): RequestHandler =>
  handlers<Context>().request(protocol, async (req, ctx) => concealed(async (): Promise<ScopedSchemaBundle> => {
    const { facade } = await handlerScopeOf(ctx, req, opts)
    if (facade.definitions == null) {
      return facade.schemas.bundle()
    }

    return await facade.definitions.bundle(text((req.query as { project?: unknown } | undefined)?.project))
  }))

/**
 * Apply one `schema.define` request to a facade's definitions: the declarations in the request's
 * mode (flows before types), then the retirements — answering what was written and the layer as it
 * resolves afterwards.
 */
export const applySchemaRequest = async (
  definitions: PlanningDefinitions, request: SchemaDefineRequest
): Promise<SchemaDefineReply> => {
  const layer = request.project != null ? { project: request.project } : {}
  const declarations = { types: request.types ?? [], flows: request.flows ?? [] }
  const records: ScopedSchemaRecord[] = []

  switch (request.mode ?? SchemaWriteMode.Define) {
    case SchemaWriteMode.Put:
      for (const flow of declarations.flows) {
        records.push(await definitions.putFlow(flow, layer))
      }
      for (const type of declarations.types) {
        records.push(await definitions.putType(type, layer))
      }
      break
    case SchemaWriteMode.Seed:
      records.push(...await definitions.seed(declarations, layer))
      break
    default:
      records.push(...await definitions.define(declarations, layer))
  }
  for (const key of request.retire ?? []) {
    records.push(await definitions.retire(key.kind, key.key, layer))
  }

  return { records, bundle: await definitions.bundle(request.project) }
}

/**
 * The write of data-defined types and flows. A project layer needs the project in the access's
 * `writes` when the resolver answers it; then `grants.defineSchemas` gates when the resolver answers
 * grants (the organization-wide layer needs `true`, a project layer its id).
 *
 * @throws {PlanningUnsupported} where the store holds no data-defined schemas
 * @throws {PlanningForbidden | SchemaConflict | SchemaSealed | SchemaInvalid | SchemaInUse | WorkcardNotFound}
 */
export const defineSchemas = (
  protocol: NonNullable<PlanningProtocols['schema']['define']>, opts?: PlanningHandlerOptions
): RequestHandler =>
  handlers<Context>().request(protocol, async (req, ctx) => concealed(async (): Promise<SchemaDefineReply> => {
    const { facade, access } = await handlerScopeOf(ctx, req, opts)
    const request = (req.body ?? {}) as SchemaDefineRequest
    if (facade.definitions == null) {
      throw new PlanningUnsupported('definitions')
    }
    if (request.project != null) {
      assertWrites(access, request.project)
    }
    assertGranted(access, 'defineSchemas', request.project)

    return await applySchemaRequest(facade.definitions, request)
  }))
