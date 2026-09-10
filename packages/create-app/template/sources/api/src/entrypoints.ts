import { elevate, entrypoints } from '@owlmeans/server-app'
import { sessionEntrypoints } from '__APP_SLUG__-common'
import * as handlers from './app/session/index.js'

// Each handler is already bound to its protocol; elevation materializes the local server entries.
const sessionModules = elevate(sessionEntrypoints, [handlers.list, handlers.add, handlers.remove])

export const appEntrypoints = [...entrypoints, ...sessionModules]
