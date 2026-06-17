import { hasEnv, requireEnv } from '@owlmeans/test'

export interface IntegrationGate<E> {
  skip: boolean
  reason?: string
  env: Partial<E>
}

const collect = <E>(keys: (keyof E & string)[]): Partial<E> => {
  const env: Record<string, string> = {}
  for (const k of keys) {
    if (hasEnv(k)) env[k] = process.env[k] as string
  }
  return env as Partial<E>
}

const toIntegrationGate = <E>(
  required: (keyof E & string)[],
  optional: (keyof E & string)[] = []
): IntegrationGate<E> => {
  const gate = requireEnv(required)
  const env = collect<E>([...required, ...optional])
  if ('ok' in gate) return { skip: false, env }
  return { skip: true, reason: gate.reason, env }
}

export interface MongoEnv {
  MONGO_URL: string
  MONGO_TEST_DB_PREFIX: string
}

export const mongoGate = (): IntegrationGate<MongoEnv> =>
  toIntegrationGate<MongoEnv>(['MONGO_URL'], ['MONGO_TEST_DB_PREFIX'])

export interface RedisEnv {
  REDIS_URL: string
  REDIS_TEST_KEY_PREFIX: string
}

export const redisGate = (): IntegrationGate<RedisEnv> =>
  toIntegrationGate<RedisEnv>(['REDIS_URL'], ['REDIS_TEST_KEY_PREFIX'])

export interface S3Env {
  S3_ENDPOINT: string
  S3_KEY: string
  S3_SECRET: string
  S3_TEST_BUCKET: string
  S3_REGION: string
}

export const s3Gate = (): IntegrationGate<S3Env> =>
  toIntegrationGate<S3Env>(
    ['S3_ENDPOINT', 'S3_KEY', 'S3_SECRET', 'S3_TEST_BUCKET'],
    ['S3_REGION']
  )

export interface KubeEnv {
  KUBE_CONFIG: string
  KUBE_TEST_OK: string
}

export const kubeGate = (): IntegrationGate<KubeEnv> =>
  toIntegrationGate<KubeEnv>(['KUBE_CONFIG', 'KUBE_TEST_OK'])

export interface PostgresEnv {
  POSTGRES_URL: string
  POSTGRES_TEST_DB_PREFIX: string
}

export const postgresGate = (): IntegrationGate<PostgresEnv> =>
  toIntegrationGate<PostgresEnv>(['POSTGRES_URL'], ['POSTGRES_TEST_DB_PREFIX'])
