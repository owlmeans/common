import { createService } from '@owlmeans/context'
import type { AbstractRequest, AbstractResponse } from '@owlmeans/entrypoint'
import { assertContext } from '@owlmeans/context'
import { BED255_CASHE_RESOURCE, BED255_DELIVERY_TTL, GUARD_ED25519, BED255_SIG_TTL } from './consts.js'
import { nonceKey, timeKey } from './consts.local.js'
import { trust } from '../../utils/trusted.js'
import type { Config, Context } from '../../utils/types.js'
import type { BasicEd25519Guard, BasicEd25519GuardOptions } from './types.js'
import { AuthenPayloadError, AuthroizationType, AuthRole } from '@owlmeans/auth'
import type { Auth } from '@owlmeans/auth'
import { extractAuthToken } from '@owlmeans/auth-common/utils'
import {
  makeMemorySignedRequestReplayStore, makeResourceSignedRequestReplayStore
} from './replay.js'
import type { SignedRequestReplayResource, SignedRequestReplayStore } from './types.js'
import type { SignedDeliveryWindow } from './types.local.js'
import { signBasicEd25519Request } from './sign.js'
import { signedPayloadOf } from './payload.js'

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

      if (req != null && truested.user.secret != null) {
        const signed = await signBasicEd25519Request({
          body: req.body, credential: truested.user.id, key: truested.key,
        })
        if (req.headers == null) {
          req.headers = {}
        }
        Object.assign(req.headers, signed.headers)

        return signed.authorization
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

      // A streamed-body route reaches its guard with no parsed body: verified as `{}`, as signed.
      if (!await trusted.key.verify(signedPayloadOf(req.body, timestamp, nonce), signature.signature)) {
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

      const now = Date.now()
      const delivery = req.delivery
      // A request the queue delivers is judged fresh at its ENQUEUE — the broker's own record of when
      // it took the job in (never the job's data) — and stays deliverable for the queue's own window
      // (`maxAge`): a job that waited behind a backlog or a deploy gap is not refused for the wait.
      // Without both, and for every HTTP request, the signature is judged at arrival, as always.
      const queued: SignedDeliveryWindow | null = delivery?.enqueuedAt != null && delivery.maxAge != null
        && Number.isFinite(delivery.enqueuedAt) && Number.isFinite(delivery.maxAge) && delivery.maxAge > 0
        ? { enqueuedAt: delivery.enqueuedAt, maxAge: delivery.maxAge } : null
      const expired = queued != null
        ? Math.abs(queued.enqueuedAt - signedAt) > BED255_SIG_TTL || queued.enqueuedAt - now > BED255_SIG_TTL
          || now - queued.enqueuedAt > queued.maxAge
        : Math.abs(now - signedAt) > BED255_SIG_TTL
      if (typeof nonce !== 'string' || nonce.length === 0) {
        throw new AuthenPayloadError(expired ? 'expired' : 'nonce')
      }

      // The replay identity is the signing credential plus its nonce. A nonce used by one trusted
      // service does not block another, while a captured request can be admitted once.
      const claimId = `${signature.credential.length}:${signature.credential}${nonce}`
      const store = replay(context)
      // A queued request names its delivery (`<queue>:<job id>`, set in-process by the queue bridge,
      // never from the wire). Its claim is bound to that job, and only the broker's own redelivery
      // of the SAME job — a later attempt, after a stall or a failed attempt — presents it again
      // and is admitted: the same nonce on another job, or over HTTP, is still a replay.
      const redelivered = async (): Promise<boolean> =>
        delivery != null && delivery.attempt > 1 && store.holder != null
        && await store.holder(claimId) === delivery.id

      if (expired) {
        // Past the window only a redelivery stands, and only where the queue sets no window of its
        // own: its claim proves the job was admitted inside the signature's.
        if (queued != null || !await redelivered().catch(() => false)) {
          throw new AuthenPayloadError('expired')
        }
      } else {
        try {
          // A queued claim outlives every moment a copy of the request could still be admitted: a
          // copy enqueued within the signature's window of its signing stays deliverable for the
          // queue's window after it — so the claim lives that long (and `deliveryTtl` at least).
          const claimed = await store.claim(claimId, delivery != null
            ? new Date(Math.max(
              signedAt + BED255_SIG_TTL + (queued?.maxAge ?? 0),
              now + (opts?.deliveryTtl ?? BED255_DELIVERY_TTL),
            ))
            : new Date(signedAt + BED255_SIG_TTL), delivery?.id)
          if (!claimed && !await redelivered()) {
            throw new AuthenPayloadError('nonce')
          }
        } catch {
          throw new AuthenPayloadError('nonce')
        }
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
