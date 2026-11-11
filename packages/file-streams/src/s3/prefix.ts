import { createHash } from 'node:crypto'
import { DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import type { ListObjectsV2CommandOutput } from '@aws-sdk/client-s3'
import { logger } from '@owlmeans/log'
import { S3TransferError } from '../errors.js'
import type { SignalOptions } from '../types.js'
import { S3_DELETE_BATCH_SIZE } from './consts.js'
import type { S3ListedObject } from './types.js'
import type { S3BuildHandler, S3Core, S3PrefixOps } from './types.local.js'

const log = logger('file-streams:s3')

/** Listing and deleting everything under one prefix of the bucket. */
export const makeS3PrefixOps = (core: S3Core): S3PrefixOps => {
  const failure = (error: unknown, op: string, signal?: AbortSignal): unknown => {
    if (signal?.aborted === true) {
      return signal.reason
    }
    log.error('S3 prefix operation failed', error as Error)
    return new S3TransferError(op)
  }

  // DeleteObjects requires a checksum. The SDK's flexible checksums (CRC32) are not understood by
  // every S3-compatible store; Content-MD5 is, by all of them and by S3 itself — the SDK's documented
  // MD5 fallback: the flexible checksum headers go, a Content-MD5 of the body takes their place.
  const contentMd5 = (next: S3BuildHandler): S3BuildHandler => async args => {
    const request = args.request as { headers?: Record<string, string>, body?: unknown }
    if (request.headers != null && (typeof request.body === 'string' || request.body instanceof Uint8Array)) {
      for (const header of Object.keys(request.headers)) {
        if (/^x-amz-(sdk-)?checksum-/i.test(header)) {
          delete request.headers[header]
        }
      }
      request.headers['content-md5'] = createHash('md5').update(request.body).digest('base64')
    }
    return await next(args)
  }

  const withContentMd5 = (command: DeleteObjectsCommand): DeleteObjectsCommand => {
    // A plain build handler: the SDK's middleware union cannot be inferred from it, hence the cast.
    command.middlewareStack.addRelativeTo(contentMd5 as never, {
      relation: 'after', toMiddleware: 'flexibleChecksumsMiddleware', name: 'owlmeansContentMd5',
    })
    return command
  }

  const list = async (prefix: string, options: SignalOptions = {}): Promise<S3ListedObject[]> => {
    const base = `${core.keyOf(prefix)}/`
    const items: S3ListedObject[] = []
    let token: string | undefined
    do {
      let page: ListObjectsV2CommandOutput
      try {
        page = await core.client().send(
          new ListObjectsV2Command({ Bucket: core.model.bucket, Prefix: base, ...(token != null ? { ContinuationToken: token } : {}) }),
          { abortSignal: options.signal }
        )
      } catch (error) {
        throw failure(error, 'list', options.signal)
      }
      for (const object of page.Contents ?? []) {
        if (object.Key != null && object.Key.startsWith(base) && object.Key.length > base.length) {
          items.push({
            key: object.Key, path: object.Key.slice(base.length), size: object.Size ?? 0, etag: object.ETag, modifiedAt: object.LastModified,
          })
        }
      }
      token = page.IsTruncated === true ? page.NextContinuationToken : undefined
    } while (token != null)

    return items
  }

  const removePrefix = async (prefix: string, options: SignalOptions = {}): Promise<number> => {
    const keys = (await list(prefix, options)).map(item => item.key)
    let removed = 0
    for (let index = 0; index < keys.length; index += S3_DELETE_BATCH_SIZE) {
      const batch = keys.slice(index, index + S3_DELETE_BATCH_SIZE)
      let errors
      try {
        const result = await core.client().send(withContentMd5(new DeleteObjectsCommand({
          Bucket: core.model.bucket, Delete: { Objects: batch.map(Key => ({ Key })), Quiet: true },
        })), { abortSignal: options.signal })
        errors = result.Errors ?? []
      } catch (error) {
        throw failure(error, 'delete-objects', options.signal)
      }
      if (errors.length > 0) {
        log.error('S3 refused deleting keys', { refused: errors.length, code: errors[0].Code })
        throw new S3TransferError(`delete-objects:${errors[0].Code ?? 'error'}`)
      }
      removed += batch.length
    }
    log.debug('Prefix removed', { objects: removed })

    return removed
  }

  return { list, removePrefix }
}
