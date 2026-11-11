import type { FileScope } from '../types.js'

/** Reads and writes the nesting of a {@link FileScope}. */
export interface FileScopeHelper {
  /**
   * `organization/project/purpose`, or `organization/purpose` without a project.
   * @throws {FileScopeError} when the scope is invalid (see `assert`).
   */
  pathOf: (scope: FileScope) => string
  /**
   * The scope a path names: two segments are `organization/purpose`, three
   * `organization/project/purpose`.
   * @throws {FileScopeError} `path` for any other shape or an invalid segment.
   */
  parse: (path: string) => FileScope
  /** Whether a value is one valid segment: 1–128 characters of `[A-Za-z0-9][A-Za-z0-9._-]*`. */
  isSegment: (value: unknown) => value is string
  /**
   * Refuses anything but a valid scope.
   * @throws {FileScopeError} `shape` (not an object), or the name of the first invalid field.
   */
  assert: (scope: unknown) => asserts scope is FileScope
}
