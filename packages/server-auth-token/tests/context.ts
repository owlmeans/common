import { AppType, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { createStaticResource } from '@owlmeans/static-resource'
import { AUTH_IDENTITY_PROFILE } from '@owlmeans/server-auth-identity'
import type { IdentityProfile } from '@owlmeans/server-auth-identity'
import { AUTH_TOKEN_RESOURCE, GUARD_AUTH_TOKEN } from '@owlmeans/auth-token'
import type { AccessTokenRecord } from '@owlmeans/auth-token'
import { AuthRole } from '@owlmeans/auth'
import { appendAuthTokenGuard } from '../src/append.js'
import type { AuthTokenGuardOptions } from '../src/types.js'

export const TEST_PREFIX = 'tst_'
export const TEST_ENTITY = 'entity-1'
export const TEST_PROFILE = 'profile-1'
export const TEST_USER = 'user-1'

/**
 * A context with the two resources the guard reads and nothing else.
 *
 * Static resources rather than Mongo: the guard's contract is "which record makes a request
 * authentic", and a database adds nothing to that question. The identity profile is a REAL record
 * shape from `@owlmeans/server-auth-identity` — the guard reads a token's authority off it, so a
 * stand-in of the wrong shape would let the intersection rule pass untested.
 */
// A static resource's store is module-level and keyed by its storage key, so two contexts sharing
// one key share one store — and the second test's seed collides with the first's. A key per
// context is what makes each test start empty.
let store = 0
let seq = 0

export const makeTestContext = async (opts: AuthTokenGuardOptions = {}) => {
  const key = `auth-token-tests-${++store}`
  const cfg: BasicConfig = {
    ready: false, service: 'server-auth-token-tests', type: AppType.Backend, services: {},
  }
  const context = makeBasicContext(cfg) as BasicContext<BasicConfig>

  // A record store that mints an id when the caller does not supply one — which is what every
  // real backend does and what the static resource, alone among them, refuses to do. The handlers
  // let their store assign ids, so without this the test would be asserting a property of the
  // test double rather than of the code.
  const identified = <T extends { id?: string }>(resource: any): any => {
    const create = resource.create.bind(resource)
    resource.create = async (record: T, opts?: unknown) =>
      await create({ ...record, id: record.id ?? `rec-${++seq}` }, opts)

    return resource
  }

  context.registerResource(identified(createStaticResource<AccessTokenRecord>(AUTH_TOKEN_RESOURCE, `${key}-tokens`)))
  context.registerResource(identified(createStaticResource<IdentityProfile>(AUTH_IDENTITY_PROFILE, `${key}-profiles`)))
  // Exactly how a deployment wires it: one call that seats the guard AND records the prefix, so
  // the minting handler and the guard cannot disagree about what a token of this deployment is.
  appendAuthTokenGuard(context, GUARD_AUTH_TOKEN, { prefix: TEST_PREFIX, ...opts })

  context.configure()
  await context.init()

  return context
}

export const seedProfile = async (
  context: BasicContext<BasicConfig>, patch: Partial<IdentityProfile> = {}
): Promise<IdentityProfile> => {
  const profiles = context.resource<any>(AUTH_IDENTITY_PROFILE)

  return await profiles.create({
    id: patch.id ?? `profile-record-${TEST_PROFILE}`,
    profileId: TEST_PROFILE,
    entityId: TEST_ENTITY,
    userId: TEST_USER,
    role: AuthRole.User,
    scopes: ['*'],
    ...patch,
  })
}

export const seedToken = async (
  context: BasicContext<BasicConfig>, hash: string, patch: Partial<AccessTokenRecord> = {}
): Promise<AccessTokenRecord> => {
  const tokens = context.resource<any>(AUTH_TOKEN_RESOURCE)

  return await tokens.create({
    id: patch.id ?? hash.slice(0, 12),
    hash,
    display: `${TEST_PREFIX}display`,
    name: 'test token',
    userId: TEST_USER,
    profileId: TEST_PROFILE,
    entityId: TEST_ENTITY,
    scopes: ['*'],
    role: AuthRole.User,
    createdAt: new Date(),
    ...patch,
  })
}

/** The two things a guard is handed: a request carrying a header, and a response to resolve into. */
export const request = (authorization?: string, alias?: string): any => ({
  alias,
  headers: authorization != null ? { authorization } : {},
  params: {}, query: {}, body: {},
})

export const response = (): any => {
  const res: any = { resolve: (value: unknown) => { res.value = value } }

  return res
}
