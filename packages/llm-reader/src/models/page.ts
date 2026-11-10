import { memoHelper } from '@owlmeans/context'
import { parseHTML } from 'linkedom'
import { readContent } from './page/content.js'
import { createPageContext } from './page/context.js'
import { createDomIndex } from './page/dom.js'
import { createRefMap } from './page/refs.js'
import { readImages } from './page/images.js'
import { readLinks } from './page/links.js'
import { metadataHelper } from './page/metadata.js'
import { readSignals } from './page/signals.js'
import { textUtils } from '../utils/text.js'
import type { PageContent, PageModel, PageSource } from './page/types.js'

/**
 * A parsed page bound to its source. Nothing is computed until asked for, and everything is
 * computed once: the document is parsed on first use, refs are assigned once so links, images and
 * the DOM index agree on them, and the content extractor works on a separate parse.
 */
export const makePageModel = (source: PageSource): PageModel => {
  const url = source.rendered?.finalUrl ?? source.fetched?.finalUrl ?? source.url
  const html = source.rendered?.html ?? source.html

  const document = memoHelper.once(() => parseHTML(html).document as unknown as Document)
  const refs = memoHelper.once(() => createRefMap(document()))
  const context = memoHelper.once(() => createPageContext(document(), refs()))
  const signals = memoHelper.once(() => readSignals(document(), url, context()))
  let content: Promise<PageContent> | undefined

  return {
    url,
    html,
    ...(source.fetched != null ? { fetched: source.fetched } : {}),
    ...(source.rendered != null ? { rendered: source.rendered } : {}),
    document,
    meta: memoHelper.once(() => metadataHelper.read(document(), url)),
    content: () => content ??= readContent(html, url, signals()),
    outline: () => context().headings(),
    links: memoHelper.once(() => readLinks(document(), url, refs(), context())),
    images: memoHelper.once(() => readImages(document(), url, refs(), context())),
    signals,
    stylesheets: memoHelper.once(() => Array.from(document().querySelectorAll('link[rel~="stylesheet"][href]'))
      .map(link => textUtils.absolute(link.getAttribute('href'), url))
      .filter((href): href is string => href != null)),
    styles: memoHelper.once(() => Array.from(document().querySelectorAll('style'))
      .map(style => style.textContent ?? '')
      .filter(css => css.trim().length > 0)),
    dom: memoHelper.once(() => createDomIndex(document(), refs())),
  }
}
