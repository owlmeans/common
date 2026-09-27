import { hasEnv, requireEnv } from '@owlmeans/test'
import { unreachableReason } from './reachability.js'

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

/**
 * A connection-string variable whose server must answer a TCP connect for the gate to open.
 *
 * Only for a service a developer reaches through a local address that can go away — a
 * port-forward, a container. A populated variable pointing at nothing then closes the gate with
 * a printed reason instead of failing every suite behind it on a refused connection.
 */
interface Reachable<E> {
  key: keyof E & string
  defaultPort: number
}

const toIntegrationGate = <E>(
  required: (keyof E & string)[],
  optional: (keyof E & string)[] = [],
  reachable?: Reachable<E>
): IntegrationGate<E> => {
  const gate = requireEnv(required)
  const env = collect<E>([...required, ...optional])
  if (!('ok' in gate)) return { skip: true, reason: gate.reason, env }
  if (reachable != null) {
    const reason = unreachableReason(reachable.key, process.env[reachable.key] as string, reachable.defaultPort)
    if (reason != null) return { skip: true, reason, env }
  }
  return { skip: false, env }
}

export interface MongoEnv {
  MONGO_URL: string
  MONGO_TEST_DB_PREFIX: string
}

export const mongoGate = (): IntegrationGate<MongoEnv> =>
  toIntegrationGate<MongoEnv>(['MONGO_URL'], ['MONGO_TEST_DB_PREFIX'], { key: 'MONGO_URL', defaultPort: 27017 })

export interface RedisEnv {
  REDIS_URL: string
  REDIS_TEST_KEY_PREFIX: string
}

export const redisGate = (): IntegrationGate<RedisEnv> =>
  toIntegrationGate<RedisEnv>(['REDIS_URL'], ['REDIS_TEST_KEY_PREFIX'], { key: 'REDIS_URL', defaultPort: 6379 })

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
  toIntegrationGate<PostgresEnv>(['POSTGRES_URL'], ['POSTGRES_TEST_DB_PREFIX'], { key: 'POSTGRES_URL', defaultPort: 5432 })

export interface SmtpEnv {
  SMTP_HOST: string
  SMTP_PORT: string
  SMTP_SECURE: string
  SMTP_USER: string
  SMTP_PASSWORD: string
  SMTP_FROM: string
  /** Mailbox the specs deliver to. Required — these tests send real mail. */
  SMTP_TEST_TO: string
}

export const smtpGate = (): IntegrationGate<SmtpEnv> =>
  toIntegrationGate<SmtpEnv>(
    ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM', 'SMTP_TEST_TO'],
    ['SMTP_PORT', 'SMTP_SECURE']
  )
