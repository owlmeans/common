import { ProxyError } from '../errors.js'
import { DEFAULT_PROXY_PORTS } from './consts.js'
import type { ProxyEndpoint } from './types.js'

/** A proxy URL (`socks5h://user:pass@host:1080`) read as an endpoint. */
export const parseProxyEndpoint = (value: ProxyEndpoint | string): ProxyEndpoint => {
  if (typeof value !== 'string') {
    return value
  }
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ProxyError('endpoint')
  }
  const type = url.protocol.replace(/:$/, '').toLowerCase()
  const port = url.port !== '' ? Number(url.port) : DEFAULT_PROXY_PORTS[type]
  if (url.hostname === '' || port == null) {
    throw new ProxyError('endpoint')
  }
  const endpoint: ProxyEndpoint = { type, host: url.hostname.replace(/^\[|\]$/g, ''), port }
  if (url.username !== '') {
    endpoint.username = decodeURIComponent(url.username)
    endpoint.password = decodeURIComponent(url.password)
  }

  return endpoint
}
