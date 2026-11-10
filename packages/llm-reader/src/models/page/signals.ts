import { textUtils } from '../../utils/text.js'
import { PRICE_PATTERN } from './consts.js'
import type { PageSignals } from './types.js'
import type { PageContext } from './types.local.js'

const words = (text: string): number => text.split(/\s+/).filter(word => /\w/.test(word)).length

/** Sibling groups of ≥3 same-shaped elements that each carry a link — a listing's cards. */
const repeatedGroups = (document: Document): number => {
  let groups = 0
  for (const parent of Array.from(document.querySelectorAll('ul, ol, div, section, main'))) {
    const children = Array.from(parent.children)
    if (children.length < 3) continue
    const shapes = new Map<string, number>()
    for (const child of children) {
      if (child.querySelector('a[href]') == null && child.tagName.toLowerCase() !== 'a') continue
      const shape = `${child.tagName}.${(child.getAttribute('class') ?? '').split(/\s+/)[0] ?? ''}`
      shapes.set(shape, (shapes.get(shape) ?? 0) + 1)
    }
    if ([...shapes.values()].some(count => count >= 3)) groups++
  }
  return groups
}

/** Markup facts that separate page types before a model looks — and that the model is shown as hints. */
export const readSignals = (document: Document, url: string, context: PageContext): PageSignals => {
  const body = document.body
  const text = textUtils.textOf(body)
  const main = document.querySelector('main, article, [role="main"]')
  const site = textUtils.siteOf(url)
  const links = Array.from(document.querySelectorAll('a[href]'))
  const mount = document.querySelector('#root, #app, #__next, #__nuxt, [data-reactroot], app-root')

  return {
    words: words(text),
    mainWords: words(main != null ? textUtils.textOf(main) : text),
    headings: context.headings().length,
    links: links.length,
    internalLinks: links.filter(link => textUtils.siteOf(textUtils.absolute(link.getAttribute('href'), url) ?? '') === site).length,
    images: document.querySelectorAll('img, picture, svg').length,
    forms: document.querySelectorAll('form').length,
    passwordField: document.querySelector('input[type="password"]') != null,
    searchField: document.querySelector('input[type="search"], input[name="q"], input[name="search"], [role="search"]') != null,
    prices: (text.match(PRICE_PATTERN) ?? []).length,
    repeatedItems: repeatedGroups(document),
    appShell: words(text) < 60 && mount != null && textUtils.textOf(mount).length < 40
      && document.querySelector('script[src], script[type="module"]') != null,
    hasArticle: document.querySelector('article') != null,
    hasTime: document.querySelector('time') != null,
    hasByline: document.querySelector('[rel~="author"], [itemprop="author"], .byline, [class*="byline"]') != null,
    callsToAction: document.querySelectorAll('a.btn, a.button, a[class*="cta"], button, [role="button"]').length,
  }
}
