/** The rules a robots.txt sets for one user agent. */
export interface RobotsRules {
  /** Whether a path (with its query) may be fetched. */
  allows: (path: string) => boolean
  /** `Crawl-delay`, seconds. */
  delay?: number
}

/** robots.txt read as RFC 9309 says: the most specific user-agent group, the longest matching rule, Allow on a tie. */
export interface RobotsHelper {
  parse: (text: string, userAgent: string) => RobotsRules
  readonly allowAll: RobotsRules
  readonly disallowAll: RobotsRules
}

/** Crawl URLs. */
export interface CrawlUrlHelper {
  /** An absolute http(s) URL without fragment, default port or tracking parameters — or `undefined`. */
  normalize: (href: string, base?: string) => string | undefined
  /** Whether a URL path looks like a file a page reader cannot read (an image, an archive, a PDF …). */
  isAsset: (url: string) => boolean
}

/** One URL waiting in the crawl queue. */
export interface CrawlItem {
  url: string
  depth: number
  from?: string
}

/** One Allow/Disallow line of a robots.txt group. */
export interface RobotsRule {
  allow: boolean
  pattern: string
  matcher: RegExp
}
