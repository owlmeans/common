import { entrypoints } from '@owlmeans/server-app'
import { sharedEntrypoints } from '__APP_SLUG__-common'

// Handlers attach to the shared declarations, never to a route re-declared here:
// `elevate(sharedEntrypoints, alias, handler)` from '@owlmeans/server-app'.
export const appEntrypoints = [...entrypoints, ...sharedEntrypoints]
