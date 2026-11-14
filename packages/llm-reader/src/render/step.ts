import { ReaderConfigError } from '../errors.js'
import type { LocalBundlePlugin } from '../fetch/bundle/types.js'
import type { ProxyPlugin } from '../fetch/proxy/types.js'
import type { RenderStep, RenderStepOptions } from './types.js'

const isBundle = (plugin: unknown): plugin is LocalBundlePlugin =>
  typeof (plugin as LocalBundlePlugin).serves === 'function' && typeof (plugin as LocalBundlePlugin).read === 'function'

/**
 * Render a URL as the reader does: a bundle page is answered from disk (no proxy, its synthetic origin
 * never resolved); any other page goes through the lease the fetch would have used, its address
 * checked first, and the lease is told how it went.
 */
export const createRenderStep = (options: RenderStepOptions): RenderStep => {
  const proxy = options.plugins?.find((plugin): plugin is ProxyPlugin => typeof (plugin as ProxyPlugin).lease === 'function')
  const bundles = options.plugins?.filter(isBundle) ?? []

  return async (url, read = {}) => {
    const bundle = bundles.find(plugin => plugin.serves(url))
    const lease = bundle == null ? await proxy?.lease({ url, ...(read.key != null ? { key: read.key } : {}) }) : undefined
    if (lease != null && options.fetch != null) throw new ReaderConfigError('injected-fetch-proxy')
    if (bundle == null) await options.fetcher.guard.check(url, lease == null)
    try {
      const rendered = await options.renderer.render({
        url, guard: options.fetcher.guard, screenshot: read.screenshot ?? true, styles: read.styles ?? true,
        ...(lease != null ? { lease } : {}), ...(bundle != null ? { bundle } : {}),
        ...(options.fetch != null ? { fetch: options.fetch } : {}),
        ...(read.snapshot === true ? { snapshot: true } : {}),
        ...(read.signal != null ? { signal: read.signal } : {}),
      })
      lease?.report({ ok: true, status: rendered.status })
      return rendered
    } catch (e) {
      lease?.report({ ok: false, reason: (e as Error).message })
      throw e
    }
  }
}
