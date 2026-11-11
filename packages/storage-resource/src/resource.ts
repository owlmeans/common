import { PutObjectCommand } from '@aws-sdk/client-s3'
import type { ObjectCannedACL } from '@aws-sdk/client-s3'
import { appendContextual } from '@owlmeans/context'
import { ResilientError } from '@owlmeans/error'
import type { FileVerdict } from '@owlmeans/file-inspector'
import { logger } from '@owlmeans/log'
import type { WriteOptions } from '@owlmeans/resource'
import { FilePropertyError, FileStreamError, StorageApiError } from '@owlmeans/storage-common'
import { DEFAULT_ALIAS, STORAGE_HEAD_BYTES } from './consts.js'
import { makeStorageBucketModel } from './models/bucket.js'
import type { StorageBucketModel } from './models/bucket/types.js'
import type { Config, Context, StorageConfig, StorageResource, StoredRecord } from './types.js'
import { bodyUtils } from './utils/body.js'
import { verifyUtils } from './utils/verify.js'

const log = logger('storage-resource')

export const createStorageResource = (alias: string = DEFAULT_ALIAS, configKey?: string): StorageResource => {
  const entryKey = configKey ?? alias
  let ensured = false
  let ensuring: Promise<void> | undefined

  const entryOf = (): StorageConfig => (resource.assertCtx() as Context).cfg.storageBuckets?.[entryKey]

  /** An `ensure: true` bucket is ensured until one attempt succeeds, one attempt at a time; a failure is logged, never thrown. */
  const ensureBucket = async (bucket: StorageBucketModel): Promise<void> => {
    if (ensured || bucket.config.ensure !== true) {
      return
    }
    ensuring ??= (async () => {
      try {
        const outcome = await bucket.ensure()
        ensured = true
        const data = { entry: entryKey, bucket: bucket.bucket, outcome }
        if (outcome === 'created') {
          log.info('Storage bucket created', data, { event: 'storage-resource.bucket-created' })
        } else {
          log.debug('Storage bucket exists', data)
        }
      } catch (error) {
        log.warn('Storage bucket not ensured', { entry: entryKey, bucket: bucket.bucket, error }, { event: 'storage-resource.ensure-failed' })
      } finally {
        ensuring = undefined
      }
    })()
    await ensuring
  }

  const resource = appendContextual<StorageResource>(alias, {
    init: async () => {
      const entry = entryOf()
      if (entry?.ensure !== true) {
        return
      }
      try {
        await ensureBucket(makeStorageBucketModel(entry))
      } catch (error) {
        log.warn('Storage bucket entry unreadable', { entry: entryKey, error }, { event: 'storage-resource.ensure-failed' })
      }
    },

    /** A bucket object never expires on its own, so `opts.ttl` has nothing to act on here. */
    create: async (record: Partial<StoredRecord>, _opts?: WriteOptions) => {
      if (record.stream == null) {
        throw new FileStreamError('no')
      }
      if (record.size == null) {
        throw new FilePropertyError('size')
      }
      const size = record.size
      const bucket = makeStorageBucketModel(entryOf())

      const peeked = await bodyUtils.peek(record.stream, STORAGE_HEAD_BYTES)
      let verdict: FileVerdict
      try {
        verdict = await verifyUtils.verify(peeked.head, { name: record.name, mime: record.type, size, complete: peeked.ended })
      } catch (error) {
        bodyUtils.discard(peeked.stream)
        throw error
      }

      await ensureBucket(bucket)

      const controller = new AbortController()
      const body = bodyUtils.measure(peeked.stream, size, error => { controller.abort(error) })
      // A streamed body cannot be replayed, so the upload makes exactly one attempt.
      const client = bucket.createClient({ maxAttempts: 1 })
      try {
        const result = await client.send(new PutObjectCommand({
          ...(bucket.acl != null ? { ACL: bucket.acl as ObjectCannedACL } : {}),
          Bucket: bucket.bucket,
          Body: body.stream,
          Key: bucket.keyOf(record.prefix as string),
          ContentLength: size,
          // Scripted svg or html is never served inline; an <img> still renders it.
          ContentDisposition: verdict.details.active === true ? 'attachment' : 'inline',
          ContentType: record.type ?? verdict.detected?.mime,
        }), { abortSignal: controller.signal })

        if (result.$metadata.httpStatusCode !== 200) {
          throw new StorageApiError('code')
        }

        record.url = bucket.urlOf(record.prefix as string)
        delete record.stream
      } catch (e) {
        bodyUtils.discard(body.stream)
        const missed = body.violation()
        if (missed != null) {
          log.warn('Storage upload body missed its declared size', { size, bytes: body.bytes(), missed })
          throw new StorageApiError(`body-${missed}`)
        }
        if (e instanceof ResilientError) {
          throw e
        }
        log.error('Storage upload failed', e)
        throw new StorageApiError()
      } finally {
        client.destroy()
      }

      return record as StoredRecord
    }
  })

  return resource
}

export const appendStorageResource = <C extends Config, T extends Context<C>>(
  ctx: T, alias: string = DEFAULT_ALIAS, configKey?: string
): T => {
  const resource = createStorageResource(alias, configKey)

  ctx.registerResource(resource)

  return ctx
}
