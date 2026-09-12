import { contract, openProtocol, protocol, typed } from '@owlmeans/entrypoint'
import { route, RouteMethod, frontend } from '@owlmeans/route'
import { AddItemSchema, ItemParamsSchema, SessionParamsSchema } from './schemas.js'
import type { SessionItem } from './types.js'

const aliases = {
  session: {
    base: '__APP_SLUG__:api:session',
    list: '__APP_SLUG__:api:session:list',
    add: '__APP_SLUG__:api:session:add',
    remove: '__APP_SLUG__:api:session:remove',
  },
  web: {
    base: '__APP_SLUG__:web:base',
    home: '__APP_SLUG__:web:home',
    session: '__APP_SLUG__:web:session',
    about: '__APP_SLUG__:web:about',
  },
}

const sessionBase = protocol(route(aliases.session.base, '/session'), contract())
const webBase = openProtocol(route(aliases.web.base, '/', frontend()))

/**
 * Shared entrypoint declarations. The api materializes these with handlers; the web
 * materializes them with screen components and calls them. Routes resolve under the
 * api service `base` (`/api`), so e.g. `session.list` → `GET /api/session/:sid/items`.
 */
export const session = {
  base: sessionBase,
  list: protocol(
    route(aliases.session.list, '/:sid/items', { parent: sessionBase, method: RouteMethod.GET }),
    contract.request({ params: SessionParamsSchema }, typed<SessionItem[]>()),
  ),
  add: protocol(
    route(aliases.session.add, '/:sid/items', { parent: sessionBase, method: RouteMethod.POST }),
    contract.request({
      params: SessionParamsSchema,
      body: AddItemSchema,
    }, typed<SessionItem>()),
  ),
  remove: protocol(
    route(aliases.session.remove, '/:sid/items/:id', { parent: sessionBase, method: RouteMethod.DELETE }),
    contract.request({ params: ItemParamsSchema }, typed<{ removed: boolean }>()),
  ),
}

/** Frontend routes are protocol declarations too; their renderer is bound by the web project. */
export const web = {
  base: webBase,
  home: openProtocol(route(aliases.web.home, '/', frontend({ default: true, parent: webBase }))),
  session: openProtocol(route(aliases.web.session, '/session', frontend({ parent: webBase }))),
  about: openProtocol(route(aliases.web.about, '/about', frontend({ parent: webBase }))),
}

/** The shared immutable protocol tree. Runtime packages bind their own local handlers and screens. */
export const appEntrypoints = {
  api: { session },
  web,
}
