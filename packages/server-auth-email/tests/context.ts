import { AuthroizationType, AuthRole } from '@owlmeans/auth'
import type { Auth, AuthCredentials } from '@owlmeans/auth'
import { GUARD_ED25519, signBasicEd25519Request } from '@owlmeans/auth-common'
import type { TrustedRecord } from '@owlmeans/auth-common'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import type { KeyPairModel } from '@owlmeans/basic-keys'
import { CAPTCHA_VERIFIER } from '@owlmeans/captcha'
import type { CaptchaRequest, CaptchaResponse, CaptchaVerifierService } from '@owlmeans/captcha'
import { createService } from '@owlmeans/context'
import type { AbstractRequest, GuardService } from '@owlmeans/entrypoint'
import { MAILER_SERVICE, makeConsoleMailerService } from '@owlmeans/mailer'
import type { ConsoleMailerService } from '@owlmeans/mailer'
import type { Resource } from '@owlmeans/resource'
import { AUTH_CACHE, AUTH_SRV_KEY, AUTHEN_TIMEFRAME } from '@owlmeans/server-auth'
import {
  AUTH_IDENTITY_ACCOUNT, AUTH_IDENTITY_CREDENTIALS, AUTH_IDENTITY_ORG_ENTITY, AUTH_IDENTITY_PROFILE,
  appendAuthIdentityResources, makeEntityResolverService, makeIdentityEventsService, makeIdentityLinkingService,
} from '@owlmeans/server-auth-identity'
import type { IdentityAccount } from '@owlmeans/server-auth-identity'
import {
  makeMemoryOtpChallengeStore, makeMemoryThrottleService, makeOtpService, makeRedisThrottleService, OTP_CHALLENGE_STORE,
  OTP_THROTTLE_SERVICE,
} from '@owlmeans/server-auth-otp'
import { config, makeServerContext } from '@owlmeans/server-context'
import { appendMongo, DEFAULT_ALIAS as MONGO_ALIAS } from '@owlmeans/mongo'
import type { MongoDbService } from '@owlmeans/mongo-resource'
import { appendRedis, DEFAULT_ALIAS as REDIS_ALIAS } from '@owlmeans/redis'
import { makeRedisResource } from '@owlmeans/redis-resource'
import type { RedisResource } from '@owlmeans/redis-resource'
import type { ResourceRecord } from '@owlmeans/resource'
import { gateHelper, randomNamespace } from '@owlmeans/test-integration'
import type { IntegrationGate, MongoEnv, RedisEnv } from '@owlmeans/test-integration'
import { MongoClient } from 'mongodb'
import { appendEmailAuthResources } from '../src/resources.js'
import { createStaticResource } from '@owlmeans/static-resource'
import { makeFixtureKeyPair } from '@owlmeans/test-auth'
import { EMAIL_AUTH_DEVICE_RESOURCE, EMAIL_AUTH_PASSWORD_RESOURCE } from '../src/consts.js'
import { appendEmailAuth } from '../src/service.js'
import type {
  EmailAuthConfig, EmailAuthContext, EmailAuthServerOptions, EmailAuthService, EmailDeviceRecord,
  EmailPasswordRecord,
} from '../src/types.js'
import { EMAIL_AUTH_SERVICE } from '@owlmeans/auth-email'

/** The deployment's own app key of the identity rows these specs write. */
export const TEST_APP = 'email-auth-tests'
/** The `TRUSTED` record allowed to call the developer routes, and one that is not. */
export const TECH_SIGNER = 'email-tech-signer'
export const OTHER_SIGNER = 'email-other-signer'
/** A browser's device id: 22 base64url characters. */
export const DEVICE_A = 'AAAAAAAAAAAAAAAAAAAAAA'
export const DEVICE_B = 'BBBBBBBBBBBBBBBBBBBBBB'
export const DEVICE_C = 'CCCCCCCCCCCCCCCCCCCCCC'

export interface FixtureOptions {
  /** Passwords on (default) or off. */
  password?: boolean
  /** The strict captcha, over the stand-in verifier below. */
  captcha?: boolean
  /** The developer routes; default on. */
  tech?: boolean | (() => boolean)
  /** The memory throttle service, on a controllable clock. */
  throttle?: boolean
  ipOf?: EmailAuthServerOptions['ipOf']
  devices?: EmailAuthServerOptions['devices']
  /** The deployment's new-device PIN; absent = the service default (on). */
  devicePin?: boolean
}

export interface EmailAuthFixture {
  context: EmailAuthContext
  service: EmailAuthService
  mailer: ConsoleMailerService
  /** What the stand-in captcha verifier was asked. */
  asked: CaptchaRequest[]
  /** The throttle clock, in ms; move it to open a window. */
  clock: { now: number }
  /** The auth service's key pair (it signs challenges, tokens and waivers). */
  authKey: KeyPairModel
  /** The code of the n-th captured mail (default: the last one). */
  codeOf: (index?: number) => string
  /** A guest request. */
  guest: (patch?: Partial<AbstractRequest>) => AbstractRequest
  /** A request of an account's session. */
  session: (accountId: string, patch?: Partial<AbstractRequest>) => AbstractRequest
  /** A request signed by a `TRUSTED` record and authenticated by the real `GUARD_ED25519`. */
  signed: (signer: string, body?: Record<string, unknown>) => Promise<AbstractRequest>
  /** An envelope of any `type`, signed by the auth service the way the auth manager signs a challenge. */
  challengeOf: (type: string, message: string) => Promise<string>
  /** Sign in by PIN; the account id, the token and the offer. */
  pinSignIn: (email: string, device?: string) => Promise<{ accountId: string, token: string, offer?: string }>
  accountOf: (email: string) => Promise<IdentityAccount | null>
  passwords: () => Resource<EmailPasswordRecord>
  devices: () => Resource<EmailDeviceRecord>
}

let store = 0

/** Where the identity store and the e-mail resources live: memory by default, Mongo in the gated suite. */
export interface FixtureStorage {
  cfg?: Partial<EmailAuthConfig>
  register: (context: EmailAuthContext, key: string) => void
}

/**
 * The identity store's own services over in-memory `Resource`s (`@owlmeans/static-resource`) under
 * the identity and e-mail aliases — the resource contract without a database.
 */
export const memoryStorage: FixtureStorage = {
  register: (context, key) => {
    for (const alias of [AUTH_IDENTITY_ACCOUNT, AUTH_IDENTITY_PROFILE, AUTH_IDENTITY_CREDENTIALS, AUTH_IDENTITY_ORG_ENTITY]) {
      context.registerResource(createStaticResource(alias, `${key}-${alias}`))
    }
    context.registerService(makeIdentityLinkingService({ service: TEST_APP }))
    context.registerService(makeEntityResolverService())
    context.registerService(makeIdentityEventsService())
    context.registerResource(createStaticResource(EMAIL_AUTH_PASSWORD_RESOURCE, `${key}-password`))
    context.registerResource(createStaticResource(EMAIL_AUTH_DEVICE_RESOURCE, `${key}-device`))
  },
}

/** The stand-in verifier answers token `ok:<action>` as a good v3 answer for that action, anything else as refused. */
const verifierAnswer = (token: string): CaptchaResponse => token.startsWith('ok:')
  ? { success: true, challenge_ts: '2026-11-01T10:00:00Z', hostname: 'app.example.org', score: 0.9, action: token.slice(3) }
  : { success: false, challenge_ts: '', hostname: '', 'error-codes': ['invalid-input-response'] }

const recordOf = (key: KeyPairModel, name: string): TrustedRecord => ({
  id: key.exportAddress(), name, credential: key.exportPublic(), secret: key.export(), scopes: ['*'],
})

/**
 * A real server context — `makeServerContext` with the trusted records in `cfg.trusted`, its own
 * `GUARD_ED25519`, the identity store's services, the OTP service over the memory challenge store,
 * the console mailer and a stand-in captcha verifier (no network) — over `storage`. Each fixture
 * has its own stores.
 */
export const makeEmailAuthFixture = async (
  opts: FixtureOptions = {}, storage: FixtureStorage = memoryStorage
): Promise<EmailAuthFixture> => {
  const key = `server-auth-email-tests-${++store}`
  const authKey = makeFixtureKeyPair('server-auth-email:auth-service')
  const techKey = makeFixtureKeyPair('server-auth-email:tech')
  const otherKey = makeFixtureKeyPair('server-auth-email:other')
  const clock = { now: 1_800_000_000_000 }

  const cfg = config<EmailAuthConfig>('server-auth-email-tests', {
    trusted: [recordOf(authKey, AUTH_SRV_KEY), recordOf(techKey, TECH_SIGNER), recordOf(otherKey, OTHER_SIGNER)],
    otp: { mailerAlias: MAILER_SERVICE, challengeStoreAlias: OTP_CHALLENGE_STORE },
    ...storage.cfg,
  } as Partial<EmailAuthConfig>)
  const context = makeServerContext(cfg) as EmailAuthContext

  context.registerResource(createStaticResource(AUTH_CACHE, `${key}-cache`))
  storage.register(context, key)

  const mailer = makeConsoleMailerService(MAILER_SERVICE)
  context.registerService(mailer)
  context.registerService(makeMemoryOtpChallengeStore(OTP_CHALLENGE_STORE))
  context.registerService(makeOtpService())
  if (opts.throttle === true) {
    context.registerService(makeMemoryThrottleService(OTP_THROTTLE_SERVICE, () => clock.now))
  }

  const asked: CaptchaRequest[] = []
  context.registerService(createService<CaptchaVerifierService>(CAPTCHA_VERIFIER, {
    verify: async request => { asked.push(request); return verifierAnswer(request.response) },
  }))

  appendEmailAuth(context, {
    password: opts.password ?? true,
    captcha: opts.captcha === true
      ? { siteKey: 'site-key', secret: 'secret', hostnames: 'example.org', minScore: 0.5 } : null,
    tech: { enabled: opts.tech ?? true, signers: [TECH_SIGNER] },
    ...(opts.throttle === true ? { throttleAlias: OTP_THROTTLE_SERVICE } : {}),
    ...(opts.ipOf != null ? { ipOf: opts.ipOf } : {}),
    ...(opts.devices != null ? { devices: opts.devices } : {}),
    ...(opts.devicePin != null ? { devicePin: opts.devicePin } : {}),
  })

  context.configure()
  await context.init()

  const service = context.service<EmailAuthService>(EMAIL_AUTH_SERVICE)

  const codeOf = (index?: number): string => {
    const mail = mailer.captured[index ?? mailer.captured.length - 1]
    const match = mail?.text?.match(/\b(\d{6})\b/)
    if (match == null) throw new Error('No code in the captured mail')
    return match[1]!
  }

  const guest = (patch: Partial<AbstractRequest> = {}): AbstractRequest => ({
    alias: 'auth-email:test', path: '/auth/email', params: {}, query: {}, headers: {}, ...patch,
  })

  const session = (accountId: string, patch: Partial<AbstractRequest> = {}): AbstractRequest => guest({
    auth: {
      token: '', type: AuthroizationType.Ed25519BasicToken, role: AuthRole.User, userId: accountId,
      scopes: ['*'], isUser: true, createdAt: new Date(),
    } as Auth,
    ...patch,
  })

  const signed = async (signer: string, body: Record<string, unknown> = {}): Promise<AbstractRequest> => {
    const signerKey = signer === TECH_SIGNER ? techKey : otherKey
    const { authorization, headers } = await signBasicEd25519Request({ body, credential: signerKey.exportAddress(), key: signerKey })
    const req = guest({ body, headers: { authorization, ...headers } })
    const guard = context.service<GuardService>(GUARD_ED25519)
    const response = {
      resolve: (auth: Auth) => { req.auth = auth },
      reject: (error: Error) => { throw error },
    }
    if (await guard.handle(req, response as never) !== true) {
      throw new Error('The guard refused the signed request')
    }

    return req
  }

  const challengeOf = async (type: string, message: string): Promise<string> =>
    await makeEnvelopeModel<string>(type).send(message, AUTHEN_TIMEFRAME).sign(authKey, EnvelopeKind.Wrap)

  const pinSignIn: EmailAuthFixture['pinSignIn'] = async (email, device = DEVICE_A) => {
    const { challenge } = await service.sendPin({ email }, guest())
    const answer = await service.signIn({ email, device, challenge, pin: codeOf() }, guest())
    const token = makeEnvelopeModel<AuthCredentials>(answer.token!, EnvelopeKind.Token).message<AuthCredentials>()

    return { accountId: token.userId, token: answer.token!, ...(answer.offer != null ? { offer: answer.offer } : {}) }
  }

  const accountOf = async (email: string): Promise<IdentityAccount | null> =>
    await context.resource<Resource<IdentityAccount>>(AUTH_IDENTITY_ACCOUNT).load({ email })

  return {
    context, service, mailer, asked, clock, authKey, codeOf, guest, session, signed, challengeOf, pinSignIn, accountOf,
    passwords: () => context.resource<Resource<EmailPasswordRecord>>(EMAIL_AUTH_PASSWORD_RESOURCE),
    devices: () => context.resource<Resource<EmailDeviceRecord>>(EMAIL_AUTH_DEVICE_RESOURCE),
  }
}

/** The error a promise rejects with. */
export const failure = async (promise: Promise<unknown>): Promise<Error> => {
  try {
    await promise
  } catch (error) {
    return error as Error
  }
  throw new Error('expected a refusal')
}

/** The HTTP status an error declares (`@owlmeans/server-api` reads the same static). */
export const statusOf = (error: Error): number | undefined =>
  (error.constructor as { httpStatus?: number }).httpStatus

/** The credential a signed token carries. */
export const tokenOf = (token: string): AuthCredentials =>
  makeEnvelopeModel<AuthCredentials>(token, EnvelopeKind.Token).message<AuthCredentials>()

/** A six-digit code other than `code`. */
export const otherCode = (code: string): string => code === '123456' ? '654321' : '123456'

// --- Mongo and Redis (env-gated) -----------------------------------------------------------------

export const mongoGate: IntegrationGate<MongoEnv> = gateHelper.mongoGate()
export const redisGate: IntegrationGate<RedisEnv> = gateHelper.redisGate()

/** Hook budget of a suite's teardown through a port-forward. */
export const TEARDOWN_TIMEOUT = 60_000

export interface MongoEmailAuthSuite {
  database: string
  /** A fixture whose identity store and e-mail resources are the real Mongo ones. */
  boot: (opts?: FixtureOptions) => Promise<EmailAuthFixture>
  /** A short-lived driver connection for assertions outside the context. */
  raw: <R>(fn: (client: MongoClient) => Promise<R>) => Promise<R>
  teardown: () => Promise<void>
}

/** One database per spec file, dropped by that file's own `afterAll`. */
export const makeMongoEmailAuthSuite = (label: string): MongoEmailAuthSuite => {
  const database = randomNamespace(`${process.env.MONGO_TEST_DB_PREFIX ?? 'omt'}_${label}`)
  const contexts: EmailAuthContext[] = []

  const raw: MongoEmailAuthSuite['raw'] = async fn => {
    const client = new MongoClient(mongoGate.env.MONGO_URL as string)
    try {
      await client.connect()

      return await fn(client)
    } finally {
      await client.close().catch(() => undefined)
    }
  }

  const boot: MongoEmailAuthSuite['boot'] = async opts => {
    const parsed = new URL(mongoGate.env.MONGO_URL as string)
    const storage: FixtureStorage = {
      cfg: {
        dbs: [{
          service: MONGO_ALIAS,
          alias: MONGO_ALIAS,
          host: decodeURIComponent(parsed.hostname).replace(/^\[|\]$/g, ''),
          port: parsed.port !== '' ? parseInt(parsed.port, 10) : 27017,
          schema: database,
          ...(parsed.username !== ''
            ? { user: decodeURIComponent(parsed.username), secret: decodeURIComponent(parsed.password) } : {}),
        }],
      } as Partial<EmailAuthConfig>,
      register: context => {
        appendMongo(context)
        appendAuthIdentityResources(context, undefined, { service: TEST_APP })
        appendEmailAuthResources(context)
        contexts.push(context)
      },
    }

    return await makeEmailAuthFixture(opts, storage)
  }

  const teardown: MongoEmailAuthSuite['teardown'] = async () => {
    if (mongoGate.skip) return
    await raw(async client => { await client.db(database).dropDatabase() })
      .catch(() => undefined)
    for (const context of contexts) {
      const mongo = context.service<MongoDbService>(MONGO_ALIAS)
      for (const client of Object.values(mongo.clients ?? {}) as MongoClient[]) {
        await client.close().catch(() => undefined)
      }
    }
    contexts.length = 0
  }

  return { database, boot, raw, teardown }
}

export interface RedisEmailAuthSuite {
  /** A context with the Redis service and one resource under `REDIS_TICKETS`. */
  boot: () => Promise<{ context: EmailAuthContext, resource: RedisResource<ResourceRecord> }>
  teardown: () => Promise<void>
}

/** The Redis resource alias the tickets and the throttle of the gated suite use. */
export const REDIS_TICKETS = 'auth-email-tickets'

/** One key prefix per spec file, dropped by that file's own `afterAll`. */
export const makeRedisEmailAuthSuite = (label: string): RedisEmailAuthSuite => {
  const prefix = randomNamespace(`${process.env.REDIS_TEST_KEY_PREFIX ?? 'omt'}_${label}`)
  const resources: Array<RedisResource<ResourceRecord>> = []

  const boot: RedisEmailAuthSuite['boot'] = async () => {
    const url = new URL(redisGate.env.REDIS_URL as string)
    const cfg = config<EmailAuthConfig>('server-auth-email-redis-tests', {
      dbs: [{
        service: REDIS_ALIAS,
        alias: REDIS_ALIAS,
        host: url.hostname,
        port: url.port !== '' ? Number(url.port) : 6379,
        user: url.username !== '' ? url.username : undefined,
        secret: decodeURIComponent(url.password),
        schema: prefix,
      }],
    } as Partial<EmailAuthConfig>)
    const context = makeServerContext(cfg) as EmailAuthContext
    appendRedis(context)
    context.registerResource(makeRedisResource(REDIS_TICKETS) as never)
    context.registerService(makeRedisThrottleService(OTP_THROTTLE_SERVICE, REDIS_TICKETS))
    context.configure()
    await context.init()
    const resource = context.resource<RedisResource<ResourceRecord>>(REDIS_TICKETS)
    resources.push(resource)

    return { context, resource }
  }

  const teardown: RedisEmailAuthSuite['teardown'] = async () => {
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
        // The prefix is unique per run, so whatever a lost connection leaves behind never collides.
      }
      await client.quit().catch(() => undefined)
    }
    resources.length = 0
  }

  return { boot, teardown }
}
