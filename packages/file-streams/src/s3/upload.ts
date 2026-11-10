import {
  AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand, PutObjectCommand, UploadPartCommand,
} from '@aws-sdk/client-s3'
import type { CompletedPart, ObjectCannedACL } from '@aws-sdk/client-s3'
import type { Readable } from 'node:stream'
import { logger } from '@owlmeans/log'
import { LimitError, S3TransferError } from '../errors.js'
import { MAX_PARTS } from './consts.js'
import type { S3Core, S3Uploader, S3UploadRequest, S3UploadResult } from './types.local.js'

const log = logger('file-streams:s3')

/** Uploads of unknown length: one PutObject when the body fits a part, a multipart upload otherwise. */
export const makeS3Uploader = (core: S3Core): S3Uploader => {
  const parts = async function * (stream: Readable, size: number): AsyncGenerator<Buffer> {
    let pending: Buffer[] = []
    let length = 0
    for await (const chunk of stream) {
      let buffer = chunk as Buffer
      while (buffer.length > 0) {
        const take = Math.min(size - length, buffer.length)
        pending.push(buffer.subarray(0, take))
        length += take
        buffer = buffer.subarray(take)
        if (length === size) {
          yield Buffer.concat(pending, length)
          pending = []
          length = 0
        }
      }
    }
    if (length > 0) {
      yield Buffer.concat(pending, length)
    }
  }

  const acl = (): { ACL?: ObjectCannedACL } => core.model.acl != null ? { ACL: core.model.acl as ObjectCannedACL } : {}

  const upload = async (request: S3UploadRequest): Promise<S3UploadResult> => {
    const client = core.client()
    const base = {
      Bucket: core.model.bucket,
      Key: request.key,
      ContentType: request.contentType,
      ContentDisposition: request.disposition,
      ...(request.cacheControl != null ? { CacheControl: request.cacheControl } : {}),
      ...(request.metadata != null ? { Metadata: request.metadata } : {}),
      ...acl(),
    }
    const iterator = parts(request.stream, core.partSize)
    const first = await iterator.next()
    const firstPart = first.done === true ? Buffer.alloc(0) : first.value
    const second = first.done === true ? first : await iterator.next()

    if (second.done === true) {
      try {
        const result = await client.send(new PutObjectCommand({ ...base, Body: firstPart, ContentLength: firstPart.length }), { abortSignal: request.signal })
        return { bytes: firstPart.length, etag: result.ETag }
      } catch (error) {
        if (request.signal?.aborted === true) {
          throw request.signal.reason
        }
        log.error('S3 upload failed', error as Error)
        throw new S3TransferError('put')
      }
    }

    let uploadId: string | undefined
    try {
      const created = await client.send(new CreateMultipartUploadCommand(base), { abortSignal: request.signal })
      uploadId = created.UploadId
      const completed: CompletedPart[] = []
      const inFlight = new Set<Promise<void>>()
      let bytes = 0
      let number = 0

      const send = (body: Buffer): void => {
        const partNumber = ++number
        if (partNumber > MAX_PARTS) {
          throw new LimitError('s3-parts')
        }
        bytes += body.length
        const pending = client.send(new UploadPartCommand({
          Bucket: core.model.bucket, Key: request.key, UploadId: uploadId, PartNumber: partNumber, Body: body, ContentLength: body.length,
        }), { abortSignal: request.signal }).then(result => {
          completed.push({ ETag: result.ETag, PartNumber: partNumber })
        })
        const tracked = pending.finally(() => inFlight.delete(tracked))
        inFlight.add(tracked)
      }

      send(firstPart)
      send(second.value)
      for (;;) {
        while (inFlight.size >= core.concurrency) {
          await Promise.race(inFlight)
        }
        const next = await iterator.next()
        if (next.done === true) {
          break
        }
        send(next.value)
      }
      await Promise.all(inFlight)
      completed.sort((a, b) => (a.PartNumber ?? 0) - (b.PartNumber ?? 0))
      const result = await client.send(new CompleteMultipartUploadCommand({
        Bucket: core.model.bucket, Key: request.key, UploadId: uploadId, MultipartUpload: { Parts: completed },
      }), { abortSignal: request.signal })
      log.debug('Multipart upload completed', { parts: completed.length, bytes })

      return { bytes, etag: result.ETag }
    } catch (error) {
      if (uploadId != null) {
        await client.send(new AbortMultipartUploadCommand({ Bucket: core.model.bucket, Key: request.key, UploadId: uploadId }))
          .catch(abortError => log.warn('Multipart abort failed', abortError as Error))
      }
      await iterator.return(undefined).catch(() => undefined)
      if (request.signal?.aborted === true) {
        throw request.signal.reason
      }
      if (error instanceof LimitError || error instanceof S3TransferError) {
        throw error
      }
      log.error('S3 multipart upload failed', error as Error)
      throw new S3TransferError('multipart')
    }
  }

  return { upload }
}
