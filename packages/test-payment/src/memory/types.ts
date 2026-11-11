/** The rows of one in-memory resource. */
export interface MemoryStore {
  rows: Array<Record<string, any>>
  /** Make the next calls of a method throw. */
  failing: Set<string>
}
