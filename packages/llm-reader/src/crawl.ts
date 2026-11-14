import { logger } from '@owlmeans/log'
import { LinkKind } from './consts.js'
import { ReaderContentError, ReaderRefusedError } from './errors.js'
import type { PageLink, PageModel } from './models/page/types.js'
import type { LlmReader } from './reader/types.js'
import { textUtils } from './utils/text.js'
import {
  DEFAULT_CRAWL_CONCURRENCY, DEFAULT_CRAWL_DELAY_MS, DEFAULT_CRAWL_DEPTH, DEFAULT_CRAWL_LINKS_PER_PAGE, DEFAULT_CRAWL_MAX_PAGES, ROBOTS_AGENT,
} from './crawl/consts.js'
import { LOW_VALUE_PATHS, MAX_CRAWL_DELAY_MS, ROBOTS_MAX_BYTES, STOP_WORDS } from './crawl/consts.local.js'
import { robotsHelper } from './crawl/robots.js'
import type { CrawledPage, Crawler, CrawlerOptions, CrawlOptions, CrawlResult, CrawlSkip } from './crawl/types.js'
import type { CrawlItem, RobotsRules } from './crawl/types.local.js'
import { crawlUrlHelper } from './crawl/urls.js'

const log = logger('llm-reader:crawl')

const sleep = (ms: number, signal?: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => {
    clearTimeout(timer)
    reject(signal.reason)
  }, { once: true })
})

/**
 * A bounded breadth-first walk over a site through the reader: URLs normalized and read once, the
 * start origin only by default, robots.txt honoured (fetched once per origin; missing allows, a server
 * error disallows), requests to one host paced, at most `maxPages` pages `depth` hops deep. Which links
 * are followed is the model's pick for the intent when the reader has models, a keyword ranking
 * otherwise.
 */
export const makeCrawler = (reader: LlmReader, options: CrawlerOptions): Crawler => {
  const crawl: Crawler['crawl'] = async (start, crawlOptions: CrawlOptions = {}) => {
    const maxPages = crawlOptions.maxPages ?? DEFAULT_CRAWL_MAX_PAGES
    const maxDepth = crawlOptions.depth ?? DEFAULT_CRAWL_DEPTH
    const linksPerPage = crawlOptions.linksPerPage ?? DEFAULT_CRAWL_LINKS_PER_PAGE
    const concurrency = Math.max(1, crawlOptions.concurrency ?? DEFAULT_CRAWL_CONCURRENCY)
    const delay = crawlOptions.delay ?? DEFAULT_CRAWL_DELAY_MS
    const { key, signal, intent } = crawlOptions
    const pages: CrawledPage[] = []
    const skipped: CrawlSkip[] = []
    const first = crawlUrlHelper.normalize(start)
    if (first == null) return { url: start, pages, skipped: [{ url: start, reason: 'bad-url' }] }
    const origin = new URL(first).origin
    const seen = new Set([first])
    const robots = new Map<string, Promise<RobotsRules>>()
    const nextAt = new Map<string, number>()
    const words = (intent ?? '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(word => word.length >= 3 && !STOP_WORDS.includes(word))

    const rethrowAbort = (): void => {
      if (signal?.aborted === true) throw signal.reason
    }

    const fetchRobots = async (host: string): Promise<RobotsRules> => {
      try {
        const answer = await reader.fetcher.fetch({
          url: `${host}/robots.txt`, purpose: 'any', maxBytes: ROBOTS_MAX_BYTES, ...(key != null ? { key } : {}), ...(signal != null ? { signal } : {}),
        })
        if (answer.status >= 500) return robotsHelper.disallowAll
        if (answer.status >= 400 || answer.text == null) return robotsHelper.allowAll
        return robotsHelper.parse(answer.text, ROBOTS_AGENT)
      } catch (e) {
        rethrowAbort()
        // An oversized file is read as missing; an unreachable one disallows (RFC 9309).
        return e instanceof ReaderContentError ? robotsHelper.allowAll : robotsHelper.disallowAll
      }
    }

    const rulesFor = (url: string): Promise<RobotsRules> => {
      if (crawlOptions.robots === false) return Promise.resolve(robotsHelper.allowAll)
      const host = new URL(url).origin
      let rules = robots.get(host)
      if (rules == null) robots.set(host, rules = fetchRobots(host))
      return rules
    }

    /** Wait for this host's turn. */
    const pace = async (url: string, rules: RobotsRules): Promise<void> => {
      const host = new URL(url).host
      const gap = Math.max(delay, Math.min((rules.delay ?? 0) * 1000, MAX_CRAWL_DELAY_MS))
      const now = Date.now()
      const at = Math.max(now, nextAt.get(host) ?? 0)
      nextAt.set(host, at + gap)
      if (at > now) await sleep(at - now, signal)
    }

    const score = (link: PageLink): number => {
      const path = new URL(link.url).pathname.toLowerCase()
      const text = link.text.toLowerCase()
      const hits = words.reduce((sum, word) => sum + (text.includes(word) ? 2 : 0) + (path.includes(word) ? 1.5 : 0), 0)
      const kind = link.kind === LinkKind.Content ? 1 : link.kind === LinkKind.Nav ? 0.5 : 0
      const low = LOW_VALUE_PATHS.some(pattern => pattern.test(link.url)) ? 3 : 0
      return hits + kind - low - path.split('/').length * 0.1
    }

    /** The links worth following from a page, best first. */
    const follow = async (page: PageModel): Promise<string[]> => {
      const candidates = page.links().flatMap(link => {
        const url = crawlUrlHelper.normalize(link.url)
        if (url == null || seen.has(url) || crawlUrlHelper.isAsset(url)) return []
        if (crawlOptions.sameOrigin !== false && new URL(url).origin !== origin) return []
        return [{ ...link, url }]
      })
      if (candidates.length === 0) return []
      if (intent != null && options.models) {
        try {
          const picked = await reader.links(page, { intent, limit: linksPerPage, ...(key != null ? { key } : {}), ...(signal != null ? { signal } : {}) })
          const allowed = new Set(candidates.map(link => link.url))
          return picked.map(link => crawlUrlHelper.normalize(link.url)).filter((url): url is string => url != null && allowed.has(url)).slice(0, linksPerPage)
        } catch (e) {
          rethrowAbort()
          log.warn('Links not picked by the model, ranked by keywords', { host: textUtils.siteOf(page.url), error: e })
        }
      }
      return candidates
        .map((link, order) => ({ url: link.url, rank: score(link), order }))
        .sort((a, b) => b.rank - a.rank || a.order - b.order)
        .map(link => link.url)
        .filter((url, index, all) => all.indexOf(url) === index)
        .slice(0, linksPerPage)
    }

    const visit = async (item: CrawlItem): Promise<CrawlItem[]> => {
      const rules = await rulesFor(item.url)
      const { pathname, search } = new URL(item.url)
      if (!rules.allows(`${pathname}${search}`)) {
        skipped.push({ url: item.url, reason: 'robots' })
        return []
      }
      await pace(item.url, rules)
      let page: PageModel
      try {
        page = await reader.page(item.url, {
          ...(key != null ? { key } : {}), ...(signal != null ? { signal } : {}), ...(crawlOptions.render != null ? { render: crawlOptions.render } : {}),
        })
      } catch (e) {
        rethrowAbort()
        skipped.push({ url: item.url, reason: e instanceof ReaderRefusedError || e instanceof Error ? e.message : String(e) })
        return []
      }
      const status = page.rendered?.status ?? page.fetched?.status ?? 200
      if (status >= 400) {
        skipped.push({ url: item.url, reason: `status-${status}` })
        return []
      }
      // A redirect can land on a page already read.
      const landed = crawlUrlHelper.normalize(page.url) ?? item.url
      if (landed !== item.url && pages.some(read => crawlUrlHelper.normalize(read.url) === landed)) {
        skipped.push({ url: item.url, reason: 'duplicate' })
        return []
      }
      seen.add(landed)
      const crawled: CrawledPage = { url: page.url, depth: item.depth, ...(item.from != null ? { from: item.from } : {}), page }
      if (crawlOptions.describe != null && crawlOptions.describe !== false) {
        try {
          crawled.description = await reader.describe(page, {
            ...(typeof crawlOptions.describe === 'object' ? crawlOptions.describe : {}), ...(key != null ? { key } : {}), ...(signal != null ? { signal } : {}),
          })
        } catch (e) {
          rethrowAbort()
          log.warn('Page not described', { host: textUtils.siteOf(page.url), error: e })
        }
      }
      pages.push(crawled)
      if (item.depth >= maxDepth) return []
      const next = (await follow(page)).filter(url => !seen.has(url))
      next.forEach(url => seen.add(url))
      return next.map(url => ({ url, depth: item.depth + 1, from: page.url }))
    }

    const maxAttempts = maxPages * 3
    let attempts = 0
    let inflight = 0
    let level: CrawlItem[] = [{ url: first, depth: 0 }]
    while (level.length > 0 && pages.length < maxPages && attempts < maxAttempts) {
      const current = level
      const next: CrawlItem[] = []
      let index = 0
      const worker = async (): Promise<void> => {
        while (index < current.length && pages.length + inflight < maxPages && attempts < maxAttempts) {
          const item = current[index++]!
          attempts++
          inflight++
          try {
            next.push(...await visit(item))
          } finally {
            inflight--
          }
        }
      }
      await Promise.all(Array.from({ length: concurrency }, worker))
      level = next
    }
    log.debug('Crawled', { host: textUtils.siteOf(first), pages: pages.length, skipped: skipped.length })

    return { url: start, pages, skipped } satisfies CrawlResult
  }

  return { crawl }
}
