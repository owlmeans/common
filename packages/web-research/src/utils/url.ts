import { TRACKING_PARAMS } from './url/consts.js'
import type { UrlUtils } from './url/types.js'

export const createUrlUtils = (): UrlUtils => {
  const normalize: UrlUtils['normalize'] = url => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
      parsed.hash = ''
      parsed.username = ''
      parsed.password = ''
      for (const key of [...parsed.searchParams.keys()]) {
        if (TRACKING_PARAMS.test(key)) parsed.searchParams.delete(key)
      }
      return parsed.href
    } catch {
      return null
    }
  }

  const blocked: UrlUtils['blocked'] = (url, domains) => {
    try {
      const host = new URL(url).hostname.toLowerCase()
      return domains.some(domain => host === domain || host.endsWith(`.${domain}`))
    } catch {
      return true
    }
  }

  const loggable: UrlUtils['loggable'] = url => {
    try {
      const parsed = new URL(url)
      return `${parsed.origin}${parsed.pathname}`
    } catch {
      return ''
    }
  }

  return { normalize, blocked, loggable }
}

export const urlUtils = createUrlUtils()
