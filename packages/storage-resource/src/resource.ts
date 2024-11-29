import { appendContextual } from '@owlmeans/context'
import { DEFAULT_ALIAS } from './consts.js'
import type { Config, Context, StorageResource, StoredRecord } from './types.js'
import type { GetterOptions } from '@owlmeans/resource'
import { FilePropertyError, FileStreamError, FileTypeError, StorageApiError } from './errors.js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { ResilientError } from '@owlmeans/error'
import { fileTypeFromBuffer } from 'file-type'

type Getter = string | GetterOptions

export const createStorageResource = (alias: string = DEFAULT_ALIAS, configKey?: string) => {
  configKey ??= alias

  const resource = appendContextual<StorageResource>(alias, {
    create: async <Type extends StoredRecord>(record: Partial<Type>, _opts?: Getter) => {
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

      const config = context.cfg.storageBuckets[configKey]
      const [keyId, keySecret] = config.apiKey.split(':')
      const [bucket, ...parts] = config.url.split('.')

      // @TODO Abstract it some way and make the upload multipart
      try {
        const client = new S3Client({
          region: 'eu-central-1',
          endpoint: `https://${parts.join('.')}`,
          credentials: {
            accessKeyId: keyId,
            secretAccessKey: keySecret,
          }
        })

        const result = await client.send(new PutObjectCommand({
          ACL: 'public-read',
          Bucket: bucket,
          Body: Buffer.concat(buffers),
          Key: `${config.basePrefix}/${record.prefix}`,
          ContentLength: record.size,
          ContentDisposition: 'inline',
          ContentType: record.type,
        }))

        if (result.$metadata.httpStatusCode !== 200) {
          throw new StorageApiError('code')
        }

        record.url = `https://${config.url}/${config.basePrefix}/${record.prefix}`
        delete record.stream

        client.destroy()
      } catch (e) {
        if (e instanceof ResilientError) {
          throw e
        }
        console.error(e)
        throw new StorageApiError()
      }

      return record as Type
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
