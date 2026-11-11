import type { UploadLimits, UploadTotals } from '@owlmeans/upload'
import type { UploadEntry, UploadQueueProgress, UploadViolation } from '../types.js'

/** Every string the parts show, through one `translate` and one locale. Build it with `makeUploadText`. */
export interface UploadText {
  /** A bundle string (`pickers.files`), `{name}` placeholders filled from `values`. */
  text: (key: string, values?: Record<string, string | number>) => string
  /** Bytes in the locale's units: B, kB, MB, GB (powers of 1024). */
  size: (bytes: number) => string
  /** A whole number in the locale. */
  count: (value: number) => string
  /** A `0…1` share as a percentage in the locale. */
  percent: (ratio: number) => string
  /** An entry's status: `Ready`, `Uploading… 40%`, `Uploaded`, `Rejected`, `Failed`. */
  status: (entry: UploadEntry) => string
  /**
   * Why it stands where it does — the broken limit (with the policy's ceiling from `limits`), the
   * reason, the failure, the archive it came from; `null` when there is nothing to say.
   */
  detail: (entry: UploadEntry, limits?: UploadLimits) => string | null
  /** A queue-wide violation, with its numbers. */
  violation: (violation: UploadViolation) => string
  /** The policy's limits in one line. */
  hints: (limits: UploadLimits) => string
  /** `Files: 3 · 1.2 MB`. */
  totals: (totals: UploadTotals) => string
  /** `Uploaded 1.2 MB of 3 MB`. */
  progress: (progress: UploadQueueProgress) => string
}
