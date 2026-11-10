import { randomBytes, timingSafeEqual } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { createServer, isIP, type Server, type Socket } from 'node:net'
import { SocksClient } from 'socks'
import { ReaderRefusedError } from '../errors.js'
import type { HttpProxyEndpoint, ProxySpec } from './proxy/types.js'
import { BRIDGE_ERROR_HEADER, BRIDGE_REFUSED_HEADER, MAX_HEAD_BYTES, SOCKS_CONNECT_TIMEOUT_MS } from './bridge/consts.js'
import type { SocksBridge, SocksBridgeOptions } from './bridge/types.js'
import type { Route } from './bridge/types.local.js'

const reply = (socket: Socket, status: string, headers: Record<string, string> = {}): void => {
  const lines = Object.entries({ ...headers, 'content-length': '0', connection: 'close' }).map(([k, v]) => `${k}: ${v}`)
  socket.end(`HTTP/1.1 ${status}\r\n${lines.join('\r\n')}\r\n\r\n`)
}

/** Header names never forwarded to an origin. */
const HOP_BY_HOP = new Set(['proxy-authorization', 'proxy-connection', 'connection', 'keep-alive'])

export const createSocksBridge = (options: SocksBridgeOptions = {}): SocksBridge => {
  const routes = new Map<string, Route>()
  const bySpec = new Map<string, Route>()
  let server: Server | undefined
  let listening: Promise<number> | undefined

  const routeOf = (header: string | undefined): Route | undefined => {
    const [scheme, token] = (header ?? '').trim().split(/\s+/)
    if (scheme?.toLowerCase() !== 'basic' || token == null) return undefined
    const decoded = Buffer.from(token, 'base64').toString('utf8')
    const at = decoded.indexOf(':')
    const route = routes.get(decoded.slice(0, at))
    if (route == null) return undefined
    const presented = Buffer.from(decoded.slice(at + 1))
    return presented.length === route.secret.length && timingSafeEqual(presented, route.secret) ? route : undefined
  }

  /** Connect to `host:port` through the route's SOCKS upstream. */
  const dial = async ({ spec }: Route, host: string, port: number): Promise<Socket> => {
    const remote = spec.protocol === 'socks4a' || spec.protocol === 'socks5h'
    let destination = host
    if (isIP(host) !== 0) {
      options.guard?.checkAddress(host, host)
    } else if (!remote) {
      // socks4 / socks5 resolve here — so the guard sees the address actually dialled.
      const { address } = await lookup(host)
      options.guard?.checkAddress(host, address)
      destination = address
    }
    const { socket } = await SocksClient.createConnection({
      proxy: {
        host: spec.host,
        port: spec.port,
        type: spec.protocol.startsWith('socks4') ? 4 : 5,
        ...(spec.username != null ? { userId: spec.username } : {}),
        ...(spec.password != null ? { password: spec.password } : {}),
      },
      command: 'connect',
      destination: { host: destination, port },
      timeout: options.connectTimeout ?? SOCKS_CONNECT_TIMEOUT_MS,
    })

    return socket
  }

  const fail = (client: Socket, e: unknown): void => {
    if (e instanceof ReaderRefusedError) {
      reply(client, '403 Forbidden', { [BRIDGE_REFUSED_HEADER]: e.message.replace(/[\r\n]/g, ' ') })
      return
    }
    const code = (e as { code?: string }).code ?? (e as Error).message ?? 'socks-failed'
    reply(client, '502 Bad Gateway', { [BRIDGE_ERROR_HEADER]: String(code).replace(/[\r\n]/g, ' ').slice(0, 120) })
  }

  const handle = async (client: Socket, head: string, rest: Buffer): Promise<void> => {
    const [requestLine = '', ...headerLines] = head.split('\r\n')
    const [method = '', target = ''] = requestLine.split(' ')
    const headers = new Map<string, string>()
    for (const line of headerLines) {
      const colon = line.indexOf(':')
      if (colon > 0) headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim())
    }
    const route = routeOf(headers.get('proxy-authorization'))
    if (route == null) {
      reply(client, '407 Proxy Authentication Required', { 'proxy-authenticate': 'Basic realm="owlmeans-reader"' })
      return
    }

    if (method.toUpperCase() === 'CONNECT') {
      const at = target.lastIndexOf(':')
      const host = target.slice(0, at).replace(/^\[|\]$/g, '')
      const upstream = await dial(route, host, Number(target.slice(at + 1)) || 443)
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
      if (rest.length > 0) upstream.write(rest)
      upstream.on('error', () => client.destroy())
      client.on('error', () => upstream.destroy())
      client.pipe(upstream)
      upstream.pipe(client)
      return
    }

    let url: URL
    try {
      url = new URL(target)
    } catch {
      reply(client, '400 Bad Request')
      return
    }
    // A reader only GETs; a body would have to be framed and relayed — refused instead.
    if (Number(headers.get('content-length') ?? 0) > 0 || headers.has('transfer-encoding')) {
      reply(client, '501 Not Implemented', { [BRIDGE_ERROR_HEADER]: 'body-not-supported' })
      return
    }
    const upstream = await dial(route, url.hostname.replace(/^\[|\]$/g, ''), Number(url.port) || 80)
    const forwarded = [...headers.entries()].filter(([name]) => !HOP_BY_HOP.has(name)).map(([k, v]) => `${k}: ${v}`)
    // One request per connection: the next one may belong to another route.
    upstream.write(`${method} ${url.pathname}${url.search} HTTP/1.1\r\n${forwarded.join('\r\n')}\r\nconnection: close\r\n\r\n`)
    upstream.on('error', () => client.destroy())
    client.on('error', () => upstream.destroy())
    upstream.pipe(client)
  }

  const onConnection = (client: Socket): void => {
    let buffered = Buffer.alloc(0)
    client.on('error', () => client.destroy())
    const onData = (chunk: Buffer): void => {
      buffered = Buffer.concat([buffered, chunk])
      const end = buffered.indexOf('\r\n\r\n')
      if (end < 0) {
        if (buffered.length > MAX_HEAD_BYTES) reply(client, '431 Request Header Fields Too Large')
        return
      }
      client.off('data', onData)
      client.pause()
      handle(client, buffered.subarray(0, end).toString('latin1'), buffered.subarray(end + 4))
        .catch(e => fail(client, e))
        .finally(() => client.resume())
    }
    client.on('data', onData)
  }

  const start = (): Promise<number> => listening ??= new Promise<number>((resolve, reject) => {
    server = createServer(onConnection)
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server!.unref()
      const address = server!.address()
      resolve(typeof address === 'object' && address != null ? address.port : 0)
    })
  })

  const specKey = (spec: ProxySpec): string =>
    JSON.stringify([spec.protocol, spec.host, spec.port, spec.username ?? '', spec.password ?? ''])

  const endpoint = async (spec: ProxySpec): Promise<HttpProxyEndpoint> => {
    const port = await start()
    let route = bySpec.get(specKey(spec))
    if (route == null) {
      route = { spec, user: `r${randomBytes(6).toString('hex')}`, secret: Buffer.from(randomBytes(18).toString('hex')) }
      routes.set(route.user, route)
      bySpec.set(specKey(spec), route)
    }
    const password = route.secret.toString()

    return {
      url: `http://${route.user}:${password}@127.0.0.1:${port}`,
      server: `http://127.0.0.1:${port}`,
      username: route.user,
      password,
      bridged: true,
    }
  }

  const close = async (): Promise<void> => {
    const open = server
    server = undefined
    listening = undefined
    routes.clear()
    bySpec.clear()
    if (open != null) await new Promise<void>(resolve => open.close(() => resolve()))
  }

  return { endpoint, close }
}
