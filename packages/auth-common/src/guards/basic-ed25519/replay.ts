import { RecordExists } from '@owlmeans/resource'
import type { SignedRequestReplayResource, SignedRequestReplayStore } from './types.js'

/**
 * Process-local replay protection used when a deployment has not supplied a shared resource.
 * A timer removes each claim at its signed expiry, keeping the fallback bounded by the live
 * replay window rather than by process lifetime.
 */
export const makeMemorySignedRequestReplayStore = (): SignedRequestReplayStore => {
  const claims = new Map<string, number>()

  return {
    claim: async (id, expiresAt) => {
      const now = Date.now()
      const current = claims.get(id)
      if (current != null && current > now) {
        return false
      }

      const expiry = expiresAt.getTime()
      claims.set(id, expiry)
      const timer = setTimeout(() => {
        if (claims.get(id) === expiry) {
          claims.delete(id)
        }
      }, Math.max(0, expiry - now))
      const unref = (timer as unknown as { unref?: () => void }).unref
      unref?.call(timer)

      return true
    }
  }
}

/**
 * Adapt a create-once Resource to signed-request replay protection. Redis resources honour the
 * absolute expiry and make the claim atomic across replicas (`SET NX`); other resource failures
 * remain failures rather than being mistaken for successful claims.
 */
export const makeResourceSignedRequestReplayStore = (
  resource: SignedRequestReplayResource
): SignedRequestReplayStore => ({
  claim: async (id, expiresAt) => {
    try {
      await resource.create({ id }, { ttl: expiresAt })
      return true
    } catch (error) {
      if (error instanceof RecordExists
        || (error as { type?: unknown } | null)?.type === RecordExists.typeName) {
        return false
      }
      throw error
    }
  }
})
