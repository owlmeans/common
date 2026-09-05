import { body, entrypoint, filter, params } from '@owlmeans/entrypoint'
import { route, RouteMethod } from '@owlmeans/route'
import { session } from './consts.js'
import { AddItemSchema, ItemParamsSchema, SessionParamsSchema } from './schemas.js'
import type { AddItemPayload, ItemParams, SessionParams } from './types.js'

/**
 * Shared entrypoint declarations. The api elevates these with handlers; the web
 * elevates them with screen components and calls them. Routes resolve under the
 * api service `base` (`/api`), so e.g. `session.list` → `GET /api/session/:sid/items`.
 */
export const sessionEntrypoints = [
  entrypoint(route(session.base, '/session')),
  entrypoint(
    route(session.list, '/:sid/items', { parent: session.base, method: RouteMethod.GET }),
    filter(params<SessionParams>(SessionParamsSchema)),
  ),
  entrypoint(
    route(session.add, '/:sid/items', { parent: session.base, method: RouteMethod.POST }),
    filter(params<SessionParams>(SessionParamsSchema, body<AddItemPayload>(AddItemSchema))),
  ),
  entrypoint(
    route(session.remove, '/:sid/items/:id', { parent: session.base, method: RouteMethod.DELETE }),
    filter(params<ItemParams>(ItemParamsSchema)),
  ),
]
