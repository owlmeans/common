import { DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import type { S3Client } from '@aws-sdk/client-s3'
import { makeStorageBucketModel } from '@owlmeans/storage-resource'
import type { StorageBucketModel, StorageConfig } from '@owlmeans/storage-resource'
import type { StoredFileInstance } from '@owlmeans/storage-common'
import { S3TransferError } from './errors.js'
import { DEFAULT_PART_SIZE, DEFAULT_UPLOAD_CONCURRENCY, MIN_PART_SIZE } from './s3/consts.js'
import { makeS3Sink } from './s3/sink.js'
import { makeS3Source } from './s3/source.js'
import type { S3Bucket, S3BucketOptions, S3ObjectInfo, S3SinkOptions } from './s3/types.js'
import type { S3Core } from './s3/types.local.js'
import { makeS3Uploader } from './s3/upload.js'
import type { FileSink, FileSource, SignalOptions, SinkResult, TreeSink } from './types.js'
import { pathUtils } from './utils/paths.js'

/** A storage bucket — a `cfg.storageBuckets` entry or its model — as sources and sinks. */
export const createS3Bucket = (config: StorageBucketModel | StorageConfig, options: S3BucketOptions = {}): S3Bucket => {
  const model = 'createClient' in config ? config : makeStorageBucketModel(config)
  let created: S3Client | undefined
  const client = (): S3Client => {
    created ??= model.createClient()
    return created
  }

  const keyOf = (prefix: string): string => model.keyOf(pathUtils.entry(prefix))

  const core: S3Core = {
    model,
    client,
    keyOf,
    location: key => `s3://${model.bucket}/${key}`,
    partSize: Math.max(options.partSize ?? DEFAULT_PART_SIZE, MIN_PART_SIZE),
    concurrency: Math.max(1, options.concurrency ?? DEFAULT_UPLOAD_CONCURRENCY),
  }
  const uploader = makeS3Uploader(core)

  const urlOf = (prefix: string): string => model.urlOf(pathUtils.entry(prefix))

  const source = (prefix: string): FileSource => makeS3Source(core, keyOf(prefix))

  const sink = (prefix: string, sinkOptions?: S3SinkOptions): FileSink => makeS3Sink(core, uploader, pathUtils.entry(prefix), sinkOptions)

  const tree = (prefix: string, sinkOptions?: S3SinkOptions): TreeSink => {
    const base = pathUtils.entry(prefix)
    return {
      kind: 's3',
      entry: path => sink(`${base}/${pathUtils.entry(path)}`, sinkOptions),
      directory: async () => undefined,
    }
  }

  const head = async (prefix: string, headOptions: SignalOptions = {}): Promise<S3ObjectInfo | null> => {
    const key = keyOf(prefix)
    try {
      const result = await client().send(new HeadObjectCommand({ Bucket: model.bucket, Key: key }), { abortSignal: headOptions.signal })
      return { key, size: result.ContentLength ?? 0, etag: result.ETag, mime: result.ContentType, modifiedAt: result.LastModified }
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404 || (error as Error).name === 'NotFound') {
        return null
      }
      throw new S3TransferError('head')
    }
  }

  const remove = async (prefix: string, removeOptions: SignalOptions = {}): Promise<void> => {
    try {
      await client().send(new DeleteObjectCommand({ Bucket: model.bucket, Key: keyOf(prefix) }), { abortSignal: removeOptions.signal })
    } catch {
      throw new S3TransferError('delete')
    }
  }

  const instanceOf = (result: SinkResult, alias: string): StoredFileInstance => ({ size: result.bytes, alias, url: result.url ?? '' })

  const close = (): void => {
    created?.destroy()
    created = undefined
  }

  return { model, keyOf, urlOf, source, sink, tree, head, remove, instanceOf, close }
}
