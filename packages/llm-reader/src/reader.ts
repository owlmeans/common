import { memoHelper } from '@owlmeans/context'
import type { LlmModel } from '@owlmeans/llm'
import { makePageAnalyst } from './analyst.js'
import type { AnalystOptions, PageAnalyst } from './analyst/types.js'
import { makeDesignAnalyst } from './design.js'
import type { DesignAnalyst, DesignAnalystOptions } from './design/types.js'
import { ReaderConfigError } from './errors.js'
import type { ReaderModels } from './execution/types.js'
import { createPageFetcher } from './fetch/fetcher.js'
import type { FetchedResource, PageFetcher } from './fetch/fetcher/types.js'
import type { ProxyPlugin } from './fetch/proxy/types.js'
import { makePageModel } from './models/page.js'
import type { PageModel } from './models/page/types.js'
import type { LlmReader, LlmReaderOptions, ReadOptions, ReaderTarget } from './reader/types.js'

const isPage = (target: ReaderTarget): target is PageModel => typeof target === 'object' && 'dom' in target

const isModels = (models: ReaderModels | LlmModel): models is ReaderModels =>
  typeof (models as ReaderModels).helper === 'function'

/** One ready model for every task — text mode only, no helper execution for the DOM agent. */
const singleModel = (model: LlmModel): ReaderModels => ({ model: () => model, helper: () => undefined })

/**
 * A reader: one fetcher (its plugins, proxies and address guard), an optional renderer, and the
 * models its analyses run on. Pages are fetched through the plugin chain; a page that turns out to
 * be an app shell — or any page read for its design — is rendered when a renderer is configured,
 * through the same proxy the fetch would have used.
 */
export const createLlmReader = (options: LlmReaderOptions = {}): LlmReader => {
  const fetcher: PageFetcher = options.fetcher ?? createPageFetcher(options)
  const proxy = options.plugins?.find((plugin): plugin is ProxyPlugin => typeof (plugin as ProxyPlugin).lease === 'function')

  const build = (models: ReaderModels | LlmModel | undefined): LlmReader => {
    const resolved = models == null ? undefined : isModels(models) ? models : singleModel(models)
    const analystOptions: AnalystOptions | undefined = resolved != null
      ? {
        models: resolved, fetcher,
        ...(options.budget != null ? { budget: options.budget } : {}),
        ...(options.maxTurns != null ? { maxTurns: options.maxTurns } : {}),
      }
      : undefined
    const designOptions: DesignAnalystOptions | undefined = resolved != null
      ? { models: resolved, fetcher, ...(options.maxStylesheets != null ? { maxStylesheets: options.maxStylesheets } : {}) }
      : undefined
    // One analyst per page: it keeps that page's reading pack for every task asked of it.
    const analystOf = memoHelper.oncePer((page: PageModel): PageAnalyst => {
      if (analystOptions == null) throw new ReaderConfigError('no-models')
      return makePageAnalyst(page, analystOptions)
    })
    const designerOf = memoHelper.oncePer((page: PageModel): DesignAnalyst => {
      if (designOptions == null) throw new ReaderConfigError('no-models')
      return makeDesignAnalyst(page, designOptions)
    })

    const fetch: LlmReader['fetch'] = (url, read = {}) =>
      fetcher.fetch({ url, purpose: 'page', ...(read.key != null ? { key: read.key } : {}), ...(read.signal != null ? { signal: read.signal } : {}) })

    const render = async (url: string, read: ReadOptions): Promise<PageModel> => {
      const renderer = options.renderer!
      const lease = await proxy?.lease({ url, ...(read.key != null ? { key: read.key } : {}) })
      await fetcher.guard.check(url, lease == null)
      try {
        const rendered = await renderer.render({
          url, guard: fetcher.guard, screenshot: true, styles: true,
          ...(lease != null ? { lease } : {}), ...(read.signal != null ? { signal: read.signal } : {}),
        })
        lease?.report({ ok: true, status: rendered.status })
        return makePageModel({ url, html: rendered.html, rendered })
      } catch (e) {
        lease?.report({ ok: false, reason: (e as Error).message })
        throw e
      }
    }

    const fromFetched = (fetched: FetchedResource): PageModel =>
      makePageModel({ url: fetched.finalUrl, html: fetched.text ?? '', fetched, ...(fetched.rendered != null ? { rendered: fetched.rendered } : {}) })

    const page: LlmReader['page'] = async (target, read = {}) => {
      if (isPage(target)) return target
      if (typeof target !== 'string') return fromFetched(target)
      if (read.render === true && options.renderer != null) return render(target, read)
      const parsed = fromFetched(await fetch(target, read))
      // An app shell has nothing to read until its scripts run.
      if (read.render !== false && options.renderer != null && parsed.signals().appShell) return render(target, read)
      return parsed
    }

    return {
      fetcher,
      fetch,
      page,
      describe: async (target, read = {}) => analystOf(await page(target, read)).describe(read),
      classify: async (target, read = {}) => analystOf(await page(target, read)).classify(read),
      extract: async (target, read) => analystOf(await page(target, read)).extract(read),
      links: async (target, read = {}) => {
        const parsed = await page(target, read)
        return read.intent != null ? analystOf(parsed).links(read) : parsed.links().slice(0, read.limit ?? Infinity)
      },
      images: async (target, read = {}) => {
        const parsed = await page(target, read)
        const wantsModel = read.classify !== false || read.vision === true
        if (!wantsModel || analystOptions == null) {
          if (wantsModel && read.classify === true) throw new ReaderConfigError('no-models')
          return parsed.images().filter(image => read.skipTracking === false || image.hint !== 'tracking')
        }
        return analystOf(parsed).images(read)
      },
      design: async (target, read = {}) => {
        if (designOptions == null) throw new ReaderConfigError('no-models')
        const parsed = await page(target, { ...read, render: read.render ?? (options.renderer != null && typeof target === 'string') })
        return designerOf(parsed).analyze(read.key != null ? { key: read.key } : {})
      },
      using: models => build(models),
      close: async () => {
        await fetcher.close()
        await options.renderer?.close?.()
      },
    }
  }

  return build(options.models)
}
