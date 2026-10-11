export interface IntegrationGate<E> {
  skip: boolean
  reason?: string
  env: Partial<E>
}

export interface MongoEnv {
  MONGO_URL: string
  MONGO_TEST_DB_PREFIX: string
}

export interface RedisEnv {
  REDIS_URL: string
  REDIS_TEST_KEY_PREFIX: string
}

export interface S3Env {
  S3_ENDPOINT: string
  S3_KEY: string
  S3_SECRET: string
  S3_TEST_BUCKET: string
  S3_REGION: string
}

export interface KubeEnv {
  KUBE_CONFIG: string
  KUBE_TEST_OK: string
}

export interface PostgresEnv {
  POSTGRES_URL: string
  POSTGRES_TEST_DB_PREFIX: string
}

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

export interface ProbeTarget {
  host: string
  port: number
}
