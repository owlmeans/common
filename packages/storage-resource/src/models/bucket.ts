import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3'
import type { BucketLocationConstraint, S3ClientConfig } from '@aws-sdk/client-s3'
import { FilePropertyError, StorageApiError } from '@owlmeans/storage-common'
import { DEFAULT_STORAGE_ACL, DEFAULT_STORAGE_REGION, UNCONSTRAINED_REGION } from './bucket/consts.js'
import { MISSING_BUCKET_CODES, OWNED_BUCKET_CODE, TAKEN_BUCKET_CODE } from './bucket/consts.local.js'
import type { StorageConfig } from '../types.js'
import type { StorageBucketModel, StorageClientOptions, StorageEnsureOutcome } from './bucket/types.js'
import type { S3Failure } from './bucket/types.local.js'

const trimSlashes = (url: string): string => url.replace(/\/+$/, '')

const filled = (value: string | undefined): value is string => typeof value === 'string' && value !== ''

/** The S3 code of a rejection: a service error's name, a network error's code. */
const codeOf = (error: unknown): string => {
  const failure = (error ?? {}) as S3Failure
  if (filled(failure.Code)) {
    return failure.Code
  }
  if (filled(failure.name) && failure.name !== 'Error') {
    return failure.name
  }

  return filled(failure.code) ? failure.code : 'error'
}

const isMissing = (error: unknown): boolean =>
  (error as S3Failure | undefined)?.$metadata?.httpStatusCode === 404 || MISSING_BUCKET_CODES.includes(codeOf(error))

/**
 * @throws {FilePropertyError} `storage-config` when the entry is missing, `storage-api-key` when
 * neither the key pair nor an `apiKey` of the `<keyId>:<secret>` shape is set, `storage-address`
 * when no bucket or endpoint can be read.
 */
export const makeStorageBucketModel = (config: StorageConfig): StorageBucketModel => {
  if (config == null) {
    throw new FilePropertyError('storage-config')
  }

  const credentials = (() => {
    if (filled(config.accessKeyId) && filled(config.secretAccessKey)) {
      return { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
    }
    const separator = typeof config.apiKey === 'string' ? config.apiKey.indexOf(':') : -1
    if (config.apiKey == null || separator < 1) {
      throw new FilePropertyError('storage-api-key')
    }
    return { accessKeyId: config.apiKey.slice(0, separator), secretAccessKey: config.apiKey.slice(separator + 1) }
  })()

  const [urlBucket, ...hostParts] = config.url != null && config.url !== '' ? config.url.split('.') : []
  const bucket = config.bucket ?? urlBucket
  const endpoint = trimSlashes(config.endpoint ?? (hostParts.length > 0 ? `https://${hostParts.join('.')}` : ''))
  if (bucket == null || bucket === '' || endpoint === '') {
    throw new FilePropertyError('storage-address')
  }

  const region = config.region ?? DEFAULT_STORAGE_REGION
  const forcePathStyle = config.forcePathStyle ?? false
  const acl = config.acl === false ? undefined : (config.acl ?? DEFAULT_STORAGE_ACL)
  const basePrefix = config.basePrefix ?? ''
  const zone = config.locationConstraint ?? region
  const locationConstraint = zone !== '' && zone !== UNCONSTRAINED_REGION ? zone : undefined
  const adminPath = config.adminPath?.replace(/^\/+|\/+$/g, '')
  const adminUrl = filled(adminPath) ? `${endpoint}/${adminPath}` : undefined

  const virtualHostBase = (): string => {
    const parsed = new URL(endpoint)
    return `${parsed.protocol}//${bucket}.${parsed.host}`
  }

  const publicBase = trimSlashes(
    config.publicUrl
    ?? (config.url != null && config.url !== '' ? `https://${config.url}`
      : forcePathStyle ? `${endpoint}/${bucket}` : virtualHostBase())
  )

  const keyOf = (prefix: string): string => basePrefix !== '' ? `${basePrefix}/${prefix}` : prefix.replace(/^\/+/, '')

  const urlOf = (prefix: string): string => `${publicBase}/${keyOf(prefix)}`

  const requestHandler = ((): S3ClientConfig['requestHandler'] => {
    const { connectMs, requestMs } = config.timeouts ?? {}
    if (connectMs == null && requestMs == null) {
      return undefined
    }
    return {
      ...(connectMs != null ? { connectionTimeout: connectMs } : {}),
      // Without the throw flag the SDK only warns once the request timeout passes.
      ...(requestMs != null ? { requestTimeout: requestMs, throwOnRequestTimeout: true } : {}),
    }
  })()

  const createClient = (options: StorageClientOptions = {}): S3Client => {
    const maxAttempts = options.maxAttempts ?? config.maxAttempts
    return new S3Client({
      region,
      endpoint,
      forcePathStyle,
      credentials,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      ...(maxAttempts != null ? { maxAttempts } : {}),
      ...(requestHandler != null ? { requestHandler } : {}),
    })
  }

  const withClient = async <T>(work: (client: S3Client) => Promise<T>): Promise<T> => {
    const client = createClient()
    try {
      return await work(client)
    } finally {
      client.destroy()
    }
  }

  const head = async (client: S3Client): Promise<boolean> => {
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }))
      return true
    } catch (error) {
      if (isMissing(error)) {
        return false
      }
      throw new StorageApiError(codeOf(error))
    }
  }

  const exists = async (): Promise<boolean> => await withClient(head)

  const ensure = async (): Promise<StorageEnsureOutcome> => await withClient(async client => {
    if (await head(client)) {
      return 'exists'
    }
    try {
      await client.send(new CreateBucketCommand({
        Bucket: bucket,
        ...(locationConstraint != null
          ? { CreateBucketConfiguration: { LocationConstraint: locationConstraint as BucketLocationConstraint } }
          : {}),
      }))
      return 'created'
    } catch (error) {
      const code = codeOf(error)
      if (code === OWNED_BUCKET_CODE || (code === TAKEN_BUCKET_CODE && await head(client).catch(() => false))) {
        return 'exists'
      }
      throw new StorageApiError(code)
    }
  })

  return {
    config, bucket, endpoint, region, forcePathStyle, basePrefix, acl, locationConstraint, adminUrl,
    keyOf, urlOf, createClient, exists, ensure,
  }
}
