import type { TransferLimits } from './types.js'

export const DEFAULT_TRANSFER_LIMITS: Readonly<TransferLimits> = Object.freeze({
  maxBytes: 512 * 1024 * 1024,
  timeoutMs: 600_000,
  idleTimeoutMs: 30_000,
})

/** The name a file is written under when nothing names it. */
export const FALLBACK_FILE_NAME = 'download'
