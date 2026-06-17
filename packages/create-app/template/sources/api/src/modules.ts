import { elevate, modules } from '@owlmeans/server-app'
import { session, sessionModules } from '__APP_SLUG__-common'
import * as handlers from './app/session/index.js'

// Attach handler implementations to the shared entrypoint declarations.
elevate(sessionModules, session.base)
elevate(sessionModules, session.list, handlers.list)
elevate(sessionModules, session.add, handlers.add)
elevate(sessionModules, session.remove, handlers.remove)

export const appModules = [...modules, ...sessionModules]
