import { createHash } from 'node:crypto'
import { logger } from '@owlmeans/log'
import { ProxyError } from '../errors.js'
import { redactUtils } from '../utils/redact.js'
import { DEFAULT_PROXY_COOLDOWN_MS, DEFAULT_PROXY_RETRIES } from './consts.js'
import { parseProxyEndpoint } from './endpoint.js'
import { httpProxyPlugin } from './http.js'
import { socksProxyPlugin } from './socks.js'
import type { ProxyEndpoint, ProxyRequest, ProxyRouter, ProxyRouterOptions, ProxySelection } from './types.js'

const log = logger('file-streams:proxy')

/** Chooses a proxy per connection from a list (with a strategy) or a provider callback. */
export const createProxyRouter = (options: ProxyRouterOptions = {}): ProxyRouter => {
  const plugins = [...(options.plugins ?? []), httpProxyPlugin, socksProxyPlugin]
  const list = Array.isArray(options.proxies) ? options.proxies.map(parseProxyEndpoint) : undefined
  const cooldownMs = options.cooldownMs ?? DEFAULT_PROXY_COOLDOWN_MS
  const cooling = new Map<string, number>()
  let cursor = 0

  const idOf = (endpoint: ProxyEndpoint): string => redactUtils.proxy(endpoint)

  const bypassed = (url: URL): boolean => {
    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
    return options.bypass?.some(rule => {
      const pattern = rule.toLowerCase()
      return pattern.startsWith('*.') ? host.endsWith(pattern.slice(1)) : host === pattern
    }) === true
  }

  const fromList = (members: ProxyEndpoint[], request: ProxyRequest): ProxyEndpoint => {
    const now = Date.now()
    const warm = members.filter(member => (cooling.get(idOf(member)) ?? 0) <= now)
    const pool = warm.length > 0 ? warm : members
    switch (options.strategy) {
      case 'random':
        return pool[Math.floor(Math.random() * pool.length)]
      case 'failover':
        return pool[0]
      case 'by-key':
        if (request.key != null) {
          const index = createHash('sha256').update(request.key).digest().readUInt32BE(0) % members.length
          const sticky = members[index]
          return pool.includes(sticky) ? sticky : pool[index % pool.length]
        }
        return pool[cursor++ % pool.length]
      default:
        return pool[cursor++ % pool.length]
    }
  }

  const select = async (request: ProxyRequest): Promise<ProxySelection | null> => {
    if (options.proxies == null || bypassed(request.url)) {
      return null
    }
    let endpoint: ProxyEndpoint
    if (list != null) {
      if (list.length === 0) {
        return null
      }
      endpoint = fromList(list, request)
    } else {
      const provided = await (options.proxies as Exclude<ProxyRouterOptions['proxies'], unknown[] | undefined>)(request)
      if (provided == null) {
        return null
      }
      endpoint = parseProxyEndpoint(provided)
    }
    if (endpoint.username == null && options.credentials != null) {
      const credentials = await options.credentials(endpoint, request)
      if (credentials != null) {
        endpoint = { ...endpoint, username: credentials.username, password: credentials.password }
      }
    }
    const plugin = plugins.find(candidate => candidate.types.includes(endpoint.type))
    if (plugin == null) {
      throw new ProxyError('no-plugin')
    }

    return { endpoint, plugin }
  }

  const report = (endpoint: ProxyEndpoint, ok: boolean): void => {
    if (ok) {
      cooling.delete(idOf(endpoint))
      return
    }
    cooling.set(idOf(endpoint), Date.now() + cooldownMs)
    log.warn('Proxy failed, cooling down', { proxy: idOf(endpoint), cooldownMs })
  }

  return { retries: options.retries ?? DEFAULT_PROXY_RETRIES, select, report }
}
