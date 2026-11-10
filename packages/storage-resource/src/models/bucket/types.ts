import type { S3Client } from '@aws-sdk/client-s3'
import type { StorageConfig } from '../../types.js'

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
  /** Prefix of every key. */
  readonly basePrefix: string
  /** Canned ACL uploads carry, when any. */
  readonly acl?: string
  /** The object key of `prefix`: `<basePrefix>/<prefix>`, exactly as the upload resource writes it. */
  keyOf: (prefix: string) => string
  /** The public URL an object stored under `prefix` answers on. */
  urlOf: (prefix: string) => string
  /**
   * A new client for this bucket. The caller owns it and calls `destroy()` when done. Checksums are
   * computed only when an operation requires them, which S3-compatible stores accept.
   */
  createClient: () => S3Client
}
