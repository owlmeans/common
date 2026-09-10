import { describe, expect, test } from 'bun:test'
import { AuthroizationType } from '@owlmeans/auth'
import { GUARD_AUTH_TOKEN } from '@owlmeans/auth-token'
import type { GuardService } from '@owlmeans/entrypoint'
import { hashAccessToken } from '../src/hash.js'
import {
  makeTestContext, request, response, seedProfile, seedToken, TEST_ENTITY, TEST_PREFIX, TEST_PROFILE
} from './context.js'

const TOKEN = `${TEST_PREFIX}averylongrandomsecretvalue`

const armed = async (opts = {}) => {
  const context = await makeTestContext(opts)
  await seedProfile(context)
  await seedToken(context, hashAccessToken(TOKEN))

  return { context, guard: context.service<GuardService>(GUARD_AUTH_TOKEN) }
}

describe('@owlmeans/server-auth-token — what the guard claims', () => {
  test('claims a prefixed value under either scheme', async () => {
    const { guard } = await armed()

    expect(await guard.match(request(`AUTH-TOKEN ${TOKEN}`), response())).toBe(true)
    expect(await guard.match(request(`Bearer ${TOKEN}`), response())).toBe(true)
  })

  test('leaves every other credential alone', async () => {
    const { guard } = await armed()

    // The one that matters: an OwlMeans session bearer must reach its own guard untouched.
    expect(await guard.match(request('ED25519-BASIC-TOKEN abcdef'), response())).toBe(false)
    // A Bearer without this deployment's prefix belongs to somebody else — an OIDC access token.
    expect(await guard.match(request('Bearer some.jwt.value'), response())).toBe(false)
    expect(await guard.match(request(), response())).toBe(false)
  })

  test('refuses a denied route outright, so the boundary answers 401', async () => {
    const { guard } = await armed({ denyAliases: ['payment:checkout'] })

    expect(await guard.match(request(`Bearer ${TOKEN}`, 'payment:checkout'), response())).toBe(false)
    expect(await guard.match(request(`Bearer ${TOKEN}`, 'project:list'), response())).toBe(true)
  })
})

describe('@owlmeans/server-auth-token — what the guard resolves', () => {
  test('builds the same Auth payload a session would, and never echoes the secret', async () => {
    const { guard } = await armed()
    const res = response()

    expect(await guard.handle(request(`Bearer ${TOKEN}`), res)).toBe(true)
    expect(res.value.type).toBe(AuthroizationType.AuthToken)
    expect(res.value.profileId).toBe(TEST_PROFILE)
    expect(res.value.entitySlug).toBe(TEST_ENTITY)
    expect(res.value.isUser).toBe(true)
    expect(res.value.token).not.toBe(TOKEN)
    expect(res.value.token).toBe(`${TEST_PREFIX}display`)
  })

  test('a token can never outrank its profile', async () => {
    const context = await makeTestContext()
    await seedProfile(context, { scopes: ['project:read'] })
    await seedToken(context, hashAccessToken(TOKEN), { scopes: ['*', 'project:write'] })
    const guard = context.service<GuardService>(GUARD_AUTH_TOKEN)
    const res = response()

    expect(await guard.handle(request(`Bearer ${TOKEN}`), res)).toBe(true)
    expect(res.value.scopes).toEqual(['project:read'])
  })

  test('refuses a revoked token', async () => {
    const context = await makeTestContext()
    await seedProfile(context)
    await seedToken(context, hashAccessToken(TOKEN), { revokedAt: new Date() })
    const guard = context.service<GuardService>(GUARD_AUTH_TOKEN)

    expect(await guard.handle(request(`Bearer ${TOKEN}`), response())).toBe(false)
  })

  test('refuses an expired token', async () => {
    const context = await makeTestContext()
    await seedProfile(context)
    await seedToken(context, hashAccessToken(TOKEN), { expiresAt: new Date(Date.now() - 1000) })
    const guard = context.service<GuardService>(GUARD_AUTH_TOKEN)

    expect(await guard.handle(request(`Bearer ${TOKEN}`), response())).toBe(false)
  })

  test('refuses an unknown secret', async () => {
    const { guard } = await armed()

    expect(await guard.handle(request(`Bearer ${TEST_PREFIX}notthisone`), response())).toBe(false)
  })

  test('refuses when the profile behind it is gone — revoking a person revokes their tokens', async () => {
    const context = await makeTestContext()
    await seedToken(context, hashAccessToken(TOKEN))
    const guard = context.service<GuardService>(GUARD_AUTH_TOKEN)

    expect(await guard.handle(request(`Bearer ${TOKEN}`), response())).toBe(false)
  })

  test('refuses when the profile has expired', async () => {
    const context = await makeTestContext()
    await seedProfile(context, { expiresAt: new Date(Date.now() - 1000) })
    await seedToken(context, hashAccessToken(TOKEN))
    const guard = context.service<GuardService>(GUARD_AUTH_TOKEN)

    expect(await guard.handle(request(`Bearer ${TOKEN}`), response())).toBe(false)
  })

  test('produces no credential of its own — it verifies, it does not authenticate', async () => {
    const { guard } = await armed()

    expect(await guard.authenticated()).toBeNull()
  })
})

describe('@owlmeans/server-auth-token — the hash at rest', () => {
  test('the stored value is not the token', () => {
    const hash = hashAccessToken(TOKEN)

    expect(hash).not.toBe(TOKEN)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hashAccessToken(TOKEN)).toBe(hash)
    expect(hashAccessToken(`${TOKEN}x`)).not.toBe(hash)
  })
})
