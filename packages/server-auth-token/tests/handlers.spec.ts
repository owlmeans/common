import { describe, expect, test } from 'bun:test'
import { AuthroizationType, AuthRole } from '@owlmeans/auth'
import { AUTH_TOKEN_RESOURCE } from '@owlmeans/auth-token'
import type { AccessTokenRecord, IssuedAccessToken } from '@owlmeans/auth-token'
import { createAccessToken, listAccessTokens, revokeAccessToken } from '../src/handlers/index.js'
import { hashAccessToken } from '../src/hash.js'
import { makeTestContext, seedProfile, seedToken, TEST_ENTITY, TEST_PREFIX, TEST_PROFILE, TEST_USER } from './context.js'

/**
 * A handler is a `RefedEntrypointHandler`: it is given the entrypoint reference it was elevated
 * onto and answers with `(req, res)`. Calling it directly is what lets these tests be about the
 * RULES — who may mint, what a list shows, whose token may be revoked — rather than about routing.
 */
const invoke = async (handler: any, context: any, req: any): Promise<any> => {
  const res: any = { resolve: (value: unknown) => { res.value = value }, reject: (e: Error) => { res.error = e } }
  await handler({ ref: { ctx: context } })(req, res)
  if (res.error != null) throw res.error

  return res.value
}

const session = (patch: Record<string, unknown> = {}): any => ({
  headers: {}, params: {}, query: {}, body: {},
  entity: { id: TEST_ENTITY, slug: TEST_ENTITY },
  auth: {
    type: AuthroizationType.Ed25519BasicToken,
    profileId: TEST_PROFILE,
    userId: TEST_USER,
    entitySlug: TEST_ENTITY,
    role: AuthRole.User,
    scopes: ['*'],
    ...patch,
  },
})

describe('@owlmeans/server-auth-token — minting', () => {
  test('returns the plaintext once and stores only its hash', async () => {
    const context = await makeTestContext()
    await seedProfile(context)

    const issued: IssuedAccessToken = await invoke(
      createAccessToken, context, { ...session(), body: { name: 'my laptop' } }
    )

    expect(issued.token).toStartWith(TEST_PREFIX)
    expect(issued.record.name).toBe('my laptop')
    expect(issued.record.display).toStartWith(TEST_PREFIX)
    expect(issued.record.display.length).toBeLessThan(issued.token.length)
    // The view a caller sees carries no hash at all.
    expect((issued.record as unknown as AccessTokenRecord).hash).toBeUndefined()

    const stored = await context.resource<any>(AUTH_TOKEN_RESOURCE).load({ hash: hashAccessToken(issued.token) })
    expect(stored).not.toBeNull()
    expect(stored.hash).not.toBe(issued.token)
  })

  test('two tokens are never the same token', async () => {
    const context = await makeTestContext()
    await seedProfile(context)

    const first: IssuedAccessToken = await invoke(createAccessToken, context, { ...session(), body: { name: 'a' } })
    const second: IssuedAccessToken = await invoke(createAccessToken, context, { ...session(), body: { name: 'b' } })

    expect(first.token).not.toBe(second.token)
  })

  test('an expiry is stored as a moment, not as a duration', async () => {
    const context = await makeTestContext()
    await seedProfile(context)

    const issued: IssuedAccessToken = await invoke(
      createAccessToken, context, { ...session(), body: { name: 'temporary', expiresIn: 3600 } }
    )

    expect(issued.record.expiresAt).toBeDefined()
    expect(new Date(issued.record.expiresAt!).getTime()).toBeGreaterThan(Date.now())
  })

  test('a token may never mint another token', async () => {
    const context = await makeTestContext()
    await seedProfile(context)

    const req = { ...session({ type: AuthroizationType.AuthToken }), body: { name: 'escalation' } }
    await expect(invoke(createAccessToken, context, req)).rejects.toThrow()
  })

  test('a token may never widen beyond the caller it was minted by', async () => {
    const context = await makeTestContext()
    await seedProfile(context)

    const req = {
      ...session({ scopes: ['project:read'] }),
      body: { name: 'greedy', scopes: ['project:read', 'project:write'] },
    }
    await expect(invoke(createAccessToken, context, req)).rejects.toThrow()
  })
})

describe('@owlmeans/server-auth-token — listing and revoking', () => {
  test('a list shows the caller\'s own tokens and never a hash', async () => {
    const context = await makeTestContext()
    await seedProfile(context)
    await seedToken(context, hashAccessToken('tst_one'), { id: 'one', name: 'one' })
    await seedToken(context, hashAccessToken('tst_two'), { id: 'two', name: 'two' })
    // Somebody else's token, in the same store.
    await seedToken(context, hashAccessToken('tst_other'), {
      id: 'other', name: 'other', profileId: 'someone-else',
    })

    const result = await invoke(listAccessTokens, context, session())

    expect(result.items.map((item: any) => item.name).sort()).toEqual(['one', 'two'])
    expect(result.items.every((item: any) => item.hash === undefined)).toBe(true)
  })

  test('revoking marks the record and is idempotent', async () => {
    const context = await makeTestContext()
    await seedProfile(context)
    await seedToken(context, hashAccessToken('tst_one'), { id: 'one' })

    await invoke(revokeAccessToken, context, { ...session(), params: { id: 'one' } })
    const first = await context.resource<any>(AUTH_TOKEN_RESOURCE).load('one')
    expect(first.revokedAt).toBeDefined()

    // A retry is what a lost response looks like; it must not fail.
    await invoke(revokeAccessToken, context, { ...session(), params: { id: 'one' } })
    const second = await context.resource<any>(AUTH_TOKEN_RESOURCE).load('one')
    expect(new Date(second.revokedAt).getTime()).toBe(new Date(first.revokedAt).getTime())
  })

  test('another profile\'s token answers exactly as an unknown id does', async () => {
    const context = await makeTestContext()
    await seedProfile(context)
    await seedToken(context, hashAccessToken('tst_other'), { id: 'other', profileId: 'someone-else' })

    await expect(
      invoke(revokeAccessToken, context, { ...session(), params: { id: 'other' } })
    ).rejects.toThrow()
    await expect(
      invoke(revokeAccessToken, context, { ...session(), params: { id: 'nonexistent' } })
    ).rejects.toThrow()
  })

  test('a token may never revoke a token', async () => {
    const context = await makeTestContext()
    await seedProfile(context)
    await seedToken(context, hashAccessToken('tst_one'), { id: 'one' })

    await expect(invoke(
      revokeAccessToken, context,
      { ...session({ type: AuthroizationType.AuthToken }), params: { id: 'one' } }
    )).rejects.toThrow()
  })
})
