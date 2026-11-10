import { ReaderConfigError } from '../errors.js'
import type { HttpProxyEndpoint, ProxyProtocol, ProxySpec } from '../fetch/proxy/types.js'
import type { NetUtils } from './net/types.js'

const PROTOCOLS: ReadonlySet<string> = new Set(['http', 'https', 'socks4', 'socks4a', 'socks5', 'socks5h'])

const DEFAULT_PORTS: Readonly<Record<string, number>> = Object.freeze({
  http: 80, https: 443, socks4: 1080, socks4a: 1080, socks5: 1080, socks5h: 1080,
})

export const createNetUtils = (): NetUtils => {
  const isBun = (): boolean => typeof process !== 'undefined' && process.versions?.bun != null

  const noProxyMatches = (host: string, port: string, list?: string): boolean => {
    const raw = list ?? process.env.NO_PROXY ?? process.env.no_proxy ?? ''
    const lower = host.toLowerCase()

    return raw.split(/[\s,]+/).filter(entry => entry.length > 0).some(entry => {
      if (entry === '*') return true
      const [name = '', entryPort] = entry.toLowerCase().split(/:(?=\d+$)/)
      if (entryPort != null && entryPort !== port) return false
      const bare = name.replace(/^\*?\./, '')
      return lower === bare || lower.endsWith(`.${bare}`)
    })
  }

  const parseProxy = (input: string | ProxySpec): ProxySpec => {
    if (typeof input !== 'string') {
      if (!PROTOCOLS.has(input.protocol)) throw new ReaderConfigError(`proxy-protocol:${input.protocol}`)
      return input
    }
    const text = input.trim()
    if (!text.includes('://')) {
      // host:port[:user:pass] — the provider-panel export format; plain HTTP.
      const [host, port, username, ...rest] = text.split(':')
      if (host == null || port == null || !/^\d+$/.test(port)) throw new ReaderConfigError('proxy-format')
      return {
        protocol: 'http', host, port: Number(port),
        ...(username != null ? { username, password: rest.join(':') } : {}),
      }
    }
    let url: URL
    try {
      url = new URL(text)
    } catch {
      throw new ReaderConfigError('proxy-format')
    }
    const protocol = url.protocol.replace(/:$/, '').toLowerCase()
    if (!PROTOCOLS.has(protocol)) throw new ReaderConfigError(`proxy-protocol:${protocol}`)

    return {
      protocol: protocol as ProxyProtocol,
      host: url.hostname.replace(/^\[|\]$/g, ''),
      port: url.port !== '' ? Number(url.port) : DEFAULT_PORTS[protocol]!,
      ...(url.username !== '' ? { username: decodeURIComponent(url.username) } : {}),
      ...(url.password !== '' ? { password: decodeURIComponent(url.password) } : {}),
    }
  }

  const hostPart = (host: string): string => host.includes(':') ? `[${host}]` : host

  const maskProxy = (spec: ProxySpec): string =>
    spec.id ?? `${spec.protocol}://${spec.username != null ? `${spec.username}:***@` : ''}${hostPart(spec.host)}:${spec.port}`

  const directEndpoint = (spec: ProxySpec): HttpProxyEndpoint => {
    const server = `${spec.protocol}://${hostPart(spec.host)}:${spec.port}`
    const auth = spec.username != null
      ? `${encodeURIComponent(spec.username)}:${encodeURIComponent(spec.password ?? '')}@`
      : ''

    return {
      url: `${spec.protocol}://${auth}${hostPart(spec.host)}:${spec.port}`,
      server,
      ...(spec.username != null ? { username: spec.username, password: spec.password ?? '' } : {}),
      ...(spec.headers != null ? { headers: spec.headers } : {}),
      bridged: false,
    }
  }

  const isSocks = (spec: ProxySpec): boolean => spec.protocol.startsWith('socks')

  return { isBun, noProxyMatches, parseProxy, maskProxy, directEndpoint, isSocks }
}

export const netUtils = createNetUtils()
