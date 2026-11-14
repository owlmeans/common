import { afterAll, describe, expect, test } from 'bun:test'
import { createLlmReader } from '../src/index.js'
import { robotsHelper } from '../src/crawl/robots.js'
import { startCdn, startCollectSite } from './servers.js'

const cdn = startCdn()
const site = startCollectSite(cdn.url)
afterAll(() => {
  cdn.stop()
  site.stop()
})

const reader = createLlmReader({ allowHosts: ['127.0.0.1'], timeout: 5000 })
const path = (url: string): string => new URL(url).pathname

describe('@owlmeans/llm-reader — crawl', () => {
  test('robots.txt: the most specific group, the longest rule, Allow on a tie, wildcards', () => {
    const text = 'User-agent: *\nDisallow: /\n\nUser-agent: owlmeansreader\nDisallow: /a/\nAllow: /a/open\nDisallow: /*.pdf$\nAllow: /b\nDisallow: /b\nCrawl-delay: 2\n'
    const rules = robotsHelper.parse(text, 'OwlMeansReader')
    expect(rules.allows('/')).toBe(true)
    expect(rules.allows('/a/x')).toBe(false)
    expect(rules.allows('/a/open/1')).toBe(true)
    expect(rules.allows('/doc.pdf')).toBe(false)
    expect(rules.allows('/doc.pdf?x=1')).toBe(true)
    expect(rules.allows('/b')).toBe(true)
    expect(rules.delay).toBe(2)
    expect(robotsHelper.parse(text, 'SomeoneElse').allows('/x')).toBe(false)
    expect(robotsHelper.parse('', 'OwlMeansReader').allows('/x')).toBe(true)
  })

  test('a bounded breadth-first walk: same origin, robots honoured, URLs read once, depth and page caps', async () => {
    const result = await reader.crawl(`${site.url}/docs/`, { maxPages: 20, depth: 1, delay: 0 })
    const read = result.pages.map(page => path(page.url)).sort()
    // `*` disallows /docs/ for everyone else; this reader's own group allows it and refuses /secret/ but /secret/open.
    expect(read).toEqual(['/docs/', '/docs/blog', '/docs/guide', '/docs/pricing', '/private/p', '/secret/open'])
    expect(result.skipped).toContainEqual({ url: `${site.url}/secret/x`, reason: 'robots' })
    expect(result.pages.find(page => path(page.url) === '/docs/pricing')).toMatchObject({ depth: 1, from: `${site.url}/docs/` })
    expect(result.pages[0]!.page.meta().title?.value).toBe('Docs home')
    // The guide was linked twice (a tracking parameter, a fragment) and read once; the PDF and the other origin never.
    expect(site.hits.filter(hit => hit.startsWith('/docs/guide')).length).toBe(1)
    expect(site.hits.filter(hit => hit === '/robots.txt')).toHaveLength(1)
    expect(site.hits).not.toContain('/docs/file.pdf')

    const capped = await reader.crawl(`${site.url}/docs/`, { maxPages: 3, depth: 3, delay: 0 })
    expect(capped.pages).toHaveLength(3)
    const deep = await reader.crawl(`${site.url}/docs/pricing`, { maxPages: 10, depth: 1, delay: 0 })
    expect(deep.pages.map(page => path(page.url))).not.toContain('/docs/pricing/enterprise/deep')
  }, 30_000)

  test('without models, an intent ranks links by its words; requests to one host are paced', async () => {
    const started = Date.now()
    const result = await reader.crawl(`${site.url}/docs/`, { intent: 'enterprise pricing plans', maxPages: 3, depth: 2, linksPerPage: 1, delay: 150 })
    expect(result.pages.map(page => path(page.url))).toEqual(['/docs/', '/docs/pricing', '/docs/pricing/enterprise'])
    expect(Date.now() - started).toBeGreaterThanOrEqual(300)
  }, 30_000)

  test('robots can be ignored on request; a missing start page is a skip', async () => {
    const all = await reader.crawl(`${site.url}/docs/`, { maxPages: 30, depth: 1, delay: 0, robots: false })
    expect(all.pages.map(page => path(page.url))).toContain('/secret/x')
    const missing = await reader.crawl(`${site.url}/nowhere`, { delay: 0 })
    expect(missing).toMatchObject({ pages: [], skipped: [{ url: `${site.url}/nowhere`, reason: 'status-404' }] })
  }, 30_000)
})
