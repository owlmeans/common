import type { UploadQueueProgress } from '../types.js'

/** The progress of a queue with nothing being sent. */
export const IDLE_PROGRESS: Readonly<UploadQueueProgress> = Object.freeze({ loaded: 0, total: 0, ratio: 0, count: 0, settled: 0 })
