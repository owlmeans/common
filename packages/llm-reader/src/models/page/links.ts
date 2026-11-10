import { LinkKind, PageRegion } from '../../consts.js'
import { textUtils } from '../../utils/text.js'
import { ASSET_EXTENSIONS, SOCIAL_HOSTS } from './consts.js'
import type { PageLink } from './types.js'
import type { PageContext, RefMap } from './types.local.js'

const kindOf = (anchor: Element, href: string, url: string, region: PageRegion): LinkKind => {
  const raw = anchor.getAttribute('href') ?? ''
  const rel = (anchor.getAttribute('rel') ?? '').toLowerCase()
  const host = textUtils.siteOf(url)
  const classes = `${anchor.getAttribute('class') ?? ''} ${anchor.getAttribute('role') ?? ''}`.toLowerCase()
  if (raw.startsWith('#')) return LinkKind.Anchor
  if (/\b(next|prev)\b/.test(rel) || anchor.closest('.pagination, [class*="pagination"], [aria-label*="pagination" i]') != null) return LinkKind.Pagination
  if (SOCIAL_HOSTS.some(social => host === social || host.endsWith(`.${social}`))) return LinkKind.Social
  if (ASSET_EXTENSIONS.test(href)) return LinkKind.Asset
  if (/\b(btn|button|cta)\b/.test(classes)) return LinkKind.Action
  if (region === PageRegion.Nav || region === PageRegion.Header) return LinkKind.Nav
  if (region === PageRegion.Footer) return LinkKind.Footer
  if (region === PageRegion.Main || region === PageRegion.Article) return LinkKind.Content
  return LinkKind.Other
}

/** Every http(s) link with the context it sits in. */
export const readLinks = (document: Document, url: string, refs: RefMap, context: PageContext): PageLink[] => {
  const site = textUtils.siteOf(url)
  return Array.from(document.querySelectorAll('a[href], area[href]')).flatMap((anchor, order) => {
    const href = textUtils.absolute(anchor.getAttribute('href'), url)
    if (href == null) return []
    const region = context.regionOf(anchor)
    const text = textUtils.textOf(anchor)
      || anchor.getAttribute('aria-label')
      || anchor.getAttribute('title')
      || anchor.querySelector('img[alt]')?.getAttribute('alt')
      || ''
    const section = context.sectionOf(anchor)
    const title = anchor.getAttribute('title')

    return [{
      url: href,
      text: textUtils.truncate(textUtils.collapse(text), 160),
      ...(title != null ? { title } : {}),
      rel: (anchor.getAttribute('rel') ?? '').split(/\s+/).filter(r => r.length > 0),
      region,
      ...(section != null ? { section } : {}),
      internal: textUtils.siteOf(href) === site,
      kind: kindOf(anchor, href, href, region),
      order,
      ref: refs.refOf(anchor) ?? '',
    }]
  })
}
