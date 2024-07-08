import type { ServerContext, ServerConfig } from '@owlmeans/server-context'
import { AUTH_SRV_KEY, AUTHEN_TIMEFRAME, DEFAULT_ALIAS } from './consts.js'
import type { AuthServiceAppend, AuthService } from './types.js'
import { assertContext, createService } from '@owlmeans/context'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import { fromPubKey, makeKeyPairModel } from '@owlmeans/basic-keys'
import type { Auth, AuthCredentials } from '@owlmeans/auth'
import { AuthenFailed, AuthroizationType } from '@owlmeans/auth'
import type { AbstractRequest, AbstractResponse } from '../../module/build/types.js'
import { AUTH_HEADER } from '@owlmeans/auth'

type Config = ServerConfig
type Context = ServerContext<Config>

export const makeAuthService = (alias: string = DEFAULT_ALIAS): AuthService => {
  const location = `server-auth:${alias}`

  const _keyPair = (context: Context) => {
    const trustedUser = context.cfg.trusted.find(trusted => trusted.name === context.cfg.service)
    if (trustedUser == null || trustedUser.secret == null) {
      throw new SyntaxError(`Auth service trusted entity secret not provided: ${AUTH_SRV_KEY}`)
    }

    return makeKeyPairModel(trustedUser.secret)
  }

  const service: AuthService = createService<AuthService>(alias, {
    match: async (req) => {
      let authorization = req.headers[AUTH_HEADER]
      authorization = Array.isArray(authorization) ? authorization[0] : authorization

      return authorization?.startsWith(AuthroizationType.Ed25519BasicToken.toUpperCase())
        ?? false
    },

    handle: async <T>(req: AbstractRequest, res: AbstractResponse<Auth>) => {
      let authorization = req.headers[AUTH_HEADER]
      authorization = Array.isArray(authorization) ? authorization[0] : authorization
      if (typeof authorization !== 'string') {
        return false as T
      }
      [, authorization] = authorization.split(' ')

      const envelope = makeEnvelopeModel(authorization, EnvelopeKind.Token)

      if (!await envelope.verify(_keyPair(service.ctx as Context))) {
        return false as T
      }

      res.resolve(envelope.message<Auth>())

      return true as T
    },

    authenticate: async (token) => {
      const context = assertContext<Config, Context>(service.ctx as Context, location)
      const trustedUser = context.cfg.trusted.find(trusted => trusted.name === AUTH_SRV_KEY)
      if (trustedUser == null || trustedUser.credential == null) {
        throw new SyntaxError(`Auth service trusted entity secret not provided: ${AUTH_SRV_KEY}`)
      }

      const envelope = makeEnvelopeModel(token.token, EnvelopeKind.Token)

      if (!await envelope.verify(fromPubKey(trustedUser.credential))) {
        throw new AuthenFailed()
      }

      const credentials = envelope.message<AuthCredentials>()
      const msg = credentials.challenge

      // @TODO This operation is not atomic in case of redis store usage and scling
      if (store.has(msg)) {
        throw new AuthenFailed()
      }
      store.add(msg)

      // Clean up expired challenges
      setTimeout(() => {
        store.delete(msg)

        console.log('Clean up token lock: ' + msg)
      }, AUTHEN_TIMEFRAME) // @TODO It lives longer than it's lifetime

      if (credentials.credential !== trustedUser.id) {
        throw new AuthenFailed()
      }

      // @TODO Move to a plugin
      const auth: Auth = {
        token: credentials.challenge,
        userId: credentials.userId,
        scopes: credentials.scopes,
        role: credentials.role,
        type: AuthroizationType.Ed25519BasicToken,
        source: context.cfg.service,
        profileId: credentials.profileId,
        entityId: credentials.entityId,
        isUser: true,
        createdAt: new Date().toISOString()
      }

      const authorization = await makeEnvelopeModel(AuthroizationType.Ed25519BasicToken)
        .send(auth).sign(_keyPair(service.ctx as Context), EnvelopeKind.Token)

      return { token: `${AuthroizationType.Ed25519BasicToken.toUpperCase()} ${authorization}` }
    }
  }, service => async () => { service.initialized = true })

  return service
}

export const appendAuthService = <C extends Config, T extends ServerContext<C>>(
  ctx: T, alias: string = DEFAULT_ALIAS
): T & AuthServiceAppend => {
  const service = makeAuthService(alias)
  console.log('Append auth service')
  const context = ctx as T & AuthServiceAppend

  context.registerService(service)
  context.auth = () => ctx.service(service.alias)

  return context
}

const store = new Set<string>()
