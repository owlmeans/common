import { ASSET_EXTENSIONS, TRACKING_PARAMS } from './consts.local.js'
import type { CrawlUrlHelper } from './types.local.js'

export const createCrawlUrlHelper = (): CrawlUrlHelper => {
  const normalize: CrawlUrlHelper['normalize'] = (href, base) => {
    let url: URL
    try {
      url = base != null ? new URL(href, base) : new URL(href)
    } catch {
      return undefined
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
    url.hash = ''
    url.username = ''
    url.password = ''
    for (const name of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.some(pattern => pattern.test(name))) url.searchParams.delete(name)
    }
    return url.href
  }

  const isAsset: CrawlUrlHelper['isAsset'] = url => {
    try {
      const last = new URL(url).pathname.split('/').pop() ?? ''
      const dot = last.lastIndexOf('.')
      return dot > 0 && ASSET_EXTENSIONS.includes(last.slice(dot + 1).toLowerCase())
    } catch {
      return true
    }
  }

  return { normalize, isAsset }
}

export const crawlUrlHelper = createCrawlUrlHelper()
