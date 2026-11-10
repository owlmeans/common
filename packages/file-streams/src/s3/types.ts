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
  /** A sink result as a storage-common file instance. */
  instanceOf: (result: SinkResult, alias: string) => StoredFileInstance
  /** Releases the client. */
  close: () => void
}
