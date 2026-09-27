import { createService } from '@owlmeans/context'
import type { AbstractRequest, AbstractResponse } from '@owlmeans/entrypoint'
import { assertContext } from '@owlmeans/context'
import {
  BED255_NONCE_HEADER, BED255_TIME_HEADER, BED255_CASHE_RESOURCE, GUARD_ED25519,
  BED255_SIG_TTL
} from './consts.js'
import { trust } from '../../utils/trusted.js'
import type { Config, Context } from '../../utils/types.js'
import type { BasicEd25519Guard, BasicEd25519GuardOptions } from './types.js'
import { AuthenPayloadError, AuthroizationType, AuthRole } from '@owlmeans/auth'
import type { Auth } from '@owlmeans/auth'
import { createIdOfLength } from '@owlmeans/basic-ids'
import { extractAuthToken } from '@owlmeans/auth-common/utils'
import {
  makeMemorySignedRequestReplayStore, makeResourceSignedRequestReplayStore
} from './replay.js'
import type { SignedRequestReplayResource, SignedRequestReplayStore } from './types.js'

const timeKey = BED255_TIME_HEADER.toLocaleLowerCase()
const nonceKey = BED255_NONCE_HEADER.toLocaleLowerCase()

export const makeBasicEd25519Guard = (resource: string, opts?: BasicEd25519GuardOptions): BasicEd25519Guard => {
  const memoryReplay = makeMemorySignedRequestReplayStore()

  const replay = (context: Context): SignedRequestReplayStore => {
    if (opts?.replay != null) {
      return opts.replay
    }
    const alias = opts?.cache ?? BED255_CASHE_RESOURCE
    if (context.hasResource(alias)) {
      return makeResourceSignedRequestReplayStore(
        context.resource<SignedRequestReplayResource>(alias)
      )
    }
    return memoryReplay
  }

  const guard: BasicEd25519Guard = createService<BasicEd25519Guard>(GUARD_ED25519, {
    authenticated: async req => {
      const context = assertContext<Config, Context>(guard.ctx)
      const truested = await trust(context, resource, context.cfg.alias ?? context.cfg.service)

      // req?.body != null 
      if (req != null && truested.user.secret != null) {
        if (req.headers == null) {
          req.headers = {}
        }
        req.headers[timeKey] = new Date().toISOString()
        req.headers[nonceKey] = createIdOfLength(16)

        const payload = {
          body: req.body ?? {},
          headers: { [timeKey]: req.headers[timeKey], [nonceKey]: req.headers[nonceKey] }
        }

        const token = [
          AuthroizationType.Ed25519BasicSignature.toUpperCase()
          , ['Credential', truested.user.id]
          , ['Signature', await truested.key.sign(payload)]
        ]

        return token.map(
          item => Array.isArray(item) ? item.join('=') : item
        ).join(' ')
      }

      return null
    },

    match: async req =>
      extractAuthToken(req, AuthroizationType.Ed25519BasicSignature) != null,

    handle: async <T>(req: AbstractRequest, res: AbstractResponse<Auth>) => {
      const context = assertContext<Config, Context>(guard.ctx)
      const authorization = extractAuthToken(req, AuthroizationType.Ed25519BasicSignature)
      if (authorization == null) {
        return false as T
      }

      const signature = authorization.split(' ', 3).reduce((result, pair) => {
        if (!pair.includes('=')) {
          return result
        }
        const [key, value] = pair.split('=', 2)
        return { ...result, [key.toLowerCase()]: value }
      }, {} as { credential: string, signature: string })

      if (typeof signature.credential !== 'string' || signature.credential.length === 0
        || typeof signature.signature !== 'string' || signature.signature.length === 0) {
        throw new AuthenPayloadError('signature')
      }

      const trusted = await trust(context, resource, signature.credential, "id")
      if (trusted.user.credential == null) {
        return false as T
      }

      const timestamp = req.headers?.[timeKey]
      const nonce = req.headers?.[nonceKey]

      const payload = {
        body: req.body ?? {},
        headers: { [timeKey]: timestamp, [nonceKey]: nonce }
      }

      if (!await trusted.key.verify(payload, signature.signature)) {
        return false as T
      }

      if (typeof timestamp !== 'string') {
        throw new AuthenPayloadError('timestamp')
      }

      const createdAt = new Date(timestamp)
      const signedAt = createdAt.getTime()
      if (!Number.isFinite(signedAt) || createdAt.toISOString() !== timestamp) {
        throw new AuthenPayloadError('timestamp')
      }

      if (Math.abs(Date.now() - signedAt) > BED255_SIG_TTL) {
        throw new AuthenPayloadError('expired')
      }

      if (typeof nonce !== 'string' || nonce.length === 0) {
        throw new AuthenPayloadError('nonce')
      }

      try {
        // The replay identity is the signing credential plus its nonce. A nonce used by one
        // trusted service does not block another, while a captured request can be admitted once.
        const claimed = await replay(context).claim(
          `${signature.credential.length}:${signature.credential}${nonce}`,
          new Date(signedAt + BED255_SIG_TTL)
        )
        if (!claimed) {
          throw new AuthenPayloadError('nonce')
        }
      } catch {
        throw new AuthenPayloadError('nonce')
      }

      res.resolve({
        token: authorization,
        userId: trusted.user.id,
        profileId: trusted.user.id,
        entitySlug: trusted.user.entitySlug,
        scopes: trusted.user.name != null ? [trusted.user.name] : [],
        type: AuthroizationType.Ed25519BasicSignature,
        source: context.cfg.service,
        /**
         * @TODO actually it's not always the case (that the the role is the service)
         */
        role: AuthRole.Service,
        isUser: false,
        createdAt: new Date()
      })

      return true as T
    }
  }, guard => async () => {
    guard.initialized = true
  })

  return guard
}
