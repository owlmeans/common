import { envHelper } from '@owlmeans/test'
import { reachabilityUtils } from './reachability.js'
import type { Reachable } from './types.local.js'
import type { IntegrationGate, KubeEnv, MongoEnv, PostgresEnv, RedisEnv, S3Env, SmtpEnv } from './types.js'
import type { GateHelper } from './gates/types.js'

export const createGateHelper = (): GateHelper => {
  const collect = <E>(keys: (keyof E & string)[]): Partial<E> => {
    const env: Record<string, string> = {}
    for (const k of keys) {
      if (envHelper.hasEnv(k)) env[k] = process.env[k] as string
    }
    return env as Partial<E>
  }

  const toIntegrationGate = <E>(
    required: (keyof E & string)[],
    optional: (keyof E & string)[] = [],
    reachable?: Reachable<E>
  ): IntegrationGate<E> => {
    const gate = envHelper.requireEnv(required)
    const env = collect<E>([...required, ...optional])
    if (!('ok' in gate)) return { skip: true, reason: gate.reason, env }
    if (reachable != null) {
      const reason = reachabilityUtils.unreachableReason(reachable.key, process.env[reachable.key] as string, reachable.defaultPort)
      if (reason != null) return { skip: true, reason, env }
    }
    return { skip: false, env }
  }

  const mongoGate = (): IntegrationGate<MongoEnv> =>
    toIntegrationGate<MongoEnv>(['MONGO_URL'], ['MONGO_TEST_DB_PREFIX'], { key: 'MONGO_URL', defaultPort: 27017 })

  const redisGate = (): IntegrationGate<RedisEnv> =>
    toIntegrationGate<RedisEnv>(['REDIS_URL'], ['REDIS_TEST_KEY_PREFIX'], { key: 'REDIS_URL', defaultPort: 6379 })

  const s3Gate = (): IntegrationGate<S3Env> =>
    toIntegrationGate<S3Env>(
      ['S3_ENDPOINT', 'S3_KEY', 'S3_SECRET', 'S3_TEST_BUCKET'],
      ['S3_REGION']
    )

  const kubeGate = (): IntegrationGate<KubeEnv> =>
    toIntegrationGate<KubeEnv>(['KUBE_CONFIG', 'KUBE_TEST_OK'])

  const postgresGate = (): IntegrationGate<PostgresEnv> =>
    toIntegrationGate<PostgresEnv>(['POSTGRES_URL'], ['POSTGRES_TEST_DB_PREFIX'], { key: 'POSTGRES_URL', defaultPort: 5432 })

  const smtpGate = (): IntegrationGate<SmtpEnv> =>
    toIntegrationGate<SmtpEnv>(
      ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM', 'SMTP_TEST_TO'],
      ['SMTP_PORT', 'SMTP_SECURE']
    )

  return { mongoGate, redisGate, s3Gate, kubeGate, postgresGate, smtpGate }
}

export const gateHelper = createGateHelper()

/** @deprecated compat:factory-refactor — use `gateHelper.mongoGate()` */
export const mongoGate = (): IntegrationGate<MongoEnv> => gateHelper.mongoGate()

/** @deprecated compat:factory-refactor — use `gateHelper.redisGate()` */
export const redisGate = (): IntegrationGate<RedisEnv> => gateHelper.redisGate()

/** @deprecated compat:factory-refactor — use `gateHelper.postgresGate()` */
export const postgresGate = (): IntegrationGate<PostgresEnv> => gateHelper.postgresGate()

/** @deprecated compat:factory-refactor — use `gateHelper.smtpGate()` */
export const smtpGate = (): IntegrationGate<SmtpEnv> => gateHelper.smtpGate()
