import { ReaderContentError, ReaderFetchError, ReaderProxyError, ReaderRefusedError } from '../errors.js'
import { textUtils } from '../utils/text.js'
import { BRIDGE_ERROR_HEADER, BRIDGE_REFUSED_HEADER } from './bridge/consts.js'
import { createAddressGuard } from './guard.js'
import { createFetchTransport } from './transport.js'
import {
  ACCEPT_HEADERS, DEFAULT_FETCH_TIMEOUT_MS, DEFAULT_MAX_BYTES, DEFAULT_MAX_REDIRECTS, DEFAULT_USER_AGENT, TEXT_TYPES,
} from './fetcher/consts.js'
import type { FetchedResource, FetchRequest, PageFetcher, PageFetcherOptions } from './fetcher/types.js'
import type { HttpProxyEndpoint } from './proxy/types.js'

const REDIRECTS = new Set([301, 302, 303, 307, 308])

/**
 * Fetch pages and their sub-resources. Plugins wrap the whole fetch (so one page keeps one proxy
 * across its redirects); the terminal step follows redirects itself, guarding every hop, reads the
 * body under a byte cap and decodes it by its declared or sniffed charset.
 */
export const createPageFetcher = (options: PageFetcherOptions = {}): PageFetcher => {
  const guard = options.guard ?? createAddressGuard(options)
  const transport = options.transport ?? createFetchTransport()
  const plugins = options.plugins ?? []
  plugins.forEach(plugin => plugin.attach?.({ guard }))

  const readBody = async (response: Response, cap: number, signal: AbortSignal): Promise<Uint8Array> => {
    const declared = Number(response.headers.get('content-length') ?? NaN)
    if (Number.isFinite(declared) && declared > cap) {
      await response.body?.cancel().catch(() => undefined)
      throw new ReaderContentError(`too-large:${declared}`)
    }
    if (response.body == null) return new Uint8Array()
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      if (signal.aborted) throw signal.reason
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > cap) {
        await reader.cancel().catch(() => undefined)
        throw new ReaderContentError(`too-large:>${cap}`)
      }
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return bytes
  }

  /** What a proxy did with the request — a failure of the proxy is not the target's answer. */
  const inspect = (response: Response, proxy: string): void => {
    const refused = response.headers.get(BRIDGE_REFUSED_HEADER)
    if (refused != null) throw new ReaderRefusedError(refused)
    const bridged = response.headers.get(BRIDGE_ERROR_HEADER)
    const error = bridged != null
      ? new ReaderProxyError(bridged)
      : response.status === 407 ? new ReaderProxyError('auth-required') : undefined
    if (error != null) {
      error.proxy = proxy
      throw error
    }
  }

  const terminal = async (request: FetchRequest): Promise<FetchedResource> => {
    const purpose = request.purpose ?? 'page'
    const deadline = AbortSignal.timeout(request.timeout ?? options.timeout ?? DEFAULT_FETCH_TIMEOUT_MS)
    const signal = request.signal != null ? AbortSignal.any([request.signal, deadline]) : deadline
    const endpoint: HttpProxyEndpoint | undefined = request.lease != null ? await request.lease.endpoint() : undefined
    const headers = {
      'user-agent': options.userAgent ?? DEFAULT_USER_AGENT,
      accept: ACCEPT_HEADERS[purpose],
      'accept-language': 'en;q=0.9,*;q=0.5',
      ...request.headers,
    }
    const redirects: string[] = []
    let url = request.url
    let response: Response
    while (true) {
      await guard.check(url, endpoint == null)
      try {
        response = await transport.send({ url, headers, signal, ...(endpoint != null ? { endpoint } : {}) })
      } catch (e) {
        if (request.signal?.aborted === true) throw e
        if (e instanceof ReaderProxyError || e instanceof ReaderRefusedError) throw e
        const reason = (e as { name?: string }).name === 'TimeoutError' ? 'timeout' : 'network'
        const error = request.lease != null ? new ReaderProxyError(reason) : new ReaderFetchError(reason)
        error.cause = e
        error.url = url
        if (error instanceof ReaderProxyError) error.proxy = request.lease!.id
        throw error
      }
      if (request.lease != null) inspect(response, request.lease.id)
      const location = response.headers.get('location')
      if (!REDIRECTS.has(response.status) || location == null) break
      await response.body?.cancel().catch(() => undefined)
      const next = textUtils.absolute(location, url)
      if (next == null || redirects.length >= (options.maxRedirects ?? DEFAULT_MAX_REDIRECTS)) {
        throw Object.assign(new ReaderFetchError(next == null ? 'bad-redirect' : 'too-many-redirects'), { url, status: response.status })
      }
      redirects.push(url)
      url = next
    }

    if (options.acceptStatus != null && !options.acceptStatus(response.status)) {
      await response.body?.cancel().catch(() => undefined)
      throw Object.assign(new ReaderFetchError(`status-${response.status}`), { url, status: response.status })
    }
    const contentType = (response.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
    const textual = contentType === '' || TEXT_TYPES.some(type => type.test(contentType))
    if (purpose === 'page' && !textual) {
      await response.body?.cancel().catch(() => undefined)
      throw new ReaderContentError(`unsupported-content-type:${contentType}`)
    }
    if (purpose === 'image' && !contentType.startsWith('image/')) {
      await response.body?.cancel().catch(() => undefined)
      throw new ReaderContentError(`not-an-image:${contentType}`)
    }
    const bytes = await readBody(response, request.maxBytes ?? options.maxBytes ?? DEFAULT_MAX_BYTES[purpose], signal)
    const decoded = textual && purpose !== 'image' ? textUtils.decode(bytes, response.headers.get('content-type')) : undefined

    return {
      url: request.url,
      finalUrl: url,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      contentType,
      ...(decoded != null ? { text: decoded.text, charset: decoded.charset } : { bytes }),
      fetchedAt: new Date().toISOString(),
      redirects,
      ...(request.lease != null ? { via: request.lease.id } : {}),
    }
  }

  /** The plugins, outermost first, around the terminal step. */
  const chain = plugins.reduceRight<(request: FetchRequest) => Promise<FetchedResource>>(
    (next, plugin) => plugin.fetch != null ? request => plugin.fetch!(request, next) : next,
    terminal,
  )

  const fetch: PageFetcher['fetch'] = request => chain(request)

  const close = async (): Promise<void> => {
    await Promise.all(plugins.map(plugin => plugin.close?.().catch(() => undefined)))
    await transport.close()
  }

  return { fetch, guard, close }
}
