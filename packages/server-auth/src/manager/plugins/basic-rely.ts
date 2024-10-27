import { AuthenFailed, AuthenPayloadError, AuthenticationType, AuthManagerError, AuthorizationError } from '@owlmeans/auth'
import type { AllowanceResponse, Auth, RelyToken } from '@owlmeans/auth'
import type { AppContext, RelyAllowanceRequest, RelyCarrier } from '../types.js'
import type { AuthPlugin, AuthRedisResource, RelyRecord } from './types.js'
import { makeConsumerRely, makeProviderRely } from '../../model/index.js'
import { trusted } from '../utils/trusted.js'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import { AUTH_CACHE, RELY_TIMEFRAME } from '../../consts.js'
import { ResourceError } from '@owlmeans/resource'
import { RELY_PIN_PERFIX, RELY_TOKEN_PREFIX } from '@owlmeans/auth-common'

const _subscriptions: Record<string, CallableFunction> = {}
export const basicRely = (context: AppContext, type?: string): AuthPlugin => {
  const plugin: AuthPlugin = {
    type: type ?? AuthenticationType.RelyHandshake,

    // This method is used by consumer and by provider (wallet)
    // to initialize shared authentication process.
    // The idea is that both subscribe to wait for a handshake value
    // from the peer, that in fact is a subscription to a redis message tunnel.  
    init: async (request: RelyAllowanceRequest): Promise<AllowanceResponse> => {
      const [, keyPair] = await trusted(context)
      const tunnel = context.resource<AuthRedisResource>(AUTH_CACHE)
      let relyMsg: RelyToken
      do {
        try {
          const rely = request.auth == null ? makeConsumerRely() : makeProviderRely()

          relyMsg = rely.message()
          const pin = relyMsg.pin != null ? `${RELY_PIN_PERFIX}${relyMsg.pin}` : null
          const token = relyMsg.token != null ? `${RELY_TOKEN_PREFIX}${relyMsg.token}` : null

          const response = { challenge: await rely.sign(keyPair, EnvelopeKind.Wrap) }

          if (pin != null) {
            await tunnel.create({ ...response, id: pin }, { ttl: RELY_TIMEFRAME })
          }
          if (token != null) {
            await tunnel.create({ ...response, id: token }, { ttl: RELY_TIMEFRAME })
          }

          if (request.provideRely != null) {
            await Promise.all([pin, token].filter(key => key != null).map(async key => {
              _subscriptions[key] = await tunnel.subscribe(async value => {
                console.log('Receive rely from remote: ', value)
                const rely = makeEnvelopeModel<RelyToken>(value.challenge, EnvelopeKind.Wrap)
                if (await rely.verify(keyPair)) {
                  [pin, token].filter(key => key != null).forEach(key => _subscriptions[key]?.())
                  await request.provideRely?.(rely.message(), relyMsg, true)
                }
              }, { ttl: RELY_TIMEFRAME, key, once: true })

              // @TODO they need to be killed on close - but actually live a little bit longer 
              // than timeout for them is ok
              setTimeout(() => {
                try {
                  if (_subscriptions[key] != null) {
                    void _subscriptions[key]()
                    delete _subscriptions[key]
                  }
                } catch { }
              }, RELY_TIMEFRAME * 2)
            }))
          }

          return response
        } catch (e) {
          if (e instanceof ResourceError) {
            console.error('COLISION ON TRY TO CREATE RELY PIN\TOKEN...', e)
          } else {
            throw e
          }
        }
        await new Promise(resolve => setTimeout(resolve, 500))
      } while (true)
    },

    // This part of flow is entered by the party that is active (provides peer's code - token or pin)
    authenticate: async credential => {
      const [, keyPair] = await trusted(context)
      const tunnel = context.resource<AuthRedisResource>(AUTH_CACHE)

      // 1. Just get a peer connection based on provided credential
      // 2. Provision it with provided own data
      // 3. Delete own rely connection seeds

      console.log('~~~~ ENTERING RELY AUTH BY 3', credential)

      let rely: RelyToken
      try {
        let peer: RelyRecord
        if (credential.credential.startsWith(RELY_PIN_PERFIX)) {
          const key = credential.credential.substring(RELY_PIN_PERFIX.length)
          if (key.length > 12) {
            throw new AuthenPayloadError('pin')
          }
          peer = await tunnel.get(credential.credential)
        } else if (credential.credential.startsWith(RELY_TOKEN_PREFIX)) {
          const key = credential.credential.substring(RELY_PIN_PERFIX.length)
          if (key.length > 16) {
            throw new AuthenPayloadError('token')
          }
          peer = await tunnel.get(credential.credential)
        } else {
          throw new AuthenPayloadError('credential')
        }
        const envelop = makeEnvelopeModel<RelyToken>(peer.challenge, EnvelopeKind.Wrap)
        if (!envelop.verify(keyPair)) {
          throw new AuthManagerError()
        }
        rely = envelop.message()
      } catch (e) {
        if (e instanceof ResourceError) {
          console.error(e)
          throw new AuthorizationError('rely')
        } else {
          throw e
        }
      }

      const myChallenge = makeEnvelopeModel<RelyToken>(credential.challenge, EnvelopeKind.Wrap)
      if (!myChallenge.verify(keyPair)) {
        throw new AuthenFailed()
      }

      await tunnel.update({ id: credential.credential, challenge: myChallenge.wrap() })

      const myRely = myChallenge.message();

      [
        myRely.pin != null ? `${RELY_PIN_PERFIX}${myRely.pin}` : null,
        myRely.token != null ? `${RELY_TOKEN_PREFIX}${myRely.token}` : null
      ].filter(key => key != null).forEach(key => {
        if (_subscriptions[key] != null) {
          void _subscriptions[key]()
          delete _subscriptions[key]
        }
      })

      const token = makeEnvelopeModel<RelyCarrier>(AuthenticationType.RelyHandshake)
      token.send({ source: myRely, rely })

      credential.type = AuthenticationType.RelyHandshake

      // @TODO think about it: we create a mixed object here that is credentials and authentication
      // in the same time. Actually it's a bit dirty. And it means that auth service at the end of the
      // day can produce both (authentication token and authentication token "ticket").
      // Why we do it this way here: cause the consumer of authentication is the auth service itself
      // and there is no need to "exchange" the token (what we do when we come via url redirect to another service
      // with the one-time auth token potentially exposed as a result).
      const _auth: Auth = credential as unknown as Auth
      _auth.createdAt = new Date()
      _auth.token = token.tokenize()
      _auth.isUser = true

      return { token: _auth.token }
    }
  }

  return plugin
}
