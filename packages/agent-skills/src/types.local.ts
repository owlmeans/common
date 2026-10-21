import type { DiscoveredEntry } from './types.js'

/** A generated part on disk that its skill no longer lists. */
export interface StalePart {
  name: string
  /** Absolute path of the installed part file. */
  path: string
}

export interface ScopePackage {
  /** Realpath of the package dir, used to dedup the same physical package read via
   *  multiple (symlinked) locations. */
  realDir: string
  entries: DiscoveredEntry[]
}
