import { Defuddle } from 'defuddle/node'
import { parseHTML } from 'linkedom'
import TurndownService from 'turndown'
import { ARTICLE_MIN_WORDS } from './consts.js'
import type { PageContent, PageSignals } from './types.js'

const words = (text: string): number => text.split(/\s+/).filter(word => /\w/.test(word)).length

const CHROME = 'header, nav, footer, aside, [role="banner"], [role="navigation"], [role="contentinfo"], [role="complementary"]'

const createTurndown = (): TurndownService => {
  const service = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*' })
  service.remove(['script', 'style', 'noscript', 'template', 'iframe', 'form', 'button', 'input', 'select', 'textarea'])
  // Inline SVG is drawing, not text; `svg` is not in the HTML tag map turndown's filter type knows.
  service.remove(node => node.nodeName.toLowerCase() === 'svg')
  return service
}

/**
 * The main content as Markdown. An article goes through Defuddle — on its OWN parse, because it
 * edits the document it reads, and with `useAsync: false`, because its site extractors would
 * otherwise call third-party APIs outside the reader's fetcher, proxy and address guard. A page
 * that is not article-shaped (a landing page, a listing, an app) is rendered section by section
 * instead: an article extractor drops most of what such a page is.
 */
export const readContent = async (html: string, url: string, signals: PageSignals): Promise<PageContent> => {
  const articleShaped = signals.hasArticle || (signals.mainWords >= ARTICLE_MIN_WORDS * 2 && signals.repeatedItems < 2)
  if (articleShaped) {
    try {
      const { document } = parseHTML(html)
      const article = await Defuddle(document as unknown as Document, url, { markdown: true, useAsync: false })
      if (article.wordCount >= ARTICLE_MIN_WORDS && article.content.trim().length > 0) {
        return { markdown: article.content.trim(), wordCount: article.wordCount, method: 'article' }
      }
    } catch {
      // A page the extractor chokes on is still rendered by structure below.
    }
  }
  const { document } = parseHTML(html)
  const root = (document.querySelector('main, [role="main"]') ?? document.body) as unknown as Element | null
  if (root == null) return { markdown: '', wordCount: 0, method: 'structure' }
  if (root === (document.body as unknown as Element)) {
    Array.from(root.querySelectorAll(CHROME)).forEach(node => node.remove())
  }
  const markdown = createTurndown().turndown(root.innerHTML).replace(/\n{3,}/g, '\n\n').trim()

  return { markdown, wordCount: words(markdown), method: 'structure' }
}
