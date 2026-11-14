import type { Browser, BrowserContext, Route } from 'playwright'
import type { FetchFunction, RenderedPage } from '@owlmeans/llm-reader'
import { logger } from '@owlmeans/log'
import {
  DEFAULT_MAX_FULFIL_BYTES, DEFAULT_RENDER_TIMEOUT_MS, DEFAULT_SETTLE_MS, DEFAULT_VIEWPORT, PROBE_ELEMENTS, SCREENSHOT_QUALITY,
} from './consts.js'
import { FULFIL_DROPPED_HEADERS, FULFIL_REQUEST_HEADERS } from './renderer/consts.local.js'
import { probePage } from './renderer/probe.js'
import { inlineCssom } from './renderer/snapshot.js'
import type { PlaywrightRenderer, PlaywrightRendererOptions } from './renderer/types.js'

const log = logger('llm-reader-playwright')

/**
 * Render pages in Chromium (or the browser you pass). Each page gets its own browser context:
 * its proxy is the reader's lease (`endpoint()` — the upstream, or the SOCKS bridge, which
 * challenges with a 407 so Chromium sends the route credentials), every request it makes is put
 * through the reader's address guard, downloads are off and service workers blocked. A page of a
 * local bundle (`bundles`, or the request's own `bundle`) is served from disk under its synthetic
 * origin, while everything it loads from elsewhere still passes the guard. Given the reader's pinned
 * `fetch`, every guarded live request is fetched through it and fulfilled, never re-resolved by Chromium.
 */
export const createPlaywrightRenderer = (options: PlaywrightRendererOptions = {}): PlaywrightRenderer => {
  let launched: Promise<Browser> | undefined
  const maxFulfilBytes = options.maxFulfilBytes ?? DEFAULT_MAX_FULFIL_BYTES

  /** A body read whole under the cap — `route.fulfill` takes a buffer, not a stream. */
  const bodyOf = async (response: Response): Promise<Buffer> => {
    const declared = Number(response.headers.get('content-length') ?? NaN)
    if (Number.isFinite(declared) && declared > maxFulfilBytes) throw new Error(`too-large:${declared}`)
    if (response.body == null) return Buffer.alloc(0)
    const chunks: Uint8Array[] = []
    let size = 0
    const reader = response.body.getReader()
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.byteLength
      if (size > maxFulfilBytes) {
        await reader.cancel().catch(() => undefined)
        throw new Error(`too-large:>${maxFulfilBytes}`)
      }
      chunks.push(next.value)
    }
    return Buffer.concat(chunks)
  }

  /**
   * A guarded sub-request carried by the injected fetch and fulfilled from its answer; redirects go
   * back to the browser, whose next request passes the guard again.
   */
  const fulfilThrough = async (fetch: FetchFunction, route: Route, signal?: AbortSignal): Promise<void> => {
    const request = route.request()
    const method = request.method().toUpperCase()
    if (method !== 'GET' && method !== 'HEAD') throw Object.assign(new Error(`method:${method}`), { refused: true })
    const sent = request.headers()
    const headers = Object.fromEntries(FULFIL_REQUEST_HEADERS.flatMap(name => sent[name] != null ? [[name, sent[name]!]] : []))
    const response = await fetch(request.url(), { method, headers, redirect: 'manual', ...(signal != null ? { signal } : {}) })
    const answer: Record<string, string> = {}
    response.headers.forEach((value, name) => {
      if (!FULFIL_DROPPED_HEADERS.includes(name) && name !== 'set-cookie') answer[name] = value
    })
    const cookies = response.headers.getSetCookie?.() ?? []
    if (cookies.length > 0) answer['set-cookie'] = cookies.join('\n')
    await route.fulfill({ status: response.status, headers: answer, body: method === 'HEAD' ? Buffer.alloc(0) : await bodyOf(response) })
  }

  const browserOf = async (): Promise<Browser> => {
    if (options.browser != null) {
      return typeof options.browser === 'function' ? options.browser() : options.browser
    }
    return launched ??= import('playwright').then(({ chromium }) => chromium.launch({ headless: true, ...options.launch }))
  }

  const render: PlaywrightRenderer['render'] = async request => {
    const browser = await browserOf()
    const endpoint = request.lease != null ? await request.lease.endpoint() : undefined
    const viewport = options.viewport ?? DEFAULT_VIEWPORT
    const context: BrowserContext = await browser.newContext({
      viewport,
      serviceWorkers: 'block',
      acceptDownloads: false,
      ...(options.userAgent != null ? { userAgent: options.userAgent } : {}),
      ...(endpoint != null
        ? { proxy: { server: endpoint.server, ...(endpoint.username != null ? { username: endpoint.username, password: endpoint.password ?? '' } : {}) } }
        : {}),
    })
    const blocked: string[] = []
    const bundles = [...(options.bundles ?? []), ...(request.bundle != null ? [request.bundle] : [])]
    // Through a lease the proxy carries the request; an injected fetch would bypass it.
    const fetch = endpoint == null ? request.fetch ?? options.fetch : undefined
    try {
      if (request.guard != null || bundles.length > 0 || fetch != null) {
        const guard = request.guard
        await context.route('**/*', async route => {
          const url = route.request().url()
          if (url.startsWith('data:') || url.startsWith('blob:')) return route.continue()
          // A bundle file is answered from disk; its synthetic origin never reaches DNS or a proxy.
          const bundle = bundles.find(candidate => candidate.serves(url))
          try {
            if (bundle != null) {
              const file = await bundle.read(url)
              await route.fulfill(file != null
                ? { status: 200, contentType: file.contentType, body: Buffer.from(file.bytes) }
                : { status: 404, contentType: 'text/plain', body: '' })
              return
            }
            await guard?.check(url, endpoint == null)
          } catch {
            blocked.push(url)
            await route.abort('blockedbyclient')
            return
          }
          if (fetch == null) return route.continue()
          try {
            await fulfilThrough(fetch, route, request.signal)
          } catch (e) {
            const refused = (e as { refused?: unknown } | null)?.refused === true
            if (refused) blocked.push(url)
            log.debug('Sub-request not fulfilled', { host: new URL(url).host, refused, error: e })
            await route.abort(refused ? 'blockedbyclient' : 'failed').catch(() => undefined)
          }
        })
      }
      const page = await context.newPage()
      request.signal?.addEventListener('abort', () => void page.close().catch(() => undefined), { once: true })
      const response = await page.goto(request.url, {
        waitUntil: options.waitUntil ?? 'load', timeout: request.timeout ?? options.timeout ?? DEFAULT_RENDER_TIMEOUT_MS,
      })
      await page.waitForLoadState('networkidle', { timeout: options.settle ?? DEFAULT_SETTLE_MS }).catch(() => undefined)
      const probe = request.styles === true ? await page.evaluate(probePage, PROBE_ELEMENTS) : undefined
      if (request.snapshot === true) await page.evaluate(inlineCssom)
      const screenshot = request.screenshot === true
        ? new Uint8Array(await page.screenshot({ type: 'jpeg', quality: SCREENSHOT_QUALITY }))
        : undefined
      const rendered: RenderedPage = {
        url: request.url,
        finalUrl: page.url(),
        status: response?.status() ?? 0,
        html: await page.content(),
        viewport,
        ...(screenshot != null ? { screenshot } : {}),
        ...(probe != null ? { styles: probe.styles, variables: probe.variables, blocks: probe.blocks } : {}),
        ...(blocked.length > 0 ? { blocked } : {}),
      }
      return rendered
    } finally {
      await context.close().catch(() => undefined)
    }
  }

  const close = async (): Promise<void> => {
    const browser = launched
    launched = undefined
    if (browser != null) await (await browser).close()
  }

  return { render, close }
}
