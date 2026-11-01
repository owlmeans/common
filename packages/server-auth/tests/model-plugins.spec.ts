import { describe, expect, test } from 'bun:test'
import { AuthenFailed, AuthenticationType, AuthRole, AuthUnknown, TypeMissmatchError } from '@owlmeans/auth'
import type { AllowanceResponse, AuthCredentials, AuthToken } from '@owlmeans/auth'
import { authProtocols } from '@owlmeans/auth-common'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import type { BoundEntrypointHandler } from '@owlmeans/server-entrypoint'
import { authenticate, authenticationInit } from '../src/manager/actions/index.js'
import { makeAuthModel } from '../src/manager/index.js'
import { authPluginHelper } from '../src/manager/plugins/utils.js'
import type { AuthPlugin, AuthPluginFactory } from '../src/manager/plugins/types.js'
import { makeTestContext } from './context.js'

/** A type only a private list carries — never handed to `registerPlugin`. */
const PRIVATE = 'model-plugins-private'

/** The private plugin: a unique challenge per request; `'right'` signs `private@example.com` in. */
const privatePlugin: AuthPluginFactory = () => {
  const plugin: AuthPlugin = {
    type: PRIVATE,
    init: async request => {
      authPluginHelper.assertType(request.type, plugin)
      return { challenge: crypto.randomUUID() }
    },
    authenticate: async credential => {
      if (credential.credential !== 'right') {
        throw new AuthenFailed('private')
      }
      credential.userId = 'private@example.com'
      credential.role = AuthRole.User
      credential.scopes = ['private-scope']
      return { token: '' }
    },
  }

  return plugin
}

const setup = async () => {
  const fixture = makeTestContext()
  await fixture.context.configure().init()

  return {
    ...fixture,
    global: makeAuthModel(fixture.context as never),
    exclusive: makeAuthModel(fixture.context as never, { plugins: { [PRIVATE]: privatePlugin } }),
  }
}

/** Run a manager action (`/authentication/*`) the way the API server does, over `body`. */
const viaAction = async <T>(handler: BoundEntrypointHandler<never>, context: unknown, body: unknown): Promise<T> => {
  let resolved: unknown
  let rejected: Error | null = null
  const response = { resolve: (value: unknown) => { resolved = value }, reject: (error: Error) => { rejected = error } }
  await handler.bind({ ref: { ctx: context } } as never)({ body } as never, response as never)
  if (rejected != null) {
    throw rejected
  }

  return resolved as T
}

const credentialOf = (challenge: string, credential = 'right'): AuthCredentials => ({
  type: PRIVATE, challenge, credential, userId: 'caller@example.com', role: AuthRole.User, scopes: [],
} as AuthCredentials)

describe('@owlmeans/server-auth — makeAuthModel with an exclusive plugin list', () => {
  test('a private type is not reachable through the global registry or the generic actions', async () => {
    const env = await setup()

    await expect(authPluginHelper.getPlugin(PRIVATE, env.context as never)).rejects.toBeInstanceOf(AuthUnknown)
    await expect(env.global.init({ type: PRIVATE, userId: 'caller@example.com' })).rejects.toBeInstanceOf(AuthUnknown)
    await expect(viaAction(authenticationInit(authProtocols.init) as never, env.context, { type: PRIVATE, userId: 'u' }))
      .rejects.toBeInstanceOf(AuthUnknown)

    // A challenge the private list issued, presented to the generic path: refused, and left unspent.
    const { challenge } = await env.exclusive.init({ type: PRIVATE, userId: 'caller@example.com' })
    await expect(env.global.authenticate(credentialOf(challenge))).rejects.toBeInstanceOf(AuthUnknown)
    await expect(viaAction(authenticate(authProtocols.authenticate) as never, env.context, credentialOf(challenge)))
      .rejects.toBeInstanceOf(AuthUnknown)
    await expect(env.exclusive.authenticate(credentialOf(challenge))).resolves.toHaveProperty('token')
  })

  test('a globally registered type is refused by a private list', async () => {
    const env = await setup()

    await expect(env.exclusive.init({ type: AuthenticationType.BasicEd25519, userId: 'u' })).rejects.toBeInstanceOf(AuthUnknown)
    await expect(makeAuthModel(env.context as never, { plugins: {} }).init({ type: AuthenticationType.ReCaptcha, userId: 'u' }))
      .rejects.toBeInstanceOf(AuthUnknown)
    await expect(env.exclusive.init({ type: 'constructor', userId: 'u' })).rejects.toBeInstanceOf(AuthUnknown)

    // A challenge of a global type, signed by the generic path, is no key into the private list.
    const { challenge } = await viaAction<AllowanceResponse>(
      authenticationInit(authProtocols.init) as never, env.context, { type: AuthenticationType.BasicEd25519, userId: 'u' }
    )
    await expect(env.exclusive.authenticate({
      type: AuthenticationType.BasicEd25519, challenge, credential: 'x', userId: 'u',
    } as AuthCredentials)).rejects.toBeInstanceOf(AuthUnknown)
  })

  test('a private plugin signs a token through the private list, once per challenge', async () => {
    const env = await setup()
    const { challenge } = await env.exclusive.init({ type: PRIVATE, userId: 'caller@example.com' })

    const { token }: AuthToken = await env.exclusive.authenticate(credentialOf(challenge))
    const envelope = makeEnvelopeModel<AuthCredentials>(token, EnvelopeKind.Token)
    expect(envelope.type()).toBe(PRIVATE)
    expect(envelope.message<AuthCredentials>()).toMatchObject({
      type: PRIVATE, userId: 'private@example.com', role: AuthRole.User, scopes: ['private-scope'],
      credential: env.authServiceRecord.id,
    })

    // The manager burnt the challenge: a replay is refused; a wrong credential is the plugin's refusal.
    await expect(env.exclusive.authenticate(credentialOf(challenge))).rejects.toBeInstanceOf(AuthenFailed)
    const fresh = await env.exclusive.init({ type: PRIVATE, userId: 'caller@example.com' })
    await expect(env.exclusive.authenticate(credentialOf(fresh.challenge, 'wrong'))).rejects.toThrow('private')
    // assertType semantics are the plugin's own: a request naming another type under its key fails.
    await expect(makeAuthModel(env.context as never, { plugins: { alias: privatePlugin } }).init({ type: 'alias', userId: 'u' }))
      .rejects.toBeInstanceOf(TypeMissmatchError)
  })
})
