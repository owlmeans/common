import { createService } from '@owlmeans/context'
import type { AbstractRequest, AbstractResponse } from '@owlmeans/module'
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
import type { Resource, ResourceRecord } from '@owlmeans/resource'
import { extractAuthToken } from '@owlmeans/auth-common/utils'

const timeKey = BED255_TIME_HEADER.toLocaleLowerCase()
const nonceKey = BED255_NONCE_HEADER.toLocaleLowerCase()

/**
 * Proper configuration:
 * - One needs to specify opts.cache as a redis resource that stores nonces for a while to
 * avoid requests duplication.
 */
export const makeBasicEd25519Guard = (resource: string, opts?: BasicEd25519GuardOptions): BasicEd25519Guard => {

  const cache = (context: Context) => context.hasResource(opts?.cache ?? BED255_CASHE_RESOURCE)
    ? context.resource<Resource<ResourceRecord>>(opts?.cache ?? BED255_CASHE_RESOURCE)
    : null

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

        // console.log('@@@@@@@@', payload, token)

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
        // console.log(1)
        return false as T
      }

      const signature = authorization.split(' ', 3).reduce((result, pair) => {
        if (!pair.includes('=')) {
          return result
        }
        const [key, value] = pair.split('=', 2)
        return { ...result, [key.toLowerCase()]: value }
      }, {} as { credential: string, signature: string })

      const trusted = await trust(context, resource, signature.credential, "id")
      if (trusted.user.credential == null) {
        // console.log(2, trusted.user)
        return false as T
      }

      const payload = {
        body: req.body ?? {},
        headers: { [timeKey]: req.headers[timeKey], [nonceKey]: req.headers[nonceKey] }
      }

      if (!await trusted.key.verify(payload, signature.signature)) {
        // console.log(payload, signature)
        // console.log(3)
        return false as T
      }

      if (typeof req.headers[timeKey] !== 'string') {
        // console.log(4)
        throw new AuthenPayloadError('timestamp')
      }

      const createdAt = new Date(req.headers[timeKey])

      if (createdAt.getTime() + BED255_SIG_TTL < Date.now()) {
        // console.log(5)
        throw new AuthenPayloadError('expired')
      }

      const nonce = req.headers[nonceKey]
      if (typeof nonce !== 'string') {
        // console.log(6)
        throw new AuthenPayloadError('nonce')
      }

      try {
        const tried = cache(context)
        if (tried != null) {
          await tried.create({ id: nonce }, { ttl: BED255_SIG_TTL / 1000 })
        }
      } catch {
        // console.log(7)
        throw new AuthenPayloadError('nonce')
      }

      res.resolve({
        token: authorization,
        userId: trusted.user.id,
        profileId: trusted.user.id,
        entityId: trusted.user.entityId,
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
