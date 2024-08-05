import { AuthenFailed, AuthenPayloadError, AuthenticationType, AuthManagerError, AuthorizationError } from '@owlmeans/auth'
import type { AllowanceResponse, RelyChallenge } from '@owlmeans/auth'
import type { AppContext, RelyAllowanceRequest, RelyToken } from '../types.js'
import type { AuthPlugin, AuthRedisResource, RelyRecord } from './types.js'
import { makeConsumerRely, makeProviderRely } from '../../model/index.js'
import { trusted } from '../utils/trusted.js'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import { AUTH_CACHE, RELY_TIMEFRAME } from '../../consts.js'
import { RELY_PIN_PERFIX, RELY_TOKEN_PREFIX } from '../consts.js'
import { ResourceError } from '@owlmeans/resource'

const _subscriptions: Record<string, CallableFunction> = {}
export const basicRely = (context: AppContext, type?: string): AuthPlugin => {
  const plugin: AuthPlugin = {
    type: type ?? AuthenticationType.RelyHandshake,

    init: async (request: RelyAllowanceRequest): Promise<AllowanceResponse> => {
      const [, keyPair] = await trusted(context)
      const tunnel = context.resource<AuthRedisResource>(AUTH_CACHE)
      let relyMsg: RelyChallenge
      do {
        try {
          const rely = request.auth == null ? makeConsumerRely() : makeProviderRely()

          relyMsg = rely.message()
          const pin = relyMsg.pin != null ? `${RELY_PIN_PERFIX}${relyMsg.pin}` : null
          const token = relyMsg.token != null ? `${RELY_TOKEN_PREFIX}${relyMsg.token}` : null

          const response = { challenge: await rely.sign(keyPair, EnvelopeKind.Wrap) }

          if (pin != null) {
            await tunnel.create({ ...response, id: pin })
          }
          if (token != null) {
            await tunnel.create({ ...response, id: token })
          }

          if (request.provideRely != null) {
            await Promise.all([pin, token].filter(key => key != null).map(async key => {
              _subscriptions[key] = await tunnel.subscribe(async (value) => {
                const rely = makeEnvelopeModel<RelyChallenge>(value.challenge, EnvelopeKind.Wrap)
                if (await rely.verify(keyPair)) {
                  [pin, token].filter(key => key != null).forEach(key => _subscriptions[key]?.())
                  await request.provideRely?.(rely.message(), relyMsg)
                }
              }, { ttl: RELY_TIMEFRAME, key, once: true })
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

    authenticate: async credential => {
      const [, keyPair] = await trusted(context)
      const tunnel = context.resource<AuthRedisResource>(AUTH_CACHE)

      // 1. Just get a peer connection based on provided credential
      // 2. Provision it with provided own data
      // 3. Delete own rely connection seeds

      let rely: RelyChallenge
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
        const envelop = makeEnvelopeModel<RelyChallenge>(peer.challenge, EnvelopeKind.Wrap)
        if (!envelop.verify(keyPair)) {
          throw new AuthManagerError()
        }
        rely = envelop.message()
      } catch (e) {
        if (e instanceof ResourceError) {
          throw new AuthorizationError('rely')
        } else {
          throw e
        }
      }

      const myChallenge = makeEnvelopeModel<RelyChallenge>(credential.challenge, EnvelopeKind.Wrap)
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
          _subscriptions[key]()
        }
      })

      const token = makeEnvelopeModel<RelyToken>(AuthenticationType.RelyHandshake)
      token.send({ source: myRely, rely })

      credential.type = AuthenticationType.RelyHandshake

      return { token: token.tokenize() }
    }
  }

  return plugin
}
