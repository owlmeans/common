import { AppType, makeBasicContext } from '@owlmeans/context'
import { MAILER_SERVICE, makeConsoleMailerService } from '@owlmeans/mailer'
import type { ConsoleMailerService } from '@owlmeans/mailer'
import { config, makeServerContext } from '@owlmeans/server-context'
import { makeRedisResource } from '@owlmeans/redis-resource'
import type { RedisResource } from '@owlmeans/redis-resource'
import type { ResourceRecord } from '@owlmeans/resource'
import { appendRedis, DEFAULT_ALIAS } from '@owlmeans/redis'
import { gateHelper, randomNamespace } from '@owlmeans/test-integration'
import type { IntegrationGate, RedisEnv } from '@owlmeans/test-integration'
import type { OtpService } from '@owlmeans/auth-otp'
import { makeMemoryOtpChallengeStore, makeRedisOtpChallengeStore } from '../src/challenge.js'
import { makeMemoryThrottleService } from '../src/throttle.js'
import { makeOtpService } from '../src/service.js'
import { otpKeyHelper } from '../src/keys.js'
import {
  OTP_CHALLENGE_STORE, OTP_EMAIL_THROTTLE_RULES, OTP_RESOURCE, OTP_THROTTLE_SERVICE,
} from '../src/consts.js'
import type { OtpConfig, OtpContext } from '../src/types.js'

export const makeOtpTestContext = (opts: { throttle?: boolean, now?: () => number } = {}) => {
  const cfg: OtpConfig = {
    ready: false,
    service: 'server-auth-otp-tests',
    type: AppType.Backend,
    services: {},
    otp: {
      mailerAlias: MAILER_SERVICE,
      challengeStoreAlias: OTP_CHALLENGE_STORE,
      ...(opts.throttle === true ? {
        throttleAlias: OTP_THROTTLE_SERVICE,
        throttleRules: OTP_EMAIL_THROTTLE_RULES,
      } : {}),
    },
  }
  const context = makeBasicContext(cfg)
  const mailer = makeConsoleMailerService(MAILER_SERVICE)
  context.registerService(mailer)
  context.registerService(makeMemoryOtpChallengeStore(OTP_CHALLENGE_STORE, opts.now))
  if (opts.throttle === true) {
    context.registerService(makeMemoryThrottleService(OTP_THROTTLE_SERVICE, opts.now))
  }
  const otp = makeOtpService()
  context.registerService(otp)

  return { context, mailer, otp }
}

export const codeFrom = (text: string | undefined): string => {
  const match = text?.match(/\b(\d{6})\b/)
  if (match == null) throw new Error('OTP code missing from captured message')
  return match[1]
}

/** A six-digit code other than `code`. */
export const otherCode = (code: string): string => code === '123456' ? '654321' : '123456'

// --- Redis-backed challenge store (env-gated) ---------------------------------------------------

export const redisGate: IntegrationGate<RedisEnv> = gateHelper.redisGate()

/** Hook budget for a suite's teardown: a prefix walk over a shared store, through a port-forward. */
export const TEARDOWN_TIMEOUT = 60_000

export interface RedisOtpFixture {
  otp: OtpService
  mailer: ConsoleMailerService
  /** Remaining lifetime of an issuance's challenge record, in milliseconds. */
  pttl: (issuanceId: string) => Promise<number>
}

export interface RedisOtpSuite {
  boot: () => Promise<RedisOtpFixture>
  teardown: () => Promise<void>
}

/** One key prefix per spec file, dropped by that file's own `afterAll`. */
export const makeRedisOtpSuite = (label: string): RedisOtpSuite => {
  const prefix = randomNamespace(`${process.env.REDIS_TEST_KEY_PREFIX ?? 'omt'}_${label}`)
  const resources: Array<RedisResource<ResourceRecord>> = []

  const boot = async (): Promise<RedisOtpFixture> => {
    const url = new URL(redisGate.env.REDIS_URL as string)
    const cfg = config<OtpConfig>('server-auth-otp-redis-tests', {
      dbs: [{
        service: DEFAULT_ALIAS,
        alias: DEFAULT_ALIAS,
        host: url.hostname,
        port: url.port !== '' ? Number(url.port) : 6379,
        user: url.username !== '' ? url.username : undefined,
        secret: decodeURIComponent(url.password),
        schema: prefix,
      }],
      otp: { mailerAlias: MAILER_SERVICE, challengeStoreAlias: OTP_CHALLENGE_STORE },
    } as Partial<OtpConfig>)

    const context = makeServerContext(cfg) as OtpContext<OtpConfig>
    appendRedis(context)
    context.registerResource(makeRedisResource(OTP_RESOURCE) as never)
    const mailer = makeConsoleMailerService(MAILER_SERVICE)
    context.registerService(mailer)
    context.registerService(makeRedisOtpChallengeStore(OTP_CHALLENGE_STORE, OTP_RESOURCE))
    const otp = makeOtpService()
    context.registerService(otp)
    context.configure()
    await context.init()

    const resource = context.resource<RedisResource<ResourceRecord>>(OTP_RESOURCE)
    resources.push(resource)
    const pttl = async (issuanceId: string): Promise<number> =>
      await resource.db.client.pttl(resource.key(otpKeyHelper.otpChallengeKey(issuanceId)))

    return { otp, mailer, pttl }
  }

  const teardown = async (): Promise<void> => {
    if (redisGate.skip) return
    for (const resource of resources) {
      const client = resource.db?.client
      if (client == null) continue
      try {
        const keys: string[] = []
        let cursor = '0'
        do {
          const [next, batch] = await client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 10_000)
          cursor = next
          keys.push(...batch)
        } while (cursor !== '0')
        if (keys.length > 0) await client.del(keys)
      } catch {
        // The prefix is unique per run, so anything a lost connection leaves behind never collides.
      }
      await client.quit().catch(() => undefined)
    }
    resources.length = 0
  }

  return { boot, teardown }
}
