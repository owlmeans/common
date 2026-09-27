import { describe, expect, test } from 'bun:test'
import { hashAccessToken } from '@owlmeans/server-auth-token'
import { AUTH_TOKEN_RESOURCE } from '@owlmeans/auth-token'
import { handleRevoke } from '../src/handlers/revoke.js'
import { makeTestContext, TEST_ENTITY, TEST_PROFILE, TEST_USER } from './context.js'
import { AuthRole } from '@owlmeans/auth'

describe('handleRevoke', () => {
  test('marks a live token revoked', async () => {
    const context = makeTestContext()
    const tokens = context.resource<any>(AUTH_TOKEN_RESOURCE)
    const record = await tokens.create({
      hash: hashAccessToken('tst_abc'), display: 'tst_abc', name: 'x',
      userId: TEST_USER, profileId: TEST_PROFILE, entityId: TEST_ENTITY,
      scopes: ['*'], role: AuthRole.User, createdAt: new Date(),
    })
    expect(record.revokedAt).toBeUndefined()

    await handleRevoke(context, { token: 'tst_abc' })

    const reloaded = await tokens.load({ hash: hashAccessToken('tst_abc') })
    expect(reloaded.revokedAt).not.toBeNull()
  })

  test('is a silent no-op for an unknown token, an empty token, or one already revoked — RFC 7009 §2.2', async () => {
    const context = makeTestContext()
    await expect(handleRevoke(context, { token: 'tst_never-issued' })).resolves.toBeUndefined()
    await expect(handleRevoke(context, {})).resolves.toBeUndefined()

    const tokens = context.resource<any>(AUTH_TOKEN_RESOURCE)
    await tokens.create({
      hash: hashAccessToken('tst_dead'), display: 'tst_dead', name: 'x',
      userId: TEST_USER, profileId: TEST_PROFILE, entityId: TEST_ENTITY,
      scopes: ['*'], role: AuthRole.User, createdAt: new Date(), revokedAt: new Date(),
    })
    await expect(handleRevoke(context, { token: 'tst_dead' })).resolves.toBeUndefined()
  })
})
