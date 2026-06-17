import { describe, test, expect } from 'bun:test'
import { makeTestContext } from './context.js'
import { GOOGLE_SERVICE } from '@owlmeans/oidc'
import { AuthManagerError } from '@owlmeans/auth'
import type { OidcClientService } from '../src/types.js'
import { DEFAULT_ALIAS } from '../src/consts.js'

describe('@owlmeans/server-oidc-rp — getConfig', () => {
  test('finds provider by service name only', async () => {
    const ctx = makeTestContext()
    ctx.configure()
    await ctx.init()

    const oidc = ctx.service<OidcClientService>(DEFAULT_ALIAS)
    const cfg = await oidc.getConfig({ service: GOOGLE_SERVICE })

    expect(cfg).not.toBeNull()
    expect(cfg!.clientId).toBe('google-client-id-123')
    expect(cfg!.secret).toBe('google-secret-456')
  })

  test('finds provider by clientId string', async () => {
    const ctx = makeTestContext()
    ctx.configure()
    await ctx.init()

    const oidc = ctx.service<OidcClientService>(DEFAULT_ALIAS)
    const cfg = await oidc.getConfig('keycloak-admin')

    expect(cfg).not.toBeNull()
    expect(cfg!.service).toBe('iam-product-api')
  })

  test('throws when lookup has neither clientId nor service', async () => {
    const ctx = makeTestContext()
    ctx.configure()
    await ctx.init()

    const oidc = ctx.service<OidcClientService>(DEFAULT_ALIAS)

    await expect(oidc.getConfig({})).rejects.toBeInstanceOf(AuthManagerError)
  })

  test('returns undefined for unknown service', async () => {
    const ctx = makeTestContext()
    ctx.configure()
    await ctx.init()

    const oidc = ctx.service<OidcClientService>(DEFAULT_ALIAS)
    const cfg = await oidc.getConfig({ service: 'nonexistent-service' })

    expect(cfg).toBeUndefined()
  })
})

describe('@owlmeans/server-oidc-rp — getConfiguration guard', () => {
  test('throws oidc.client.client-id when service-only provider has no clientId on provider or param', async () => {
    const ctx = makeTestContext()
    // Add a provider with no clientId
    ;(ctx.cfg as any).oidc.providers.push({
      service: 'no-client-id-svc',
      secret: 'some-secret',
      basePath: 'realms/test',
    })
    ctx.configure()
    await ctx.init()

    const oidc = ctx.service<OidcClientService>(DEFAULT_ALIAS)

    // getConfiguration should throw because neither param.clientId nor cfg.clientId exist
    await expect(
      oidc.getConfiguration({ service: 'no-client-id-svc' })
    ).rejects.toThrow('oidc.client.client-id')
  })
})
