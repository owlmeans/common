import type { FileScope } from '@owlmeans/storage-common'
import type { S3Bucket, S3ListedObject, S3SinkOptions } from '../s3/types.js'
import type { ConflictPolicy } from '../sinks/types.js'
import type { TransferHelper, TransferOptions, TransferResult } from '../transfer/types.js'
import type { FileSource, SignalOptions, SinkResult } from '../types.js'
import type { Workspace, WorkspaceScope } from '../workspace/types.js'

export interface BackedWorkspaceOptions {
  workspace: Workspace
  bucket: S3Bucket
  /** Objects land at `<prefix>/<organization>/<project?>/<purpose>/<path>` under the bucket's base prefix. */
  prefix?: string
  /** Moves every file; default `transferHelper` (a service hands its configured one). */
  transfer?: TransferHelper
  /** How objects are written; Content-Type and disposition come from the local copy's verdict. */
  sink?: S3SinkOptions
}

export interface BackedPutOptions extends TransferOptions {
  /** What the local write does when the entry exists. Default `overwrite`, like the bucket. */
  onConflict?: ConflictPolicy
}

export interface BackedPutResult {
  local: SinkResult
  remote: SinkResult
  /** The verified move into the local entry: verdict, counted bytes, digest. */
  transfer: TransferResult
}

export interface BackedRestoreResult {
  /** Paths downloaded because they were missing locally or had another size. */
  restored: string[]
  /** Paths already present locally with the listed size. */
  kept: string[]
}

/**
 * One scope kept in a local workspace and mirrored to a bucket. The bucket is the authority:
 * a put that cannot reach it leaves nothing local, a restore brings back what the listing names.
 */
export interface BackedScope {
  readonly scope: FileScope
  readonly local: WorkspaceScope
  /** The object key of a path: `<basePrefix>/<prefix?>/<scope path>/<path>`. */
  key: (path: string) => string
  /** The bucket prefix of a path — what `bucket.source`, `sink`, `head` and `urlOf` take. */
  prefixOf: (path: string) => string
  /**
   * Copies `source` into the local entry through the transfer helper (verified by `options.verify`),
   * then uploads the LOCAL file. A failed upload removes the local copy and rethrows.
   */
  put: (path: string, source: FileSource, options?: BackedPutOptions) => Promise<BackedPutResult>
  /** Downloads every listed object missing locally or of another size (byte-identical, unverified). */
  restore: (options?: SignalOptions) => Promise<BackedRestoreResult>
  /** The remote listing; `path` is relative to the scope. */
  list: (options?: SignalOptions) => Promise<S3ListedObject[]>
  /** Removes a file (or a folder) locally and remotely. */
  remove: (path: string, options?: SignalOptions) => Promise<void>
  /** Drops the local copy only; `restore` brings it back. */
  evict: () => Promise<void>
  /** Drops the local copy and every object under the scope's prefix. */
  drop: (options?: SignalOptions) => Promise<void>
}

/** A workspace whose scopes are mirrored to one bucket. */
export interface BackedWorkspace {
  readonly workspace: Workspace
  readonly bucket: S3Bucket
  /** @throws {FileScopeError} for an invalid scope. */
  scope: (scope: FileScope) => BackedScope
}
