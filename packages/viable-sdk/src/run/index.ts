import { makeLocalRunHelper } from './local.js'
import type { LocalRunStatus, RunLocalOptions, RunLocalResult } from './types.js'

export * from './state.js'
export type * from './state/types.js'
export * from './process.js'
export type * from './process/types.js'
export * from './local.js'
export type * from './local/types.js'
export type * from './types.js'
export * from './serve.js'

export type { LocalProcessStatus, LocalRunStatus, RunLocalOptions, RunLocalResult } from './types.js'

/** @deprecated compat:factory-refactor — use `makeLocalRunHelper(dir).runLocal(…)` */
export const runLocal = async (dir: string, options: RunLocalOptions = {}): Promise<RunLocalResult> =>
  await makeLocalRunHelper(dir).runLocal(options)

/** @deprecated compat:factory-refactor — use `makeLocalRunHelper(dir).stopLocal()` */
export const stopLocal = async (dir: string): Promise<void> => await makeLocalRunHelper(dir).stopLocal()

/** @deprecated compat:factory-refactor — use `makeLocalRunHelper(dir).localStatus()` */
export const localStatus = async (dir: string): Promise<LocalRunStatus> => await makeLocalRunHelper(dir).localStatus()
