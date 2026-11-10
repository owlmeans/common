import type { ReaderFetchPlugin } from '@owlmeans/llm-reader'
import type { PlaywrightFetchPluginOptions, PlaywrightRenderer } from './renderer/types.js'

/**
 * A reader fetch plugin that renders pages instead of downloading them — for a site whose every
 * page needs its scripts. Put it after the proxy plugin, so the lease it renders through is chosen
 * (and failed over) by the proxy plugin like any fetch.
 */
export const makePlaywrightFetchPlugin = (renderer: PlaywrightRenderer, options: PlaywrightFetchPluginOptions = {}): ReaderFetchPlugin => {
  let guard: Parameters<NonNullable<ReaderFetchPlugin['attach']>>[0]['guard'] | undefined

  return {
    name: 'playwright',
    attach: context => {
      guard = context.guard
    },
    fetch: async (request, next) => {
      const wanted = options.when != null ? options.when(request) : (request.purpose ?? 'page') === 'page'
      if (!wanted) return next(request)
      const rendered = await renderer.render({
        url: request.url, styles: true, screenshot: true,
        ...(guard != null ? { guard } : {}),
        ...(request.lease != null ? { lease: request.lease } : {}),
        ...(request.signal != null ? { signal: request.signal } : {}),
        ...(request.timeout != null ? { timeout: request.timeout } : {}),
      })
      return {
        url: request.url,
        finalUrl: rendered.finalUrl,
        status: rendered.status,
        headers: {},
        contentType: 'text/html',
        charset: 'utf-8',
        text: rendered.html,
        fetchedAt: new Date().toISOString(),
        redirects: [],
        ...(request.lease != null ? { via: request.lease.id } : {}),
        rendered,
      }
    },
    close: () => renderer.close(),
  }
}
