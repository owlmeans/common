import type { S3Client } from '@aws-sdk/client-s3'
import type { StorageConfig } from '../../types.js'

/** What `ensure` found: the bucket was there, or it created it. */
// A closed set of two outcomes — a union is the honest type.
export type StorageEnsureOutcome = 'exists' | 'created'

/** Per-client overrides of what the entry configures. */
export interface StorageClientOptions {
  /** Attempts of one request; `1` for a streamed body, which cannot be replayed. */
  maxAttempts?: number
}

/**
 * How one `cfg.storageBuckets` entry addresses its bucket — the single reading of a
 * {@link StorageConfig} that the upload resource and every other S3 consumer share, so an object
 * written by one is found, by key and by URL, by the other.
 */
export interface StorageBucketModel {
  /** The config entry this model reads. */
  readonly config: StorageConfig
  /** The S3 `Bucket`. */
  readonly bucket: string
  /** Endpoint URL with its scheme. */
  readonly endpoint: string
  /** Signing region. */
  readonly region: string
  /** Whether requests address the bucket path-style. */
  readonly forcePathStyle: boolean
  /** Prefix of every key; empty when keys start at the bucket root. */
  readonly basePrefix: string
  /** Canned ACL uploads carry, when any. */
  readonly acl?: string
  /** The `LocationConstraint` a created bucket is placed in; absent for `us-east-1`, where S3 refuses one. */
  readonly locationConstraint?: string
  /** `<endpoint>/<adminPath>` when the entry names an admin path. Nothing here calls it. */
  readonly adminUrl?: string
  /**
   * The object key of `prefix`: `<basePrefix>/<prefix>`, or `<prefix>` without its leading slashes
   * when the base prefix is empty — exactly as the upload resource writes it.
   */
  keyOf: (prefix: string) => string
  /** The public URL an object stored under `prefix` answers on. */
  urlOf: (prefix: string) => string
  /**
   * A new client for this bucket with the entry's timeouts and attempts. The caller owns it and
   * calls `destroy()` when done. Checksums are computed only when an operation requires them,
   * which S3-compatible stores accept.
   */
  createClient: (options?: StorageClientOptions) => S3Client
  /**
   * Whether the bucket exists (HeadBucket).
   * @throws {StorageApiError} with the S3 code for any answer but found or not found.
   */
  exists: () => Promise<boolean>
  /**
   * The bucket, created when missing (HeadBucket → CreateBucket with the location constraint);
   * `BucketAlreadyOwnedByYou` counts as `exists`, and so does `BucketAlreadyExists` when the bucket
   * then answers HeadBucket (a concurrent ensure created it).
   * @throws {StorageApiError} with the S3 code for any other refusal.
   */
  ensure: () => Promise<StorageEnsureOutcome>
}
