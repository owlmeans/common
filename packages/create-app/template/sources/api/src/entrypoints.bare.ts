import { elevate, entrypoints } from '@owlmeans/server-app'
import { sharedEntrypoints } from '__APP_SLUG__-common'

// Handlers bind to a protocol; a bare shell starts without any implementations.
export const appEntrypoints = [...entrypoints, ...elevate(sharedEntrypoints, [])]
