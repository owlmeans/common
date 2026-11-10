import { afterAll, describe, expect, test } from 'bun:test'
import { lint } from '@google/design.md/linter'
import { createLlmReader, ImageRole, PageType, ReaderMode } from '../src/index.js'
import { liveModels, liveSkip, titled } from './context.js'
import { startSite } from './servers.js'

const site = startSite()
const reader = createLlmReader({ allowHosts: ['127.0.0.1'], models: liveModels('reader-live') })
afterAll(async () => {
  site.stop()
  await reader.close()
})

const TIMEOUT = 300_000
const article = `${site.url}/stories/tide-pools-winter`
const live = test.skipIf(liveSkip != null)

const BYLINE_SCHEMA = {
  type: 'object',
  properties: {
    author: { type: 'string', description: 'The author\'s full name.' },
    published: { type: 'string', description: 'The publication date, ISO 8601.' },
  },
  required: ['author', 'published'],
  additionalProperties: false,
}

describe('@owlmeans/llm-reader — live analysis (DOM mode unless a test says otherwise)', () => {
  live(titled('describe: the default Markdown description of a page', liveSkip), async () => {
    const description = await reader.describe(article)

    expect(description.pageType).toBe(PageType.Article)
    expect(description.markdown).toStartWith(`# ${description.pageTitle}`)
    expect(description.markdown).toMatch(/Tide Pools/i)
    expect(description.markdown).toContain('## Summary')
    expect(description.markdown).toContain('## Antifreeze in the blood')
    for (const link of description.keyLinks) {
      expect(link.url).toStartWith('http')
    }
  }, TIMEOUT)

  live(titled('classify: article, landing, category index, app shell', liveSkip), async () => {
    const types = await Promise.all(['/stories/tide-pools-winter', '/', '/topics', '/app']
      .map(async path => (await reader.classify(`${site.url}${path}`)).pageType))

    expect(types[0]).toBe(PageType.Article)
    expect(types[1]).toBe(PageType.Landing)
    expect([PageType.CategoryIndex, PageType.Listing]).toContain(types[2]!)
    expect(types[3]).toBe(PageType.App)
  }, TIMEOUT)

  live(titled('extract in text mode: author and publication date', liveSkip), async () => {
    const result = await reader.extract<{ author: string, published: string }>(article, {
      schema: BYLINE_SCHEMA, instruction: 'Who wrote this article, and when was it published?', mode: ReaderMode.Text,
    })

    expect(result.mode).toBe(ReaderMode.Text)
    expect(result.data.author).toBe('Mara Lindqvist')
    expect(result.data.published).toStartWith('2026-10-14')
  }, TIMEOUT)

  live(titled('extract by default in DOM mode: the agent reads the byline and cites the nodes', liveSkip), async () => {
    // No mode given: a reader with an execution explores the DOM.
    const result = await reader.extract<{ author: string, published: string }>(article, {
      schema: BYLINE_SCHEMA, instruction: 'Who wrote this article, and when was it published?',
    })

    expect(result.mode).toBe(ReaderMode.Dom)
    expect(result.data.author).toBe('Mara Lindqvist')
    expect(result.data.published).toStartWith('2026-10-14')
    expect(result.evidence.length).toBeGreaterThan(0)
  }, TIMEOUT)

  live(titled('links: the model picks the story links, not the navigation', liveSkip), async () => {
    const links = await reader.links(article, { intent: 'links to other stories (articles) on this site' })
    const urls = links.map(link => new URL(link.url).pathname)

    expect(urls).toEqual(expect.arrayContaining(['/stories/rock-pool-guide', '/stories/kelp-forests']))
    expect(urls).not.toContain('/topics')
    expect(urls).not.toContain('/about')
  }, TIMEOUT)

  live(titled('images: roles and usage from context, and a vision caption', liveSkip), async () => {
    const images = await reader.images(article, { vision: true, visionLimit: 1 })
    const find = (fragment: string) => images.find(image => image.url.includes(fragment))!

    expect(find('logo.svg').role).toBe(ImageRole.Logo)
    expect([ImageRole.Hero, ImageRole.Photo, ImageRole.Illustration]).toContain(find('tidepool-hero').role!)
    expect(find('tidepool-hero').usage!.length).toBeGreaterThan(10)
    expect(images.some(image => image.url.includes('pixel.gif'))).toBe(false)
    // Every picture on the fixture site is a solid blue square.
    expect(images.find(image => image.description != null)!.description).toMatch(/blue/i)
  }, TIMEOUT)

  live(titled('design: a DESIGN.md grounded in the measured styles, accepted by the linter', liveSkip), async () => {
    const report = await reader.design(`${site.url}/`)
    const result = lint(report.markdown)

    expect(result.summary.errors).toBe(0)
    expect(report.tokens.colors.primary).toBeDefined()
    expect(Object.values(report.tokens.colors)).toContain('#0B5FFF')
    expect(report.markdown).toContain('## Responsive Behavior')
    expect(report.markdown).toContain('## Agent Prompt Guide')
    expect(report.facts.breakpoints).toEqual(['768px', '1200px'])
  }, TIMEOUT)
})
