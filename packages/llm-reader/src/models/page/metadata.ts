import { textUtils } from '../../utils/text.js'
import type { MetaSource, MetaValue, PageMeta } from './types.js'
import type { JsonLd, MetadataHelper } from './types.local.js'

const ARTICLE_TYPES = /Article|Posting|Report|Review|Recipe|HowTo|NewsArticle|BlogPosting/

/** Every JSON-LD node on the page, `@graph` arrays flattened. */
const jsonLdNodes = (document: Document): JsonLd[] => {
  const nodes: JsonLd[] = []
  const add = (value: unknown): void => {
    if (Array.isArray(value)) value.forEach(add)
    else if (value != null && typeof value === 'object') {
      const node = value as JsonLd
      nodes.push(node)
      if (node['@graph'] != null) add(node['@graph'])
    }
  }
  for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      add(JSON.parse(script.textContent ?? ''))
    } catch {
      // A broken block is skipped, not fatal.
    }
  }
  return nodes
}

const typesOf = (node: JsonLd): string[] => {
  const type = node['@type']
  return (Array.isArray(type) ? type : [type]).filter((t): t is string => typeof t === 'string')
}

/** A person/organization name from a JSON-LD value: a string, an object, or a list of them. */
const nameOf = (value: unknown): string | undefined => {
  if (typeof value === 'string') return textUtils.collapse(value) || undefined
  if (Array.isArray(value)) {
    const names = value.map(nameOf).filter((n): n is string => n != null)
    return names.length > 0 ? names.join(', ') : undefined
  }
  if (value != null && typeof value === 'object') return nameOf((value as JsonLd).name)
  return undefined
}

const urlOf = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return urlOf(value[0])
  if (value != null && typeof value === 'object') return urlOf((value as JsonLd).url ?? (value as JsonLd).contentUrl)
  return undefined
}

export const createMetadataHelper = (): MetadataHelper => {
  /**
   * Read the page's metadata from the strongest evidence it has — JSON-LD, then Open Graph and
   * `<meta>`, then the markup itself (a `rel=author` link, a `<time>` in the byline) — and say for
   * each value which kind of evidence it came from.
   */
  const read = (document: Document, url: string): PageMeta => {
    const nodes = jsonLdNodes(document)
    const primary = nodes.find(node => typesOf(node).some(type => ARTICLE_TYPES.test(type)))
      ?? nodes.find(node => typesOf(node).some(type => /WebPage|Product|Event|Organization|Person/.test(type)))
    const meta = (selector: string): string | undefined => {
      const value = document.querySelector(selector)?.getAttribute('content')
      return value != null && value.trim().length > 0 ? value.trim() : undefined
    }
    const pick = (...candidates: [string | undefined, MetaSource][]): MetaValue | undefined => {
      for (const [value, source] of candidates) {
        const clean = textUtils.collapse(value)
        if (clean.length > 0) return { value: clean, source }
      }
      return undefined
    }
    const jsonString = (key: string): string | undefined => {
      const value = primary?.[key]
      return typeof value === 'string' ? value : undefined
    }
    const article = document.querySelector('article') ?? document
    const byline = article.querySelector('[rel~="author"], [itemprop="author"], .byline, .author, [class*="byline"]')
    const bylineName = byline?.getAttribute('rel')?.includes('author') === true
      ? byline.textContent
      : byline?.querySelector('[rel~="author"], [itemprop="name"], a')?.textContent
        ?? byline?.textContent?.match(/\bby\s+([^·|•,\n]+)/i)?.[1]
    const time = article.querySelector('time[datetime]')?.getAttribute('datetime')
      ?? document.querySelector('[itemprop="datePublished"]')?.getAttribute('content')
    const absolute = (href: string | null | undefined): string | undefined => textUtils.absolute(href, url)
    const types = [...new Set(nodes.flatMap(typesOf))]

    return {
      title: pick(
        [jsonString('headline') ?? jsonString('name'), 'json-ld'], [meta('meta[property="og:title"]'), 'open-graph'],
        [meta('meta[name="twitter:title"]'), 'meta'], [document.querySelector('title')?.textContent ?? undefined, 'markup'],
        [document.querySelector('h1')?.textContent ?? undefined, 'content'],
      ),
      description: pick(
        [meta('meta[name="description"]'), 'meta'], [meta('meta[property="og:description"]'), 'open-graph'],
        [jsonString('description'), 'json-ld'],
      ),
      author: pick(
        [nameOf(primary?.author), 'json-ld'], [meta('meta[name="author"]'), 'meta'],
        [meta('meta[property="article:author"]'), 'open-graph'], [bylineName ?? undefined, 'markup'],
      ),
      published: pick(
        [jsonString('datePublished'), 'json-ld'], [meta('meta[property="article:published_time"]'), 'open-graph'],
        [time ?? undefined, 'markup'], [meta('meta[name="date"], meta[name="pubdate"], meta[name="dc.date"]'), 'meta'],
      ),
      modified: pick(
        [jsonString('dateModified'), 'json-ld'], [meta('meta[property="article:modified_time"]'), 'open-graph'],
        [meta('meta[property="og:updated_time"]'), 'open-graph'],
      ),
      site: pick(
        [meta('meta[property="og:site_name"]'), 'open-graph'], [nameOf(primary?.publisher), 'json-ld'],
        [meta('meta[name="application-name"]'), 'meta'], [textUtils.siteOf(url), 'content'],
      ),
      language: document.documentElement?.getAttribute('lang') ?? undefined,
      canonical: absolute(document.querySelector('link[rel="canonical"]')?.getAttribute('href')),
      image: absolute(meta('meta[property="og:image"]') ?? meta('meta[name="twitter:image"]') ?? urlOf(primary?.image)),
      favicon: absolute(document.querySelector('link[rel~="icon"]')?.getAttribute('href') ?? '/favicon.ico'),
      ogType: meta('meta[property="og:type"]'),
      schemaTypes: types,
      feeds: Array.from(document.querySelectorAll('link[rel="alternate"][type*="rss"], link[rel="alternate"][type*="atom"]'))
        .map(link => absolute(link.getAttribute('href')))
        .filter((href): href is string => href != null),
    }
  }

  /** JSON-LD image URLs (a page may name several), for the image inventory. */
  const images = (document: Document): string[] =>
    jsonLdNodes(document).flatMap(node => {
      const image = node.image
      const list = Array.isArray(image) ? image : image != null ? [image] : []
      return list.map(urlOf).filter((u): u is string => u != null)
    })

  return { read, images }
}

export const metadataHelper = createMetadataHelper()
