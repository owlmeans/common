import { bindAll, entrypoints } from '@owlmeans/server-app'
import { sharedEntrypoints } from '__APP_SLUG__-common'

// A bare shell materializes its shared protocols without implementations.
export const appEntrypoints = [...entrypoints, ...bindAll(sharedEntrypoints)]
