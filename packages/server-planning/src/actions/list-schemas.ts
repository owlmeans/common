import { handlers } from '@owlmeans/server-api'
import type { PlanningProtocols, ScopedSchemaBundle } from '@owlmeans/planning'
import type { Context, PlanningHandlerOptions } from '../types.js'
import { guardHelper } from '../utils/guard.js'
import { planningHandlerOf } from '../utils/handler.js'
import type { RequestHandler } from './types.js'

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
  handlers<Context>().request(protocol, async (req, ctx) => guardHelper.reply(async (): Promise<ScopedSchemaBundle> => {
    const { facade } = await planningHandlerOf(ctx).handlerScopeOf(req, opts)
    if (facade.definitions == null) {
      return facade.schemas.bundle()
    }

    return await facade.definitions.bundle(text((req.query as { project?: unknown } | undefined)?.project))
  }))
