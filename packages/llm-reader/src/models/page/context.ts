import { PageRegion } from '../../consts.js'
import { textUtils } from '../../utils/text.js'
import { CONTEXT_CHARS, REGION_ROLES, REGION_TAGS } from './consts.js'
import type { PageHeading } from './types.js'
import type { PageContext, RefMap } from './types.local.js'

const BLOCKS = new Set(['p', 'li', 'figure', 'blockquote', 'td', 'dd', 'section', 'article', 'header', 'footer', 'aside', 'div', 'form'])
const CHROME = new Set([PageRegion.Header, PageRegion.Nav, PageRegion.Footer, PageRegion.Aside])

export const createPageContext = (document: Document, refs: RefMap): PageContext => {
  const headingList: PageHeading[] = refs.elements()
    .filter(element => /^h[1-6]$/i.test(element.tagName))
    .map(element => ({
      level: Number(element.tagName.slice(1)),
      text: textUtils.textOf(element),
      ref: refs.refOf(element)!,
    }))
    .filter(heading => heading.text.length > 0)
  const hasMain = document.querySelector('main, article, [role="main"]') != null

  const regionOf = (element: Element): PageRegion => {
    let first: PageRegion | undefined
    let inArticle = false
    for (let node: Element | null = element; node != null; node = node.parentElement) {
      const role = node.getAttribute('role')
      const region = (role != null ? REGION_ROLES[role] : undefined) ?? REGION_TAGS[node.tagName.toLowerCase()]
      if (region == null) continue
      first ??= region
      if (region === PageRegion.Article) inArticle = true
    }
    // An article's own header and footer are part of the article.
    if (inArticle && (first === PageRegion.Header || first === PageRegion.Footer)) return PageRegion.Article
    return first ?? PageRegion.Other
  }

  const sectionOf = (element: Element): string | undefined => {
    // A card or a list item that carries its own heading is its own section.
    const own = element.closest('li, figure, a, [class*="card"]')?.querySelector('h1, h2, h3, h4, h5, h6')
    if (own != null && textUtils.textOf(own).length > 0) return textUtils.textOf(own)
    const ref = refs.refOf(element)
    if (ref == null) return undefined
    const order = refs.orderOf(ref)
    let found: PageHeading | undefined
    for (const heading of headingList) {
      if (refs.orderOf(heading.ref) >= order) break
      found = heading
    }
    return found?.text
  }

  const contextOf = (element: Element): string | undefined => {
    let block: Element | null = element.parentElement
    while (block != null && !BLOCKS.has(block.tagName.toLowerCase())) block = block.parentElement
    if (block == null) return undefined
    const text = textUtils.textOf(block)
    return text.length > 0 ? textUtils.truncate(text, CONTEXT_CHARS) : undefined
  }

  const inMain = (element: Element): boolean => {
    if (hasMain) return element.closest('main, article, [role="main"]') != null
    return !CHROME.has(regionOf(element))
  }

  return { regionOf, sectionOf, contextOf, inMain, headings: () => headingList }
}
