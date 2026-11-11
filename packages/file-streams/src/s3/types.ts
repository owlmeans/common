import type { StorageBucketModel } from '@owlmeans/storage-resource'
import type { StoredFileInstance } from '@owlmeans/storage-common'
import type { FileSink, FileSource, SignalOptions, SinkResult, TreeSink } from '../types.js'

export interface S3BucketOptions {
  /** Multipart part size. Default 8 MiB, at least 5 MiB. */
  partSize?: number
  /** Parts in flight. Default 2. */
  concurrency?: number
}

export interface S3SinkOptions {
  /** Overrides the type taken from the verdict or the source. */
  contentType?: string
  /** Default `inline`; active svg/html is written as `attachment` unless allowed. */
  disposition?: 'inline' | 'attachment'
  allowActiveInline?: boolean
  cacheControl?: string
  metadata?: Record<string, string>
}

export interface S3ObjectInfo {
  key: string
  size: number
  etag?: string
  mime?: string
  modifiedAt?: Date
}

/** One object of a prefix listing (a listing carries no media type). */
export interface S3ListedObject extends S3ObjectInfo {
  /** The key relative to the listed prefix — `media/a.png` for `<basePrefix>/<prefix>/media/a.png`. */
  path: string
}

/**
 * One storage bucket as sources and sinks, addressed exactly as `@owlmeans/storage-resource`
 * addresses it: a `prefix` lands at `<basePrefix>/<prefix>` and answers on the same public URL.
 */
export interface S3Bucket {
  readonly model: StorageBucketModel
  /** The object key of a prefix (normalized; `..` and absolute prefixes refused). */
  keyOf: (prefix: string) => string
  /** The public URL of a prefix. */
  urlOf: (prefix: string) => string
  /** GetObject; random access through Range with If-Match. */
  source: (prefix: string) => FileSource
  /** PutObject when the body fits one part, a multipart upload (aborted on failure) otherwise. */
  sink: (prefix: string, options?: S3SinkOptions) => FileSink
  /** Many objects under one prefix. */
  tree: (prefix: string, options?: S3SinkOptions) => TreeSink
  head: (prefix: string, options?: SignalOptions) => Promise<S3ObjectInfo | null>
  remove: (prefix: string, options?: SignalOptions) => Promise<void>
  /**
   * Every object under `<prefix>/` — ListObjectsV2, all pages — with its full `key` and its `path`
   * relative to the prefix. An empty prefix is refused (`PathError('empty')`), never the whole bucket.
   */
  list: (prefix: string, options?: SignalOptions) => Promise<S3ListedObject[]>
  /**
   * Deletes every object under `<prefix>/` — DeleteObjects in batches of at most 1000 keys, each
   * checksummed by Content-MD5 (the SDK's MD5 fallback, which S3-compatible stores accept) — and
   * answers how many went.
   * @throws {S3TransferError} `delete-objects:<code>` when the store refuses any key of a batch.
   */
  removePrefix: (prefix: string, options?: SignalOptions) => Promise<number>
  /** A sink result as a storage-common file instance. */
  instanceOf: (result: SinkResult, alias: string) => StoredFileInstance
  /** Releases the client. */
  close: () => void
}
