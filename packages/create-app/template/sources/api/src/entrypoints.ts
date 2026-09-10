import { elevate, entrypoints } from '@owlmeans/server-app'
import { session, sessionEntrypoints } from '__APP_SLUG__-common'
import * as handlers from './app/session/index.js'

// Attach handler implementations to the shared entrypoint declarations.
elevate(sessionEntrypoints, session.base)
elevate(sessionEntrypoints, session.list, handlers.list)
elevate(sessionEntrypoints, session.add, handlers.add)
elevate(sessionEntrypoints, session.remove, handlers.remove)

export const appEntrypoints = [...entrypoints, ...sessionEntrypoints]
