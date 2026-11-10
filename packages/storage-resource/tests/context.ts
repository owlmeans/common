import { DeleteObjectCommand } from '@aws-sdk/client-s3'
import { config, makeServerContext } from '@owlmeans/server-context'
import { gateHelper } from '@owlmeans/test-integration'
import type { IntegrationGate, S3Env } from '@owlmeans/test-integration'
import { appendStorageResource, makeStorageBucketModel } from '../src/index.js'
import type { Config, Context, StorageConfig, StorageResource } from '../src/index.js'

/** S3 gate. Empty variables mean the upload specs print a skip — never a failure. */
export const s3: IntegrationGate<S3Env> = gateHelper.s3Gate()

export const TEST_ALIAS = 'storage-tests'

/** The test bucket as a storage entry: explicit endpoint, path-style for anything but AWS, no ACL. */
export const bucketConfig = (basePrefix: string): StorageConfig => {
  const endpoint = s3.env.S3_ENDPOINT as string
  return {
    endpoint,
    bucket: s3.env.S3_TEST_BUCKET as string,
    region: s3.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: !/\.amazonaws\.com/.test(endpoint),
    apiKey: `${s3.env.S3_KEY as string}:${s3.env.S3_SECRET as string}`,
    basePrefix,
    acl: false,
  }
}

export interface Booted {
  context: Context
  storage: StorageResource
}

/** Real server context and resource registration — the path a server app takes. */
export const boot = async (basePrefix: string): Promise<Booted> => {
  const cfg = config('storage-resource-tests') as Config
  cfg.storageBuckets = { [TEST_ALIAS]: bucketConfig(basePrefix) }

  const context = makeServerContext(cfg) as Context
  appendStorageResource(context, TEST_ALIAS)

  context.configure()
  await context.init()

  return { context, storage: context.resource<StorageResource>(TEST_ALIAS) }
}

/** Removes the objects a spec uploaded. */
export const removeObjects = async (basePrefix: string, prefixes: string[]): Promise<void> => {
  const bucket = makeStorageBucketModel(bucketConfig(basePrefix))
  const client = bucket.createClient()
  try {
    for (const prefix of prefixes) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket.bucket, Key: bucket.keyOf(prefix) }))
    }
  } finally {
    client.destroy()
  }
}
