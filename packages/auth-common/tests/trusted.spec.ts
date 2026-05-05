import { describe, expect, test } from 'bun:test'
import { trust } from '@owlmeans/auth-common/utils'
import { TRUSTED_ALIAS, makeTrustFixture } from './context.js'

describe('@owlmeans/auth-common — trust() flow', () => {
  // Mirrors viable/sources/backend/src/config.ts which pushes trusted records
  // for master-key/auth-service/payment-service/agent — each with a `name`
  // field that downstream `trust(context, resource, userName)` calls look up.
  test('loads a record by name and returns a verifying key model', async () => {
    const { ctx, authKey, authRecord } = makeTrustFixture()

    const { user, key } = await trust(ctx, TRUSTED_ALIAS, authRecord.name as string)

    expect(user.id).toBe(authRecord.id as string)
    const sig = await authKey.sign({ a: 1 })
    expect(await key.verify({ a: 1 }, sig)).toBe(true)
  })

  test('returns a signing key model when the trusted record has a `secret`', async () => {
    const { ctx, authRecord } = makeTrustFixture({ withSecret: true })

    const { key } = await trust(ctx, TRUSTED_ALIAS, authRecord.name as string)

    // With secret in the record the model can sign as well as verify —
    // this is the path used by the auth service itself when issuing tokens.
    const sig = await key.sign({ a: 1 })
    expect(await key.verify({ a: 1 }, sig)).toBe(true)
  })

  test('throws SyntaxError when the trusted user is missing', async () => {
    const { ctx } = makeTrustFixture()

    let caught: unknown = null
    try {
      await trust(ctx, TRUSTED_ALIAS, 'unknown-user')
    } catch (e) { caught = e }

    expect(caught).toBeInstanceOf(SyntaxError)
  })
})
