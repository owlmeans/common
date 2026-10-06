/**
 * A small keyed TTL cache with in-flight de-duplication — the client-side twin of
 * `@owlmeans/server-payment`'s `EstimateCache`, so opening the credit dialog twice in a row (or two
 * mounts asking for the same plan/country) never issues a second request while the first is still
 * on the wire, and a settled answer is reused for its TTL. A rejected fetch is never cached: the
 * next call simply tries again.
 */
export class EstimateCache<T> {
  private readonly store = new Map<string, { value: T, expiresAt: number }>()
  private readonly inflight = new Map<string, Promise<T>>()

  get(key: string): T | undefined {
    const hit = this.store.get(key)
    if (hit == null || hit.expiresAt <= Date.now()) {
      return undefined
    }
    return hit.value
  }

  async load(key: string, ttlMs: number, factory: () => Promise<T>): Promise<T> {
    const hit = this.get(key)
    if (hit !== undefined) {
      return hit
    }
    const pending = this.inflight.get(key)
    if (pending != null) {
      return pending
    }
    const promise = factory().then(value => {
      this.store.set(key, { value, expiresAt: Date.now() + ttlMs })
      this.inflight.delete(key)
      return value
    }).catch(error => {
      this.inflight.delete(key)
      throw error
    })
    this.inflight.set(key, promise)
    return promise
  }
}
