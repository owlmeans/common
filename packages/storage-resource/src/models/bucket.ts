import { S3Client } from '@aws-sdk/client-s3'
import { FilePropertyError } from '@owlmeans/storage-common'
import { DEFAULT_STORAGE_ACL, DEFAULT_STORAGE_REGION } from './bucket/consts.js'
import type { StorageConfig } from '../types.js'
import type { StorageBucketModel } from './bucket/types.js'

const trimSlashes = (url: string): string => url.replace(/\/+$/, '')

/**
 * @throws {FilePropertyError} `storage-config` when the entry is missing, `storage-api-key` when
 * the key has no `<keyId>:<secret>` shape, `storage-address` when no bucket or endpoint can be read.
 */
export const makeStorageBucketModel = (config: StorageConfig): StorageBucketModel => {
  if (config == null) {
    throw new FilePropertyError('storage-config')
  }

  const separator = typeof config.apiKey === 'string' ? config.apiKey.indexOf(':') : -1
  if (separator < 1) {
    throw new FilePropertyError('storage-api-key')
  }
  const credentials = {
    accessKeyId: config.apiKey.slice(0, separator),
    secretAccessKey: config.apiKey.slice(separator + 1),
  }

  const [urlBucket, ...hostParts] = config.url != null && config.url !== '' ? config.url.split('.') : []
  const bucket = config.bucket ?? urlBucket
  const endpoint = trimSlashes(config.endpoint ?? (hostParts.length > 0 ? `https://${hostParts.join('.')}` : ''))
  if (bucket == null || bucket === '' || endpoint === '') {
    throw new FilePropertyError('storage-address')
  }

  const region = config.region ?? DEFAULT_STORAGE_REGION
  const forcePathStyle = config.forcePathStyle ?? false
  const acl = config.acl === false ? undefined : (config.acl ?? DEFAULT_STORAGE_ACL)

  const virtualHostBase = (): string => {
    const parsed = new URL(endpoint)
    return `${parsed.protocol}//${bucket}.${parsed.host}`
  }

  const publicBase = trimSlashes(
    config.publicUrl
    ?? (config.url != null && config.url !== '' ? `https://${config.url}`
      : forcePathStyle ? `${endpoint}/${bucket}` : virtualHostBase())
  )

  const keyOf = (prefix: string): string => `${config.basePrefix}/${prefix}`

  const urlOf = (prefix: string): string => `${publicBase}/${keyOf(prefix)}`

  const createClient = (): S3Client => new S3Client({
    region,
    endpoint,
    forcePathStyle,
    credentials,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  })

  return {
    config, bucket, endpoint, region, forcePathStyle, basePrefix: config.basePrefix, acl,
    keyOf, urlOf, createClient,
  }
}
