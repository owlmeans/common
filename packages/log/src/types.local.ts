import type { LogLevel } from './types.js'

export type Severity = Exclude<LogLevel, 'silent'>
