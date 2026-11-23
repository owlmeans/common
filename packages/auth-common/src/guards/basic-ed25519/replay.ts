import { RecordExists } from '@owlmeans/resource'
import type { SignedRequestReplayResource, SignedRequestReplayStore } from './types.js'
import type { MemoryReplayClaim, SignedRequestClaim } from './types.local.js'

/**
 * Process-local replay protection used when a deployment has not supplied a shared resource.
 * A timer removes each claim at its signed expiry, keeping the fallback bounded by the live
 * replay window rather than by process lifetime.
 */
export const makeMemorySignedRequestReplayStore = (): SignedRequestReplayStore => {
  const claims = new Map<string, MemoryReplayClaim>()

  const live = (id: string): MemoryReplayClaim | null => {
    const current = claims.get(id)
    return current != null && current.expiry > Date.now() ? current : null
  }

  return {
    claim: async (id, expiresAt, owner) => {
      if (live(id) != null) {
        return false
      }

      const now = Date.now()
      const expiry = expiresAt.getTime()
      const claim: MemoryReplayClaim = owner != null ? { expiry, owner } : { expiry }
      claims.set(id, claim)
      const timer = setTimeout(() => {
        if (claims.get(id) === claim) {
          claims.delete(id)
        }
      }, Math.max(0, expiry - now))
      const unref = (timer as unknown as { unref?: () => void }).unref
      unref?.call(timer)

      return true
    },

    holder: async id => live(id)?.owner ?? null,
  }
}

/**
 * Adapt a create-once Resource to signed-request replay protection. Redis resources honour the
 * absolute expiry and make the claim atomic across replicas (`SET NX`); other resource failures
 * remain failures rather than being mistaken for successful claims. The claim's `owner` is stored
 * on the record, and read back through `load` when the resource has one.
 */
export const makeResourceSignedRequestReplayStore = (
  resource: SignedRequestReplayResource
): SignedRequestReplayStore => {
  const store: SignedRequestReplayStore = {
    claim: async (id, expiresAt, owner) => {
      try {
        // The owner rides the record beside its id: a claim is a plain record to the resource.
        const record: SignedRequestClaim = owner != null ? { id, owner } : { id }
        await resource.create(record, { ttl: expiresAt })
        return true
      } catch (error) {
        if (error instanceof RecordExists
          || (error as { type?: unknown } | null)?.type === RecordExists.typeName) {
          return false
        }
        throw error
      }
    },
  }
  if (resource.load != null) {
    store.holder = async id => {
      const owner = (await resource.load?.(id) as { owner?: unknown } | null | undefined)?.owner
      return typeof owner === 'string' && owner !== '' ? owner : null
    }
  }

  return store
}
