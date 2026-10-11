import { afterEach, describe, expect, test } from 'bun:test'
import { AuthenticationType, buildSupervisorPayload } from '@owlmeans/auth'
import type { AuthCredentials } from '@owlmeans/auth'
import { makeKeyPairModel, keyHelper } from '@owlmeans/basic-keys'
import { plugins as authPlugins } from '@owlmeans/client-auth/manager'
import type { CommonConfig } from '@owlmeans/config'
import { appendSupervisorAuth, SUPERVISOR_LOGIN_PATH, supervisorClientPlugin } from '../src/index.js'

type Cfg = { debug?: { all?: boolean, supervisor?: boolean }, security?: CommonConfig['security'] }
const carrier = (cfg: Cfg = {}) => ({ cfg })

afterEach(() => { delete authPlugins[AuthenticationType.Supervisor] })

describe('appendSupervisorAuth — who gets an operator login', () => {
  test('nothing is registered unless the deployment asks for the supervisor on purpose', () => {
    const context = carrier({ debug: { all: true } })
    appendSupervisorAuth(context)

    expect(authPlugins[AuthenticationType.Supervisor]).toBeUndefined()
    expect(context.cfg.security).toBeUndefined()
  })

  test('`debug.supervisor` registers the plugin and offers it on the sign-in screen', () => {
    const context = carrier({ debug: { supervisor: true } })
    appendSupervisorAuth(context)

    expect(authPlugins[AuthenticationType.Supervisor]).toBe(supervisorClientPlugin)
    expect(context.cfg.security?.auth?.login?.secretKey).toBe(true)
    expect(context.cfg.security?.auth?.login?.overrides?.[AuthenticationType.Supervisor]).toEqual({ enabled: true })
  })

  test('`offer: false` registers the route without putting it on the screen', () => {
    const context = carrier()
    appendSupervisorAuth(context, { enabled: true, offer: false })

    expect(authPlugins[AuthenticationType.Supervisor]).toBe(supervisorClientPlugin)
    expect(context.cfg.security).toBeUndefined()
  })

  test('an override the configuration already states is kept', () => {
    const context = carrier({
      debug: { supervisor: true },
      security: { auth: { login: { secretKey: false, overrides: { [AuthenticationType.Supervisor]: { enabled: false } } } } },
    } as Cfg)
    appendSupervisorAuth(context)

    expect(context.cfg.security?.auth?.login?.secretKey).toBe(false)
    expect(context.cfg.security?.auth?.login?.overrides?.[AuthenticationType.Supervisor]).toEqual({ enabled: false })
  })

  test('the form lives on the standard typed authentication route', () => {
    expect(SUPERVISOR_LOGIN_PATH).toBe(`/authentication/login/${AuthenticationType.Supervisor}`)
  })
})

describe('supervisorClientPlugin — what it sends', () => {
  test('is a restricted method, shown last as a link', () => {
    expect(supervisorClientPlugin.type).toBe(AuthenticationType.Supervisor)
    expect(supervisorClientPlugin.method).toMatchObject({ restricted: true, emphasis: 'link', order: 900 })
  })

  test('signs the challenge, the user and a fresh salt with the entered key and sends no key', async () => {
    const key = makeKeyPairModel()
    const credentials = { userId: 'person@example.com', credential: key.export(), challenge: 'one-time' } as AuthCredentials

    const token = await supervisorClientPlugin.authenticate!(credentials)

    expect(token).toEqual({ token: '' })
    const packed = JSON.parse(credentials.credential) as { salt: string, signature: string }
    expect(Object.keys(packed).sort()).toEqual(['salt', 'signature'])
    expect(packed.salt).toHaveLength(16)
    expect(credentials.credential).not.toContain(key.export())
    // Verified the way the server's supervisor plugin verifies it.
    const verifier = keyHelper.fromPubKey(key.exportPublic())
    expect(await verifier.verify(buildSupervisorPayload('one-time', 'person@example.com', packed.salt), packed.signature)).toBe(true)
    expect(await verifier.verify(buildSupervisorPayload('replayed', 'person@example.com', packed.salt), packed.signature)).toBe(false)
  })

  test('two sign-ins never share a salt', async () => {
    const key = makeKeyPairModel().export()
    const salts = await Promise.all([1, 2].map(async () => {
      const credentials = { userId: 'u', credential: key, challenge: 'c' } as AuthCredentials
      await supervisorClientPlugin.authenticate!(credentials)
      return (JSON.parse(credentials.credential) as { salt: string }).salt
    }))

    expect(salts[0]).not.toBe(salts[1])
  })
})
