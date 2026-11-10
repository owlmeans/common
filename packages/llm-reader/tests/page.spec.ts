import { describe, expect, test } from 'bun:test'
import { LinkKind, makePageModel, PageRegion } from '../src/index.js'
import { fixture } from './servers.js'

const page = (name: string, path: string) => makePageModel({ url: `https://acme.test${path}`, html: fixture(name) })

describe('@owlmeans/llm-reader — page model', () => {
  test('metadata comes from the strongest evidence, and says which', () => {
    const meta = page('article.html', '/stories/tide-pools-winter').meta()

    expect(meta.title).toEqual({ value: 'How Tide Pools Survive Winter', source: 'json-ld' })
    expect(meta.author).toEqual({ value: 'Mara Lindqvist', source: 'json-ld' })
    expect(meta.published).toEqual({ value: '2026-10-14T08:00:00Z', source: 'json-ld' })
    expect(meta.modified?.value).toBe('2026-10-15T09:30:00Z')
    expect(meta.site).toEqual({ value: 'Acme Journal', source: 'open-graph' })
    expect(meta).toMatchObject({
      language: 'en', ogType: 'article', schemaTypes: ['NewsArticle'],
      canonical: 'https://acme.test/stories/tide-pools-winter', image: 'https://acme.test/images/tidepool-share.jpg',
    })
  })

  test('without JSON-LD the byline and <time> are read from the markup', () => {
    const html = fixture('article.html').replace(/<script type="application\/ld\+json">[^]*?<\/script>/, '')
      .replace(/<meta name="author"[^>]*>/, '').replace(/<meta property="article:published_time"[^>]*>/, '')
    const meta = makePageModel({ url: 'https://acme.test/s', html }).meta()

    expect(meta.author).toEqual({ value: 'Mara Lindqvist', source: 'markup' })
    expect(meta.published).toEqual({ value: '2026-10-14T08:00:00Z', source: 'markup' })
  })

  test('an article goes through the article extractor; other pages are rendered by structure', async () => {
    const article = await page('article.html', '/stories/tide-pools-winter').content()
    expect(article.method).toBe('article')
    expect(article.markdown).toContain('## Antifreeze in the blood')
    expect(article.markdown).not.toContain('Get the weekly tide')

    const landing = await page('landing.html', '/').content()
    expect(landing.method).toBe('structure')
    expect(landing.markdown).toContain('# Ship invoices in minutes')
    expect(landing.markdown).toContain('$29/month')
  })

  test('signals tell the page types apart', () => {
    expect(page('article.html', '/s').signals()).toMatchObject({ hasArticle: true, hasByline: true, hasTime: true, appShell: false })
    expect(page('landing.html', '/').signals().prices).toBe(3)
    expect(page('topics.html', '/topics').signals().repeatedItems).toBeGreaterThanOrEqual(1)
    const app = page('app.html', '/app').signals()
    expect(app.appShell).toBe(true)
    expect(app.words).toBeLessThan(15)
  })

  test('links carry their region, section and kind', () => {
    const links = page('article.html', '/stories/tide-pools-winter').links()
    const byText = (text: string) => links.find(link => link.text === text)!

    expect(byText('Topics')).toMatchObject({ region: PageRegion.Nav, kind: LinkKind.Nav, internal: true })
    expect(byText('original research')).toMatchObject({ region: PageRegion.Article, kind: LinkKind.Content, internal: false, section: 'Hiding in the deep pools' })
    expect(byText('Twitter')).toMatchObject({ kind: LinkKind.Social, region: PageRegion.Footer })
    expect(page('topics.html', '/topics').links().find(link => link.url.endsWith('/topics/oceans'))!.text).toBe('Oceans 128 stories')
    expect(page('topics.html', '/topics').links().find(link => link.url.endsWith('page=2'))!.kind).toBe(LinkKind.Pagination)
  })

  test('the DOM index outlines, queries, finds and addresses nodes', () => {
    const dom = page('article.html', '/stories/tide-pools-winter').dom()
    const outline = dom.outline(undefined, 2)
    expect(outline).toContain('<header class="site-header">')
    expect(outline).toMatch(/expand n\d+/)

    const [time] = dom.query('time[datetime]')
    expect(time).toMatchObject({ tag: 'time', attributes: { datetime: '2026-10-14T08:00:00Z' } })
    expect(dom.selector(time!.ref)).toContain('time')
    expect(dom.find('Lindqvist')[0]!.tag).toBe('a')
    expect(dom.text(dom.query('p.byline')[0]!.ref)).toBe('By Mara Lindqvist · October 14, 2026')
    expect(() => dom.query('p[')).toThrow()
  })

  test('stylesheets and style blocks are listed', () => {
    expect(page('landing.html', '/').stylesheets()).toEqual(['https://acme.test/styles/site.css'])
  })
})
