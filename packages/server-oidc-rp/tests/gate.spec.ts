import { describe, test, expect } from 'bun:test'
import { AuthForbidden, AuthorizationError } from '@owlmeans/auth'
import type { Auth } from '@owlmeans/auth'
import type { Resource } from '@owlmeans/resource'
import { AUTH_CACHE } from '@owlmeans/server-auth'
import { makeTestContext } from './context.js'
import { createGateModel } from '../src/model/gate.js'
import { managedId } from '../src/utils/cache.js'
import type { Config, Context } from '../src/types.js'

const ready = async () => {
  const ctx = makeTestContext()
  ctx.configure()
  await ctx.init()

  return ctx as unknown as Context<Config>
}

describe('@owlmeans/server-oidc-rp — permission gate model', () => {
  test('a session whose record is gone must sign in again (401), never "not found"', async () => {
    const ctx = await ready()
    const failure = await createGateModel(ctx)
      .loadPermissions({ token: 'vanished' } as Auth, ['shed:borrow'])
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(AuthorizationError)
    expect(failure).not.toBeInstanceOf(AuthForbidden)
  })

  test('a record without a token set is still a refused permission (403)', async () => {
    const ctx = await ready()
    await ctx.resource<Resource<{ id: string }>>(AUTH_CACHE).create({ id: managedId('bare') })
    const failure = await createGateModel(ctx)
      .loadPermissions({ token: 'bare' } as Auth, ['shed:borrow'])
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(AuthForbidden)
  })
})
