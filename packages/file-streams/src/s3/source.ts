import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import type { Readable } from 'node:stream'
import { S3TransferError, SourceError } from '../errors.js'
import type { FileInfo, FileSource, OpenedFile, OpenOptions, RangeReader, SignalOptions } from '../types.js'
import { nameUtils } from '../utils/names.js'
import { streamUtils } from '../utils/streams.js'
import type { S3Core } from './types.local.js'

/** One object as a source: re-openable, with random access through Range and If-Match. */
export const makeS3Source = (core: S3Core, key: string): FileSource => {
  let known: FileInfo | undefined

  const statusOf = (error: unknown): number | undefined => (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode

  const failure = (error: unknown, op: string, signal?: AbortSignal): unknown => {
    if (signal?.aborted === true) {
      return signal.reason
    }
    const status = statusOf(error)
    if (status === 404 || (error as Error).name === 'NoSuchKey' || (error as Error).name === 'NotFound') {
      return new SourceError('not-found')
    }
    if (status === 412 || (error as Error).name === 'PreconditionFailed') {
      return new SourceError('changed')
    }
    return new S3TransferError(op)
  }

  const describe = (head: { ContentLength?: number, ContentType?: string, ETag?: string, LastModified?: Date }): FileInfo => ({
    origin: core.location(key),
    name: nameUtils.fromKey(key),
    size: head.ContentLength,
    mime: head.ContentType?.split(';')[0].trim().toLowerCase(),
    etag: head.ETag,
    modifiedAt: head.LastModified,
  })

  const info = async (options: SignalOptions = {}): Promise<FileInfo> => {
    if (known == null) {
      try {
        known = describe(await core.client().send(new HeadObjectCommand({ Bucket: core.model.bucket, Key: key }), { abortSignal: options.signal }))
      } catch (error) {
        throw failure(error, 'head', options.signal)
      }
    }
    return known
  }

  const get = async (range: string | undefined, ifMatch: string | undefined, signal?: AbortSignal) => {
    try {
      return await core.client().send(new GetObjectCommand({
        Bucket: core.model.bucket, Key: key, ...(range != null ? { Range: range } : {}), ...(ifMatch != null ? { IfMatch: ifMatch } : {}),
      }), { abortSignal: signal })
    } catch (error) {
      throw failure(error, 'get', signal)
    }
  }

  const open = async (options: OpenOptions = {}): Promise<OpenedFile> => {
    const range = options.range != null ? `bytes=${options.range.start}-${options.range.end ?? ''}` : undefined
    const response = await get(range, undefined, options.signal)
    const opened: OpenedFile = { stream: response.Body as Readable, info: { ...describe(response), size: known?.size ?? response.ContentLength } }
    const span = /bytes (\d+)-(\d+)\/(\d+)/.exec(response.ContentRange ?? '')
    if (span != null) {
      opened.range = { start: Number(span[1]), end: Number(span[2]), total: Number(span[3]) }
      opened.info.size = Number(span[3])
    }
    return opened
  }

  const ranges = async (options: SignalOptions = {}): Promise<RangeReader> => {
    const current = await info(options)
    const size = current.size ?? 0
    return {
      size,
      read: async (offset, length, signal) => {
        const end = Math.min(offset + length, size) - 1
        if (end < offset) {
          return new Uint8Array(0)
        }
        const response = await get(`bytes=${offset}-${end}`, current.etag, signal)
        return await streamUtils.collect(response.Body as Readable, end - offset + 1)
      },
      stream: async (start, end, signal) => (await get(`bytes=${start}-${end - 1}`, current.etag, signal)).Body as Readable,
      close: async () => undefined,
    }
  }

  return { kind: 's3', info, open, ranges }
}
