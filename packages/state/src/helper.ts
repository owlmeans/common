import type { ResourceRecord } from '@owlmeans/resource'
import type { StateAlias } from './types.js'

/**
 * Name a state resource once, with the record type it holds attached:
 *
 * ```typescript
 * export const TASKS = stateAlias<Task>('tasks')
 * const tasks = context.getStateResource(TASKS)   // StateResource<Task>
 * ```
 *
 * The handle is the string itself at runtime — the type rides along only so that every reader of
 * the alias gets the record type without repeating it, and so that a mismatch is a compile error
 * instead of a record shaped like nothing anyone expected.
 */
export const stateAlias = <T extends ResourceRecord>(alias: string): StateAlias<T> =>
  alias as StateAlias<T>
