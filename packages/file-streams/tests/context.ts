import { spawnSync } from 'node:child_process'
import { DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { config, makeServerContext } from '@owlmeans/server-context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import { makeGates } from '@owlmeans/test'
import { gateHelper } from '@owlmeans/test-integration'
import type { IntegrationGate, S3Env } from '@owlmeans/test-integration'
import type { StorageConfig } from '@owlmeans/storage-resource'
import { appendFileStreamsService, createHttpClient, FILE_STREAMS_SERVICE } from '../src/index.js'
import type {
  FileStreamsConfig, FileStreamsService, FileStreamsServiceOptions, HttpClient, HttpClientOptions, S3Bucket,
} from '../src/index.js'

/** S3 gate: empty `S3_*` variables print a skip, never a failure. */
export const s3: IntegrationGate<S3Env> = gateHelper.s3Gate()

/** Live-internet gates: opt-in only. */
export const live = makeGates({
  internet: ['FILE_STREAMS_LIVE'],
  drive: ['FILE_STREAMS_LIVE', 'FILE_STREAMS_LIVE_DRIVE_URL'],
})

/** Stand-ins listen on loopback, which the default policy refuses. */
export const LOCAL_NETWORK = { allowCidrs: ['127.0.0.1/32'] }

export const localClient = (options: HttpClientOptions = {}): HttpClient => createHttpClient({
  ...options,
  network: options.network ?? LOCAL_NETWORK,
  resolvers: options.resolvers ?? [],
  timeouts: { connectMs: 3_000, headersMs: 3_000, idleMs: 3_000, ...options.timeouts },
})

export const tempDir = async (label: string): Promise<string> => await mkdtemp(join(tmpdir(), `owlmeans-fs-${label}-`))

export const removeDir = async (dir: string): Promise<void> => { await rm(dir, { recursive: true, force: true }) }

export interface TlsMaterial {
  key: string
  cert: string
}

/** A one-day self-signed certificate for 127.0.0.1, or `undefined` when openssl is missing. */
export const tlsMaterial = async (): Promise<TlsMaterial | undefined> => {
  const dir = await tempDir('tls')
  try {
    const result = spawnSync('openssl', [
      'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-days', '1', '-subj', '/CN=localhost',
      '-addext', 'subjectAltName=IP:127.0.0.1,DNS:localhost', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem'),
    ], { stdio: 'ignore' })
    if (result.status !== 0) {
      return undefined
    }
    return { key: await readFile(join(dir, 'key.pem'), 'utf8'), cert: await readFile(join(dir, 'cert.pem'), 'utf8') }
  } catch {
    return undefined
  } finally {
    await removeDir(dir)
  }
}

/** The S3 test bucket as a storage entry: explicit endpoint, path-style for anything but AWS, no ACL. */
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

/** Deletes every object under the bucket's random base prefix — a spec's own cleanup, outside the API under test. */
export const purgeBasePrefix = async (bucket: S3Bucket): Promise<void> => {
  const client = bucket.model.createClient()
  try {
    for (;;) {
      const page = await client.send(new ListObjectsV2Command({ Bucket: bucket.model.bucket, Prefix: `${bucket.model.basePrefix}/` }))
      const keys = (page.Contents ?? []).map(object => ({ Key: object.Key as string }))
      if (keys.length === 0) {
        return
      }
      await client.send(new DeleteObjectsCommand({ Bucket: bucket.model.bucket, Delete: { Objects: keys, Quiet: true } }))
    }
  } finally {
    client.destroy()
  }
}

export interface TestConfig extends ServerConfig {
  fileStreams?: FileStreamsConfig
  storageBuckets?: { [key: string]: StorageConfig }
}

export interface Booted {
  context: ServerContext<TestConfig>
  files: FileStreamsService
}

/** A real server context with the service registered — the path a server app takes. */
export const boot = async (setup: Partial<TestConfig> = {}, options?: FileStreamsServiceOptions): Promise<Booted> => {
  const cfg = { ...config('file-streams-tests'), ...setup } as TestConfig
  const context = makeServerContext(cfg) as ServerContext<TestConfig>
  appendFileStreamsService(context, FILE_STREAMS_SERVICE, options)
  context.configure()
  await context.init()

  return { context, files: context.service<FileStreamsService>(FILE_STREAMS_SERVICE) }
}
