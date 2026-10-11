import type { DiscoveredEntry } from './types.js'

export interface ScopePackage {
  /** Realpath of the package dir, used to dedup the same physical package read via
   *  multiple (symlinked) locations. */
  realDir: string
  entries: DiscoveredEntry[]
}
