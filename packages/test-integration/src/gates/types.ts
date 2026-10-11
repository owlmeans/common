import type { IntegrationGate, KubeEnv, MongoEnv, PostgresEnv, RedisEnv, S3Env, SmtpEnv } from '../types.js'

/**
 * The env gates of the integration suites: each reads the variables documented in `.env.example`
 * and answers `{ skip, reason?, env }`, so a `tests/context.ts` decides whether to register the
 * real service and a spec self-skips when it is missing.
 */
export interface GateHelper {
  /** `MONGO_URL` set AND a host in it accepting a TCP connect; `MONGO_TEST_DB_PREFIX` optional. */
  mongoGate: () => IntegrationGate<MongoEnv>
  /** `REDIS_URL` set AND a host in it accepting a TCP connect; `REDIS_TEST_KEY_PREFIX` optional. */
  redisGate: () => IntegrationGate<RedisEnv>
  s3Gate: () => IntegrationGate<S3Env>
  kubeGate: () => IntegrationGate<KubeEnv>
  /** `POSTGRES_URL` set AND a host in it accepting a TCP connect; `POSTGRES_TEST_DB_PREFIX` optional. */
  postgresGate: () => IntegrationGate<PostgresEnv>
  smtpGate: () => IntegrationGate<SmtpEnv>
}
