import { handlers } from '@owlmeans/server-api'
import { PlanningUnsupported, type PlanningProtocols, type SchemaDefineReply, type SchemaDefineRequest } from '@owlmeans/planning'
import type { Context, PlanningHandlerOptions } from '../types.js'
import { makePlanningAccessModel } from '../utils/access.js'
import { guardHelper } from '../utils/guard.js'
import { planningHandlerOf } from '../utils/handler.js'
import { applySchemaRequest } from './apply-schema-request.js'
import type { RequestHandler } from './types.js'

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
  handlers<Context>().request(protocol, async (req, ctx) => guardHelper.concealed(async (): Promise<SchemaDefineReply> => {
    const { facade, access } = await planningHandlerOf(ctx).handlerScopeOf(req, opts)
    const request = (req.body ?? {}) as SchemaDefineRequest
    if (facade.definitions == null) {
      throw new PlanningUnsupported('definitions')
    }
    const model = makePlanningAccessModel(access)
    if (request.project != null) {
      model.assertWrites(request.project)
    }
    model.assertGranted('defineSchemas', request.project)

    return await applySchemaRequest(facade.definitions, request)
  }))
