export interface PathLimits {
  /** Longest relative path, in UTF-8 bytes. */
  maxPathBytes: number
  /** Deepest relative path, in segments. */
  maxPathSegments: number
}

export interface PathUtils {
  /**
   * A relative entry path normalized (`\` → `/`, NFC, `.` and empty segments dropped), or a
   * `PathError`: `invalid-char`, `absolute`, `traversal`, `empty`, `too-long`, `too-deep`.
   */
  entry: (raw: string, limits?: Partial<PathLimits>) => string
  /** The absolute path of a normalized relative path under `root`; refuses an escape. */
  join: (root: string, relative: string) => string
  /** Refuses (`PathError('symlink')`) when any existing ancestor of `target` below `root` is a link. */
  assertNoLinks: (root: string, target: string) => Promise<void>
  /** An object key: `prefix` and a normalized relative path joined by `/`. */
  key: (prefix: string, relative: string) => string
}
