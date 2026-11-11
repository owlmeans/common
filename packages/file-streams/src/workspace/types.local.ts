/** What a workspace's scopes share. */
export interface WorkspaceCore {
  readonly root: string
  readonly dirMode: number
  readonly fileMode: number
}

export interface WorkspaceFs {
  /** Whether `path` is a regular file (a link is not). */
  isFile: (path: string) => Promise<boolean>
  /** The names of the real folders (no links) directly inside `path`; none when it is absent. */
  dirs: (path: string) => Promise<string[]>
  /** Removes `from` and its parents while they are empty, stopping below `root`. */
  removeEmptyParents: (from: string, root: string) => Promise<void>
}

/** An entry path of a scope, normalized, and where it lands. */
export interface WorkspaceTarget {
  relative: string
  absolute: string
}
