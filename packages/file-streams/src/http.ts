import { request as httpRequest } from 'node:http'
import type { IncomingMessage, RequestOptions } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { Socket } from 'node:net'
import { pipeline, Transform } from 'node:stream'
import type { Readable } from 'node:stream'
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib'
import { logger } from '@owlmeans/log'
import { NON_INFORMATIVE_MIMES } from '@owlmeans/file-inspector'
import { HttpError, ProxyError, ResolverError } from './errors.js'
import { makeHttpConnector } from './http/connector.js'
import { ALWAYS_SENSITIVE_HEADERS, DEFAULT_HTTP_TIMEOUTS, DEFAULT_MAX_REDIRECTS, DEFAULT_RESOLVER_PAGE_BYTES, REDIRECT_STATUSES } from './http/consts.js'
import { makeHttpSource } from './http/source.js'
import type { HttpClient, HttpClientOptions, HttpRequestOptions, HttpResponse } from './http/types.js'
import type { Connection } from './http/types.local.js'
import { createNetworkPolicy } from './network.js'
import type { NetworkPolicy } from './network/types.js'
import { createProxyRouter } from './proxy/router.js'
import type { ProxyRouter } from './proxy/types.js'
import { googleDriveResolver } from './resolvers/google-drive.js'
import type { UrlResolver } from './resolvers/types.js'
import type { FileInfo } from './types.js'
import { nameUtils } from './utils/names.js'
import { redactUtils } from './utils/redact.js'
import { signalUtils } from './utils/signals.js'
import { streamUtils } from './utils/streams.js'
import type { PeekedStream } from './utils/streams/types.js'
import { PACKAGE_USER_AGENT } from './consts.local.js'

const log = logger('file-streams:http')

export const createHttpClient = (options: HttpClientOptions = {}): HttpClient => {
  const policy: NetworkPolicy = options.network != null && 'assertUrl' in options.network
    ? options.network
    : createNetworkPolicy(options.network)
  const router: ProxyRouter = options.proxies != null && 'select' in options.proxies && typeof options.proxies.select === 'function'
    ? options.proxies as ProxyRouter
    : createProxyRouter(options.proxies as Parameters<typeof createProxyRouter>[0])
  const resolvers: UrlResolver[] = options.resolvers ?? [googleDriveResolver]
  const timeouts = { ...DEFAULT_HTTP_TIMEOUTS, ...options.timeouts }
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS
  const sensitive = [...ALWAYS_SENSITIVE_HEADERS, ...(options.sensitiveHeaders ?? []).map(name => name.toLowerCase())]
  const connector = makeHttpConnector(policy, router, timeouts, options.ca)

  const header = (headers: IncomingMessage['headers'], name: string): string | undefined => {
    const value = headers[name]
    return Array.isArray(value) ? value[0] : value
  }

  const mimeOf = (value: string | undefined): string | undefined => {
    const mime = value?.split(';')[0].trim().toLowerCase()
    return mime == null || mime === '' || NON_INFORMATIVE_MIMES.includes(mime) ? undefined : mime
  }

  const isGzipFile = (url: URL, response: IncomingMessage): boolean => {
    const mime = mimeOf(header(response.headers, 'content-type'))
    return mime === 'application/gzip' || mime === 'application/x-gzip' || /\.(t?gz)$/i.test(url.pathname)
  }

  const infoOf = (url: URL, response: IncomingMessage, decoded: boolean): FileInfo => {
    const status = response.statusCode ?? 0
    let size: number | undefined
    if (status === 206) {
      const total = /\/(\d+)\s*$/.exec(header(response.headers, 'content-range') ?? '')?.[1]
      size = total != null ? Number(total) : undefined
    } else if (!decoded) {
      const length = header(response.headers, 'content-length')
      size = length != null && /^\d+$/.test(length) ? Number(length) : undefined
    }
    const modified = header(response.headers, 'last-modified')
    const info: FileInfo = {
      origin: redactUtils.url(url),
      name: nameUtils.fromDisposition(header(response.headers, 'content-disposition')) ?? nameUtils.fromUrl(url),
      size,
      mime: mimeOf(header(response.headers, 'content-type')),
      etag: header(response.headers, 'etag'),
    }
    if (modified != null && !Number.isNaN(Date.parse(modified))) {
      info.modifiedAt = new Date(modified)
    }

    return info
  }

  const send = (url: URL, method: string, headers: Record<string, string>, connection: Connection, signal?: AbortSignal): Promise<IncomingMessage> =>
    new Promise((resolve, reject) => {
      const secure = url.protocol === 'https:'
      const forward = connection.mode === 'forward'
      const requestOptions: RequestOptions = {
        method,
        host: url.hostname.replace(/^\[|\]$/g, ''),
        port: url.port !== '' ? Number(url.port) : secure ? 443 : 80,
        path: forward ? url.href : `${url.pathname}${url.search}`,
        headers: { ...headers, ...connection.headers },
        createConnection: (() => connection.socket as Socket) as unknown as RequestOptions['createConnection'],
      }
      const request = (secure ? httpsRequest : httpRequest)(requestOptions)
      const timer = setTimeout(() => request.destroy(new HttpError('headers-timeout')), timeouts.headersMs)
      const release = signalUtils.onAbort(signal, reason => request.destroy(reason as Error))
      request.once('response', response => {
        clearTimeout(timer)
        release()
        resolve(response)
      })
      request.once('error', error => {
        clearTimeout(timer)
        release()
        connection.socket.destroy()
        reject(error instanceof HttpError || signal?.aborted === true ? error : new HttpError('request'))
      })
      request.end()
    })

  const bodyOf = (url: URL, response: IncomingMessage): { body: Readable, decoded: boolean } => {
    const encoding = header(response.headers, 'content-encoding')?.trim().toLowerCase()
    const stages: NodeJS.ReadWriteStream[] = []
    let decoded = false
    if (encoding != null && encoding !== '' && encoding !== 'identity' && !isGzipFile(url, response)) {
      decoded = true
      if (encoding === 'gzip' || encoding === 'x-gzip') {
        stages.push(createGunzip())
      } else if (encoding === 'deflate') {
        stages.push(createInflate())
      } else if (encoding === 'br') {
        stages.push(createBrotliDecompress())
      } else {
        response.destroy()
        throw new HttpError('encoding')
      }
    } else {
      const length = header(response.headers, 'content-length')
      if (length != null && /^\d+$/.test(length)) {
        const expected = Number(length)
        let seen = 0
        stages.push(new Transform({
          transform: (chunk: Buffer, _encoding, callback) => {
            seen += chunk.length
            callback(null, chunk)
          },
          flush: callback => callback(seen < expected ? new HttpError('truncated') : null),
        }))
      }
    }
    stages.push(streamUtils.meter({ idleTimeoutMs: timeouts.idleMs }).stream)
    response.once('aborted', () => response.destroy(new HttpError('truncated')))
    const body = (pipeline as unknown as (...streams: unknown[]) => Readable)(response, ...stages, () => undefined)

    return { body, decoded }
  }

  const request = async (input: string | URL, requestOptions: HttpRequestOptions = {}): Promise<HttpResponse> => {
    const signal = requestOptions.signal
    const method = requestOptions.method ?? 'GET'
    let current = new URL(input)
    policy.assertUrl(current)

    const resolver = requestOptions.raw === true ? undefined : resolvers.find(candidate => candidate.matches(current))
    if (resolver != null && requestOptions.range != null) {
      // A resolver reads pages whole: resolve first, then ask the bytes' own URL for the range.
      const resolved = await request(current, { ...requestOptions, range: undefined, ifRange: undefined })
      streamUtils.discard(resolved.body)
      return await request(resolved.url, { ...requestOptions, raw: true })
    }
    if (resolver != null) {
      current = resolver.rewrite(current)
      policy.assertUrl(current)
    }

    const headers: Record<string, string> = {
      'user-agent': options.userAgent ?? PACKAGE_USER_AGENT,
      accept: '*/*',
      'accept-encoding': 'identity',
      connection: 'close',
      ...lowerKeys(options.headers),
      ...lowerKeys(requestOptions.headers),
    }
    if (requestOptions.range != null) {
      headers.range = `bytes=${requestOptions.range.start}-${requestOptions.range.end ?? ''}`
      if (requestOptions.ifRange != null) {
        headers['if-range'] = requestOptions.ifRange
      }
    }

    let redirects = 0
    let steps = 0
    let cookie: string | undefined
    for (;;) {
      signalUtils.throwIfAborted(signal)
      const connection = await connector.connect(current, requestOptions.proxyKey, signal)
      const outgoing: Record<string, string> = { ...headers, host: current.host }
      if (cookie != null && resolver?.owns(current) === true) {
        outgoing.cookie = cookie
      }
      const response = await send(current, method, outgoing, connection, signal)
      const status = response.statusCode ?? 0
      const location = header(response.headers, 'location')

      // A resolver's flow carries its cookie across hops, so it follows them itself even under `manual`.
      const returned = REDIRECT_STATUSES.includes(status) && location != null && requestOptions.redirect === 'manual' && resolver == null
      if (REDIRECT_STATUSES.includes(status) && location != null && !returned) {
        response.resume()
        response.destroy()
        if (++redirects > maxRedirects) {
          throw new HttpError('redirects')
        }
        let next: URL
        try {
          next = new URL(location, current)
        } catch {
          throw new HttpError('location')
        }
        policy.assertUrl(next, current)
        if (next.origin !== current.origin) {
          sensitive.forEach(name => { delete headers[name] })
        }
        current = next
        continue
      }
      const success = status >= 200 && status < 300
      if (!success && !returned && (requestOptions.anyStatus !== true || (status === 407 && connection.mode === 'forward'))) {
        response.resume()
        response.destroy()
        if (status === 407 && connection.mode === 'forward') {
          throw new ProxyError('auth-failed')
        }
        throw new HttpError(`status:${status}`)
      }

      let { body, decoded } = method === 'HEAD'
        ? { body: response, decoded: false }
        : bodyOf(current, response)

      if (resolver != null && method === 'GET' && success) {
        let peeked: PeekedStream | undefined
        const readBody = async (maxBytes: number = DEFAULT_RESOLVER_PAGE_BYTES): Promise<string> => {
          peeked ??= await streamUtils.peek(body, maxBytes)
          return Buffer.from(peeked.head.subarray(0, maxBytes)).toString('utf8')
        }
        const step = await resolver.inspect({ url: current, status, headers: response.headers }, readBody)
        if (peeked != null) {
          body = peeked.stream
        }
        if (step.action === 'follow') {
          streamUtils.discard(body)
          if (++steps > resolver.maxSteps) {
            throw new ResolverError(`${resolver.name}:steps`)
          }
          policy.assertUrl(step.url, current)
          if (!resolver.owns(step.url)) {
            throw new ResolverError(`${resolver.name}:foreign-follow`)
          }
          cookie = step.headers?.cookie ?? cookie
          current = step.url
          continue
        }
        if (step.action === 'fail') {
          streamUtils.discard(body)
          throw new ResolverError(`${resolver.name}:${step.reason}`)
        }
      }

      log.debug('Response', { url: redactUtils.url(current), status, redirects })

      return { url: current, status, headers: response.headers, body, info: infoOf(current, response, decoded), redirects, decoded }
    }
  }

  const lowerKeys = (headers: Record<string, string> | undefined): Record<string, string> =>
    Object.fromEntries(Object.entries(headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]))

  const client: HttpClient = {
    request,
    source: (url, sourceOptions) => makeHttpSource(client, new URL(url), sourceOptions),
  }

  return client
}

export const httpClient = createHttpClient()
