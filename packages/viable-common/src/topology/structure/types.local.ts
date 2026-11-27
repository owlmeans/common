import type { StructurePartKeys } from './types.js'

/** A part as read from a record or a payload: its keys, and a purpose where one was written. */
export interface StructurePartRead extends StructurePartKeys {
  purpose?: string
}
