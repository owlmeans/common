import { ReaderConfigError, ReaderProxyError, ReaderRefusedError } from '../errors.js'
import { netUtils } from '../utils/net.js'
import type { HttpProxyEndpoint } from './proxy/types.js'
import type { FetchTransport, FetchTransportOptions, TransportRequest, Undici } from './transport/types.js'

/**
 * `NO_PROXY` as the process started with it: Bun reads it once at startup and then sends a
 * matching request DIRECT even when an explicit `proxy` is given — a silent leak of the server's
 * own address. Matched alongside the live value, so deleting the variable later does not hide it.
 */
const STARTUP_NO_PROXY = typeof process !== 'undefined' ? process.env.NO_PROXY ?? process.env.no_proxy : undefined

export const createFetchTransport = (options: FetchTransportOptions = {}): FetchTransport => {
  let undici: Promise<Undici> | undefined
  const agents = new Map<string, InstanceType<Undici['ProxyAgent']>>()

  const portOf = (url: URL): string => url.port !== '' ? url.port : url.protocol === 'https:' ? '443' : '80'

  /** A proxied request the runtime would quietly send direct is refused instead. */
  const failClosed = (request: TransportRequest): void => {
    if (request.endpoint == null) return
    const url = new URL(request.url)
    const port = portOf(url)
    if (netUtils.noProxyMatches(url.hostname, port)
      || (STARTUP_NO_PROXY != null && netUtils.noProxyMatches(url.hostname, port, STARTUP_NO_PROXY))) {
      throw new ReaderProxyError(`no-proxy-bypass:${url.hostname}`)
    }
  }

  const sendBun = async ({ url, headers, signal, endpoint }: TransportRequest): Promise<Response> =>
    fetch(url, {
      headers,
      signal,
      redirect: 'manual',
      ...(endpoint != null
        ? { proxy: endpoint.headers != null ? { url: endpoint.url, headers: endpoint.headers } : endpoint.url }
        : {}),
      // Bun reuses a plain-HTTP proxy connection across credentials; the bridge routes by them.
      ...(endpoint?.bridged === true ? { keepalive: false } : {}),
    } as RequestInit)

  const agentFor = (mod: Undici, endpoint: HttpProxyEndpoint): InstanceType<Undici['ProxyAgent']> => {
    let agent = agents.get(endpoint.url)
    if (agent == null) {
      agent = new mod.ProxyAgent({
        uri: endpoint.url,
        ...(endpoint.headers != null ? { headers: endpoint.headers } : {}),
        // The bridge speaks CONNECT for every target; an upstream HTTP proxy keeps absolute-form
        // for plain HTTP (many allow CONNECT to 443 only).
        ...(endpoint.bridged ? { proxyTunnel: true } : {}),
      })
      agents.set(endpoint.url, agent)
    }
    return agent
  }

  const sendNode = async ({ url, headers, signal, endpoint }: TransportRequest): Promise<Response> => {
    const mod = await (undici ??= import('undici'))
    const response = await mod.fetch(url, {
      headers,
      signal,
      redirect: 'manual',
      ...(endpoint != null ? { dispatcher: agentFor(mod, endpoint) } : {}),
    })

    return response as unknown as Response
  }

  /** Through the injected fetch: its pinning is the connect-time check the guard cannot be on its own. */
  const sendInjected = async (injected: NonNullable<FetchTransportOptions['fetch']>, { url, headers, signal, endpoint }: TransportRequest): Promise<Response> => {
    if (endpoint != null) throw new ReaderConfigError('injected-fetch-proxy')
    try {
      return await injected(url, { method: 'GET', headers, signal, redirect: 'manual' })
    } catch (e) {
      if ((e as { refused?: unknown } | null)?.refused !== true) throw e
      const refused = new ReaderRefusedError(`pinned:${(e as Error).message}`)
      refused.cause = e
      throw refused
    }
  }

  const send = async (request: TransportRequest): Promise<Response> => {
    if (options.fetch != null) return sendInjected(options.fetch, request)
    failClosed(request)
    return netUtils.isBun() ? sendBun(request) : sendNode(request)
  }

  const close = async (): Promise<void> => {
    const open = [...agents.values()]
    agents.clear()
    await Promise.all(open.map(agent => agent.close().catch(() => undefined)))
  }

  return { send, close }
}
