import type { Browser, BrowserContext } from 'playwright'
import type { RenderedPage } from '@owlmeans/llm-reader'
import { DEFAULT_RENDER_TIMEOUT_MS, DEFAULT_SETTLE_MS, DEFAULT_VIEWPORT, PROBE_ELEMENTS, SCREENSHOT_QUALITY } from './consts.js'
import { probePage } from './renderer/probe.js'
import type { PlaywrightRenderer, PlaywrightRendererOptions } from './renderer/types.js'

/**
 * Render pages in Chromium (or the browser you pass). Each page gets its own browser context:
 * its proxy is the reader's lease (`endpoint()` — the upstream, or the SOCKS bridge, which
 * challenges with a 407 so Chromium sends the route credentials), every request it makes is put
 * through the reader's address guard, downloads are off and service workers blocked.
 */
export const createPlaywrightRenderer = (options: PlaywrightRendererOptions = {}): PlaywrightRenderer => {
  let launched: Promise<Browser> | undefined

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
    try {
      if (request.guard != null) {
        const guard = request.guard
        await context.route('**/*', async route => {
          const url = route.request().url()
          if (url.startsWith('data:') || url.startsWith('blob:')) return route.continue()
          try {
            await guard.check(url, endpoint == null)
            await route.continue()
          } catch {
            blocked.push(url)
            await route.abort('blockedbyclient')
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
