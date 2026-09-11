import { bindAll, entrypoints } from '@owlmeans/server-app'
import { sessionEntrypoints } from '__APP_SLUG__-common'
import * as handlers from './app/session/index.js'

// Each handler is already bound to its protocol; binding materializes the local server entries.
const sessionEntrypointsForApi = bindAll(sessionEntrypoints, [handlers.list, handlers.add, handlers.remove])

export const appEntrypoints = [...entrypoints, ...sessionEntrypointsForApi]
