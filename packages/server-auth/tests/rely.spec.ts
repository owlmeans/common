import { describe, expect, test } from 'bun:test'
import { AUTH_SCOPE, AuthenticationType, AuthRole, GUEST_ID } from '@owlmeans/auth'
import type { AuthCredentials, RelyToken } from '@owlmeans/auth'
import { RELY_PIN_PERFIX, RELY_TOKEN_PREFIX } from '@owlmeans/auth-common'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import type { Resource, ResourceRecord } from '@owlmeans/resource'
import { AUTH_CACHE } from '../src/consts.js'
import { makeAuthModel } from '../src/manager/model.js'
import { makeProviderRely } from '../src/model/index.js'
import { makeTestContext } from './context.js'

interface TunnelRecord extends ResourceRecord {
  challenge: string
}

const setup = async () => {
  const fixture = makeTestContext()
  fixture.context.configure()
  await fixture.context.init()

  return { ...fixture, model: makeAuthModel(fixture.context as never) }
}

type Setup = Awaited<ReturnType<typeof setup>>

/** A consumer's manager-issued challenge and the token its own tunnel record is filed under. */
const consumerOf = async ({ model }: Setup): Promise<{ challenge: string, token: string }> => {
  const { challenge } = await model.init({ type: AuthenticationType.RelyHandshake, userId: '' } as never)
  const inner = makeEnvelopeModel<string>(challenge, EnvelopeKind.Wrap).message(true) as string
  const rely = makeEnvelopeModel<RelyToken>(inner, EnvelopeKind.Wrap).message()

  return { challenge, token: rely.token! }
}

describe('server-auth — the rely-handshake sign-in', () => {
  test('signs a guest whatever identity the caller posted', async () => {
    const env = await setup()
    const { challenge, token } = await consumerOf(env)

    const { token: signed } = await env.model.authenticate({
      type: AuthenticationType.RelyHandshake, challenge, credential: `${RELY_TOKEN_PREFIX}${token}`,
      userId: 'victim@example.com', role: AuthRole.Admin, scopes: ['*'],
      profileId: 'profile-1', entitySlug: 'acme', source: 'previous-challenge',
    } as AuthCredentials)

    const envelope = makeEnvelopeModel<AuthCredentials>(signed, EnvelopeKind.Token)
    expect(envelope.type()).toBe(AuthenticationType.RelyHandshake)
    const credential = envelope.message<AuthCredentials>()
    expect(credential).toMatchObject({
      type: AuthenticationType.RelyHandshake, role: AuthRole.Guest, userId: GUEST_ID, scopes: [AUTH_SCOPE],
    })
    for (const field of ['profileId', 'entitySlug', 'source']) {
      expect(field in credential).toBe(false)
    }
  })

  test('a peer record the manager did not sign is refused', async () => {
    const env = await setup()
    const { challenge } = await consumerOf(env)
    const foreign = makeProviderRely()
    const pin = foreign.message().pin!
    await env.context.resource<Resource<TunnelRecord>>(AUTH_CACHE).create({
      id: `${RELY_PIN_PERFIX}${pin}`, challenge: await foreign.sign(env.appKP, EnvelopeKind.Wrap),
    })

    await expect(env.model.authenticate({
      type: AuthenticationType.RelyHandshake, challenge, credential: `${RELY_PIN_PERFIX}${pin}`,
      userId: '', role: AuthRole.Guest, scopes: [AUTH_SCOPE],
    } as AuthCredentials)).rejects.toThrow()
  })
})
