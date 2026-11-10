import { createHash } from 'node:crypto'
import { ProxyStrategy } from '../consts.js'
import { ReaderProxyError } from '../errors.js'
import { netUtils } from '../utils/net.js'
import { createSocksBridge } from './bridge.js'
import type { SocksBridge } from './bridge/types.js'
import type { AddressGuard } from './guard/types.js'
import type { FetchedResource } from './fetcher/types.js'
import { DEFAULT_PROXY_ATTEMPTS, DEFAULT_PROXY_COOLDOWN_MS, DEFAULT_ROTATE_ON } from './proxy/consts.js'
import type { ProxyLease, ProxyPlugin, ProxyPluginOptions, ProxySpec } from './proxy/types.js'

/**
 * The integrated proxy plugin. Every request asks `resolve(key, info)` first — the key is the
 * caller's (a tenant, a crawl session) or the target host — and falls back to the pool, picked by
 * strategy among the proxies not cooling down. A proxy that fails (refused, dropped, wanted
 * credentials, or answered a `rotateOn` status) cools down and the request retries on another,
 * up to `attempts`. HTTP(S) proxies are used directly; SOCKS ones through the local bridge.
 */
export const createProxyPlugin = (options: ProxyPluginOptions = {}): ProxyPlugin => {
  const pool: ProxySpec[] = (options.proxies ?? []).map(proxy => netUtils.parseProxy(proxy))
  const strategy = options.strategy ?? ProxyStrategy.RoundRobin
  const attempts = Math.max(1, options.attempts ?? DEFAULT_PROXY_ATTEMPTS)
  const cooldown = options.cooldown ?? DEFAULT_PROXY_COOLDOWN_MS
  const rotateOn = new Set(options.rotateOn ?? DEFAULT_ROTATE_ON)
  const coolingUntil = new Map<string, number>()
  let cursor = 0
  let guard: AddressGuard | undefined
  let bridge: SocksBridge | undefined

  const hostOf = (url: string): string => {
    try {
      return new URL(url).hostname.toLowerCase()
    } catch {
      return ''
    }
  }

  const healthy = (spec: ProxySpec): boolean => (coolingUntil.get(netUtils.maskProxy(spec)) ?? 0) <= Date.now()

  /** Rendezvous hashing: the key keeps its proxy while that proxy is in the candidate set. */
  const sticky = (key: string, candidates: ProxySpec[]): ProxySpec =>
    candidates.reduce((best, spec) => {
      const score = createHash('sha1').update(`${key}|${netUtils.maskProxy(spec)}`).digest().readUInt32BE(0)
      return score > best.score ? { spec, score } : best
    }, { spec: candidates[0]!, score: -1 }).spec

  const pick = (key: string, failed?: string): ProxySpec | undefined => {
    if (pool.length === 0) return undefined
    const notFailed = pool.filter(spec => netUtils.maskProxy(spec) !== failed)
    const fresh = notFailed.filter(healthy)
    const candidates = fresh.length > 0 ? fresh : notFailed.length > 0 ? notFailed : pool
    switch (strategy) {
      case ProxyStrategy.Random:
        return candidates[Math.floor(Math.random() * candidates.length)]
      case ProxyStrategy.Sticky:
        return sticky(key, candidates)
      default:
        return candidates[cursor++ % candidates.length]
    }
  }

  const leases = new Map<string, ProxyLease>()

  /** One lease per proxy and key, built once: a lease is bound to both. */
  const leaseFor = (spec: ProxySpec, key: string): ProxyLease => {
    const id = netUtils.maskProxy(spec)
    const cacheKey = `${JSON.stringify([spec.protocol, spec.host, spec.port, spec.username ?? '', spec.password ?? ''])}|${key}`
    const known = leases.get(cacheKey)
    if (known != null) return known
    const lease: ProxyLease = {
      id,
      spec,
      endpoint: async () => netUtils.isSocks(spec)
        ? (bridge ??= createSocksBridge({ guard })).endpoint(spec)
        : netUtils.directEndpoint(spec),
      report: outcome => {
        if (outcome.ok) coolingUntil.delete(id)
        else coolingUntil.set(id, Date.now() + cooldown)
        options.onOutcome?.(id, outcome, key)
      },
    }
    leases.set(cacheKey, lease)
    return lease
  }

  const lease: ProxyPlugin['lease'] = async (request, attempt = 0, failed) => {
    const host = hostOf(request.url)
    const key = request.key ?? host
    if (options.resolve != null) {
      const answer = await options.resolve(key, { url: request.url, host, attempt, ...(failed != null ? { failed } : {}) })
      if (answer === 'direct') return undefined
      if (answer != null) return leaseFor(netUtils.parseProxy(answer), key)
    }
    const spec = pick(key, failed)
    return spec != null ? leaseFor(spec, key) : undefined
  }

  const fetch: NonNullable<ProxyPlugin['fetch']> = async (request, next) => {
    let failed: string | undefined
    let lastError: ReaderProxyError | undefined
    let lastResponse: FetchedResource | undefined
    for (let attempt = 0; attempt < attempts; ++attempt) {
      const chosen = request.lease ?? await lease(request, attempt, failed)
      if (chosen == null) return next(request)
      try {
        const response = await next({ ...request, lease: chosen })
        if (rotateOn.has(response.status)) {
          chosen.report({ ok: false, status: response.status, reason: `status-${response.status}` })
          failed = chosen.id
          lastResponse = response
          lastError = Object.assign(new ReaderProxyError(`status-${response.status}`), { proxy: chosen.id, status: response.status })
          if (request.lease != null) break
          continue
        }
        chosen.report({ ok: true, status: response.status })
        return response
      } catch (e) {
        if (!(e instanceof ReaderProxyError)) throw e
        e.proxy ??= chosen.id
        chosen.report({ ok: false, reason: e.message })
        failed = chosen.id
        lastError = e
        lastResponse = undefined
        if (request.lease != null) break
      }
    }
    // A target that refused every exit still answered — its page goes back. A proxy that never
    // carried the request (or wanted credentials) is a failure.
    if (lastResponse != null && lastResponse.status !== 407) return lastResponse
    throw lastError ?? new ReaderProxyError('exhausted')
  }

  const close = async (): Promise<void> => {
    const open = bridge
    bridge = undefined
    leases.clear()
    await open?.close()
  }

  return {
    name: 'proxy',
    attach: context => {
      guard = context.guard
    },
    lease,
    fetch,
    close,
  }
}
