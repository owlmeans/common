import { randomUUID } from 'node:crypto'
import { AppType, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { createStaticResource } from '@owlmeans/static-resource'
import { makeMemoryTrustedResource, makeFixtureKeyPair } from '@owlmeans/test-auth'
import type { TrustedRecord } from '@owlmeans/auth-common'
import type { KeyPairModel } from '@owlmeans/basic-keys'
import { TRUSTED } from '@owlmeans/config'
import { AUTH_IDENTITY_ACCOUNT, AUTH_IDENTITY_PROFILE } from '@owlmeans/server-auth-identity'
import type { IdentityAccount, IdentityProfile } from '@owlmeans/server-auth-identity'
import { TOKEN_UPDATE } from '@owlmeans/auth-common'
import { AuthRole } from '@owlmeans/auth'
import type { Auth, AuthCredentials } from '@owlmeans/auth'
import { AUTH_CACHE, AUTH_SRV_KEY, DEFAULT_ALIAS } from '../src/consts.js'
import { appendAuthService, makeAuthService } from '../src/service.js'
import { makeAuthModel } from '../src/manager/model.js'
import { registerPlugin } from '../src/manager/plugins/index.js'
import type { AuthService, AuthServiceSettings } from '../src/types.js'

const SERVICE_NAME = 'server-auth-tests'
const RESOURCE_KEY = 'server-auth-test-cache'

/** A deployment's own key pair, for the specs that move both keys off the defaults. */
export const OPERATOR_KEY = 'server-auth-operator'

export interface TestContextOptions {
  /** `cfg.auth` of the context. */
  auth?: AuthServiceSettings
  /** `cfg.alias` of the context. */
  alias?: string
  /**
   * Wire the guard the way a server does — `appendAuthService`: the memory session registry and the
   * auth events service with it. Without it the bare service is registered, with neither.
   */
  sessions?: boolean
  /** The identity store's accounts and profile rows, as in-process resources the refresh reads. */
  identity?: boolean
}

const recordOf = (name: string, seed: string): { record: TrustedRecord, kp: KeyPairModel } => {
  const kp = makeFixtureKeyPair(seed)

  return {
    kp,
    record: {
      id: kp.exportAddress(),
      name,
      credential: kp.exportPublic(),
      // Local, deterministic test-only key: the record signs as well as verifies.
      secret: kp.export(),
      scopes: ['*'],
    },
  }
}

/**
 * Build a test context with:
 * - AUTH_CACHE static resource (anti-replay)
 * - AUTH_SRV_KEY trusted record (external auth service key for verifying incoming credentials)
 * - SERVICE_NAME trusted record (app's own key for signing outgoing bearers)
 * - OPERATOR_KEY trusted record (a deployment's own key, used only where `cfg.auth` names it)
 * - AuthService registered (bare, or through `appendAuthService` with `sessions`)
 */
export const makeTestContext = (opts: TestContextOptions = {}) => {
  const { kp: authServiceKP, record: authServiceRecord } = recordOf(AUTH_SRV_KEY, 'auth-service-trusted')
  const { kp: appKP, record: appRecord } = recordOf(SERVICE_NAME, 'server-auth-app')
  const { kp: operatorKP, record: operatorRecord } = recordOf(OPERATOR_KEY, 'server-auth-operator')

  const cfg: BasicConfig & { auth?: AuthServiceSettings } = {
    ready: false,
    service: SERVICE_NAME,
    type: AppType.Backend,
    services: {},
    ...(opts.alias != null ? { alias: opts.alias } : {}),
    ...(opts.auth != null ? { auth: opts.auth } : {}),
  }

  const context = makeBasicContext(cfg) as BasicContext<BasicConfig>

  // Register trusted records (use TRUSTED alias so trust() can find them)
  context.registerResource(makeMemoryTrustedResource([authServiceRecord, appRecord, operatorRecord], TRUSTED))

  // Register AUTH_CACHE static resource
  context.registerResource(createStaticResource(AUTH_CACHE, opts.sessions === true ? `${RESOURCE_KEY}:${randomUUID()}` : RESOURCE_KEY))

  const identity = opts.identity === true ? {
    accounts: createStaticResource<IdentityAccount>(AUTH_IDENTITY_ACCOUNT, `accounts:${randomUUID()}`),
    profiles: createStaticResource<IdentityProfile>(AUTH_IDENTITY_PROFILE, `profiles:${randomUUID()}`),
  } : null
  if (identity != null) {
    context.registerResource(identity.accounts)
    context.registerResource(identity.profiles)
  }

  // Register auth service
  if (opts.sessions === true) {
    appendAuthService(context as never)
  } else {
    context.registerService(makeAuthService(DEFAULT_ALIAS))
  }

  return { context, authServiceKP, appKP, operatorKP, authServiceRecord, operatorRecord, identity }
}

/** The sign-in method the flow helpers use: a plugin that leaves the posted identity as it is. */
export const TEST_LOGIN = 'server-auth-test-login'

registerPlugin(TEST_LOGIN, () => ({
  type: TEST_LOGIN,
  init: async () => ({ challenge: randomUUID() }),
  authenticate: async () => ({ token: '' }),
}))

/**
 * A sign-in end to end in one context, the way the auth manager and an API server run it: the
 * manager's challenge, the `TEST_LOGIN` plugin, the credential envelope the manager signs, and the
 * bearer exchange. `who` is the identity the plugin answers.
 */
export const signInThrough = async (
  context: BasicContext<BasicConfig>, who: Partial<AuthCredentials> & { userId: string }
): Promise<{ challenge: string, credential: string, bearer: string }> => {
  const model = makeAuthModel(context as never)
  const { challenge } = await model.init({ type: TEST_LOGIN, userId: who.userId })
  const { token: credential } = await model.authenticate({
    type: TEST_LOGIN, challenge, credential: 'test', role: AuthRole.User, scopes: ['*'], ...who,
  } as AuthCredentials)
  const { token: bearer } = await context.service<AuthService>(DEFAULT_ALIAS).authenticate({ token: credential })

  return { challenge, credential, bearer }
}

/** One request through the bearer guard: whether it admitted, what it resolved, the re-signed token if any. */
export const throughGuard = async (
  context: BasicContext<BasicConfig>, bearer: string
): Promise<{ admitted: boolean, auth: Auth | null, update?: string }> => {
  let auth: Auth | null = null
  const headers: Record<string, string> = {}
  const req = { headers: { authorization: bearer } } as never
  const res = {
    resolve: (value: Auth) => { auth = value },
    responseProvider: { header: (name: string, value: string) => { headers[name] = value } },
  } as never
  const admitted = await context.service<AuthService>(DEFAULT_ALIAS).handle<boolean>(req, res)

  return { admitted, auth, ...(headers[TOKEN_UPDATE] != null ? { update: headers[TOKEN_UPDATE] } : {}) }
}
