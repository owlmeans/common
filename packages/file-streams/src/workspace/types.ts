import type { FileScope } from '@owlmeans/storage-common'
import type { ConflictPolicy } from '../sinks/types.js'
import type { SourceClaims } from '../sources/types.js'
import type { FileSink, FileSource, TreeSink } from '../types.js'

export interface WorkspaceOptions {
  /**
   * An absolute folder, or one relative to `os.tmpdir()` (which `TMPDIR` moves) — never to the cwd.
   * Default `<os.tmpdir()>/owlmeans-workspace`. Not persistent across pod restarts.
   */
  root?: string
  /** Mode of created folders. Default `0o700`. */
  dirMode?: number
  /** Mode of written files. Default `0o600`. */
  fileMode?: number
}

/** One file of a scope. */
export interface WorkspaceFile {
  /** Relative to the scope folder, `/`-separated. */
  path: string
  size: number
  modifiedAt: Date
}

export interface WorkspaceWriteOptions {
  /** What a write does when the entry exists. Default `error` (`PathError('exists')`). */
  onConflict?: ConflictPolicy
}

export interface WorkspacePruneOptions {
  /** Scopes whose newest file, folder or marker is older than this are dropped. */
  olderThanMs: number
}

/**
 * The folder of one {@link FileScope}: `<root>/<organization>/<project?>/<purpose>`. Every path is
 * relative, normalized and confined — `..`, absolute paths, the scope marker's name and any existing
 * symlink on the way from the workspace root are refused (`PathError`).
 */
export interface WorkspaceScope {
  readonly scope: FileScope
  /** The absolute scope folder. */
  readonly dir: string
  /** A confined directory sink over the scope (an archive extracts into it); case-fold twins refused. */
  tree: (options?: WorkspaceWriteOptions) => TreeSink
  /** The sink of one file of the scope. */
  entry: (path: string, options?: WorkspaceWriteOptions) => FileSink
  /** One file of the scope as a re-openable, random-access source. */
  source: (path: string, claims?: SourceClaims) => FileSource
  /** Every regular file, recursively, sorted by path; links are neither followed nor listed. */
  list: () => Promise<WorkspaceFile[]>
  /** Whether the path is a regular file of the scope. */
  has: (path: string) => Promise<boolean>
  /** Removes a file or a folder of the scope (and parents it leaves empty); `false` when absent. */
  remove: (path: string) => Promise<boolean>
  /** Removes the scope folder and every parent it leaves empty, up to the workspace root. */
  drop: () => Promise<void>
}

/** A service's temporary files, one folder per {@link FileScope}. */
export interface Workspace {
  /** The absolute root. */
  readonly root: string
  /** The scope's folder object; no I/O until it is used. @throws {FileScopeError} for an invalid scope. */
  scope: (scope: FileScope) => WorkspaceScope
  /** The scopes present on disk — of one organization, or all — sorted by path. */
  scopes: (organization?: string) => Promise<FileScope[]>
  /** Drops every scope untouched for `olderThanMs`; answers how many were dropped. */
  prune: (options: WorkspacePruneOptions) => Promise<number>
}
