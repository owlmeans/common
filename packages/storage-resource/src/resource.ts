import { appendContextual } from '@owlmeans/context'
import { DEFAULT_ALIAS } from './consts.js'
import type { Config, Context, StorageResource, StoredRecord } from './types.js'
import type { WriteOptions } from '@owlmeans/resource'
import { FilePropertyError, FileStreamError, FileTypeError, StorageApiError } from '@owlmeans/storage-common'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import type { ObjectCannedACL } from '@aws-sdk/client-s3'
import { makeStorageBucketModel } from './models/bucket.js'
import { ResilientError } from '@owlmeans/error'
import { fileTypeFromBuffer } from 'file-type'
import { logger } from '@owlmeans/log'

const log = logger('storage-resource')

export const createStorageResource = (alias: string = DEFAULT_ALIAS, configKey?: string): StorageResource => {
  configKey ??= alias

  const resource = appendContextual<StorageResource>(alias, {
    /** A bucket object never expires on its own, so `opts.ttl` has nothing to act on here. */
    create: async (record: Partial<StoredRecord>, _opts?: WriteOptions) => {
      if (record.stream == null) {
        throw new FileStreamError('no')
      }
      if (record.size == null) {
        throw new FilePropertyError('size')
      }


      // @TODO Do something here - it would be fixed if we do not convert
      // multipart into buffer by means integrated into fastify
      const buffers = await record.stream.toArray()
      const buffer = buffers[0]
      const type = await fileTypeFromBuffer(buffer)

      if (type?.mime !== record.type) {
        throw new FileTypeError('mime-mismatch')
      }

      const context = resource.assertCtx() as Context
      const bucket = makeStorageBucketModel(context.cfg.storageBuckets[configKey])
      const client = bucket.createClient()

      // @TODO Make the upload multipart
      try {
        const result = await client.send(new PutObjectCommand({
          ...(bucket.acl != null ? { ACL: bucket.acl as ObjectCannedACL } : {}),
          Bucket: bucket.bucket,
          Body: Buffer.concat(buffers),
          Key: bucket.keyOf(record.prefix as string),
          ContentLength: record.size,
          ContentDisposition: 'inline',
          ContentType: record.type,
        }))

        if (result.$metadata.httpStatusCode !== 200) {
          throw new StorageApiError('code')
        }

        record.url = bucket.urlOf(record.prefix as string)
        delete record.stream
      } catch (e) {
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
