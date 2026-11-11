import { createServer } from 'node:net'
import type { AddressInfo, Server } from 'node:net'
import { gzipSync } from 'node:zlib'

export interface OriginFile {
  bytes: Uint8Array
  type?: string
  disposition?: string
  etag?: string
}

export interface OriginRequest {
  path: string
  headers: Record<string, string>
}

export interface Origin {
  readonly base: string
  url: (path: string) => string
  files: Map<string, OriginFile>
  /** Body bytes served per file name. */
  served: Map<string, number>
  requests: OriginRequest[]
  stop: () => void
}

export interface StartOriginOptions {
  tls?: { key: string, cert: string }
}

/**
 * A local HTTP origin: `/files/<name>` (Range + ETag + If-Range), `/norange/<name>`, `/gzip/<name>`
 * (Content-Encoding), `/redirect/<n>`, `/go?to=&status=`, `/status/<code>`, `/headers`,
 * `/stall-headers`, `/stall-body`.
 */
export const startOrigin = (options: StartOriginOptions = {}): Origin => {
  const files = new Map<string, OriginFile>()
  const served = new Map<string, number>()
  const requests: OriginRequest[] = []
  const count = (name: string, bytes: number): void => { served.set(name, (served.get(name) ?? 0) + bytes) }

  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    tls: options.tls,
    idleTimeout: 0,
    fetch: async request => {
      const url = new URL(request.url)
      requests.push({ path: `${url.pathname}${url.search}`, headers: Object.fromEntries(request.headers) })
      const [, route, ...rest] = url.pathname.split('/')
      const name = decodeURIComponent(rest.join('/'))
      switch (route) {
        case 'files':
        case 'norange': {
          const file = files.get(name)
          if (file == null) {
            return new Response('missing', { status: 404 })
          }
          const length = file.bytes.length
          const etag = file.etag ?? `"${name}-${length}"`
          const headers: Record<string, string> = { 'content-type': file.type ?? 'application/octet-stream', etag }
          if (file.disposition != null) {
            headers['content-disposition'] = file.disposition
          }
          const range = request.headers.get('range')
          const ifRange = request.headers.get('if-range')
          if (route === 'files') {
            headers['accept-ranges'] = 'bytes'
          }
          if (route === 'files' && range != null && (ifRange == null || ifRange === etag)) {
            const match = /bytes=(\d+)-(\d*)/.exec(range)
            const start = Number(match?.[1] ?? 0)
            const end = match?.[2] != null && match[2] !== '' ? Math.min(Number(match[2]), length - 1) : length - 1
            if (start >= length) {
              return new Response(null, { status: 416, headers: { 'content-range': `bytes */${length}` } })
            }
            const slice = file.bytes.subarray(start, end + 1)
            count(name, slice.length)
            return new Response(slice, { status: 206, headers: { ...headers, 'content-range': `bytes ${start}-${end}/${length}` } })
          }
          count(name, length)
          return new Response(file.bytes, { headers })
        }
        case 'gzip': {
          const file = files.get(name)
          if (file == null) {
            return new Response('missing', { status: 404 })
          }
          return new Response(gzipSync(file.bytes), { headers: { 'content-encoding': 'gzip', 'content-type': file.type ?? 'application/octet-stream' } })
        }
        case 'redirect': {
          const left = Number(rest[0])
          return left > 0
            ? new Response(null, { status: 302, headers: { location: `/redirect/${left - 1}` } })
            : new Response('arrived', { headers: { 'content-type': 'text/plain' } })
        }
        case 'go':
          return new Response(null, { status: Number(url.searchParams.get('status') ?? 302), headers: { location: url.searchParams.get('to') ?? '/' } })
        case 'status':
          return new Response('status page', { status: Number(rest[0]) })
        case 'headers':
          return Response.json(Object.fromEntries(request.headers))
        case 'stall-headers':
          return await new Promise<Response>(() => undefined)
        case 'stall-body':
          return new Response(new ReadableStream({ start: controller => { controller.enqueue(new Uint8Array([1, 2, 3])) } }), {
            headers: { 'content-type': 'application/octet-stream' },
          })
        default:
          return new Response('not found', { status: 404 })
      }
    },
  })
  const base = `${options.tls != null ? 'https' : 'http'}://127.0.0.1:${server.port}`

  return { base, url: path => `${base}${path}`, files, served, requests, stop: () => { server.stop(true) } }
}

export interface RawServer {
  readonly base: string
  stop: () => void
}

/** A raw TCP server answering one fixed response — for bodies shorter than their Content-Length. */
export const startRawServer = (response: string): Promise<RawServer> => new Promise(resolve => {
  const server: Server = createServer(socket => {
    socket.once('data', () => socket.end(response))
    socket.on('error', () => undefined)
  })
  server.listen(0, '127.0.0.1', () => {
    const port = (server.address() as AddressInfo).port
    resolve({ base: `http://127.0.0.1:${port}`, stop: () => { server.close() } })
  })
})
