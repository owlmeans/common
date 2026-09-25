
export const DEF_MODAL_ALIAS = 'modal'
export const DEF_DEBUG_ALIAS = 'debug'

export const DEBUGGER_FLAG = 'debugger'
export const DEBUG_CONFIG_KEY = 'debugger'

/** How many times `retryImport` loads a chunk again after its first failure. */
export const DEF_IMPORT_RETRY_ATTEMPTS = 2
/** The pause before each retry, in order; the last one repeats. */
export const DEF_IMPORT_RETRY_DELAYS_MS: readonly number[] = [500, 1500]

/** The `sessionStorage` key `recoverFromChunkError` keeps the time of its last reload under. */
export const CHUNK_RELOAD_KEY = 'owlmeans:chunk-reload'
/** At most one chunk-recovery reload per this window, per tab. */
export const CHUNK_RELOAD_WINDOW_MS = 60_000

