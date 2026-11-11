import type { PathLimits } from './types.js'

export const DEFAULT_PATH_LIMITS: Readonly<PathLimits> = Object.freeze({ maxPathBytes: 1024, maxPathSegments: 64 })
