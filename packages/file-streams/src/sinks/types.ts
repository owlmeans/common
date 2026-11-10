/** What a file sink does when its target already exists. */
// Two behaviours, nothing else to say about them — a union.
export type ConflictPolicy = 'error' | 'overwrite'

export interface FileSinkOptions {
  /** Default `error` (`PathError('exists')`). */
  onConflict?: ConflictPolicy
  /** File mode of the committed file. Default `0o644`. */
  mode?: number
  /** Create missing parent directories. Default `true`. */
  mkdirs?: boolean
}
