import { PageRegion } from '../../consts.js'

/** Elements whose content is never page text. */
export const SKIPPED_TAGS: ReadonlySet<string> = new Set(['script', 'style', 'noscript', 'template', 'iframe', 'object', 'canvas'])

/** Landmark tags and ARIA roles → region. */
export const REGION_TAGS: Readonly<Record<string, PageRegion>> = Object.freeze({
  header: PageRegion.Header, nav: PageRegion.Nav, main: PageRegion.Main, article: PageRegion.Article,
  aside: PageRegion.Aside, footer: PageRegion.Footer, dialog: PageRegion.Dialog, form: PageRegion.Form,
})

export const REGION_ROLES: Readonly<Record<string, PageRegion>> = Object.freeze({
  banner: PageRegion.Header, navigation: PageRegion.Nav, main: PageRegion.Main, article: PageRegion.Article,
  complementary: PageRegion.Aside, contentinfo: PageRegion.Footer, dialog: PageRegion.Dialog, form: PageRegion.Form,
  search: PageRegion.Form,
})

/** Attributes the DOM outline shows — what identifies a node and what a field is read from. */
export const OUTLINE_ATTRIBUTES: readonly string[] = Object.freeze([
  'id', 'class', 'role', 'aria-label', 'href', 'src', 'alt', 'title', 'datetime', 'itemprop', 'itemtype',
  'rel', 'name', 'type', 'content', 'property', 'placeholder', 'data-testid',
])

/** Hosts whose links are social profiles. */
export const SOCIAL_HOSTS: readonly string[] = Object.freeze([
  'twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'linkedin.com', 'youtube.com', 'tiktok.com',
  'github.com', 'mastodon.social', 'threads.net', 'bsky.app', 'pinterest.com', 'reddit.com', 'discord.gg', 't.me',
])

/** Path / host fragments of tracking pixels. */
export const TRACKING_MARKERS: readonly RegExp[] = Object.freeze([
  /pixel/i, /tracker/i, /beacon/i, /analytics/i, /\/collect\b/i, /doubleclick/i, /facebook\.com\/tr/i, /bat\.bing/i,
])

/** Downloadable files a link may point at. */
export const ASSET_EXTENSIONS = /\.(pdf|zip|gz|tar|rar|7z|docx?|xlsx?|pptx?|csv|mp3|mp4|mov|avi|dmg|exe|apk|jpe?g|png|gif|webp|svg)(\?|#|$)/i

/** Lazy-loading attributes that hold the real image source. */
export const LAZY_SRC_ATTRIBUTES: readonly string[] = Object.freeze(['data-src', 'data-lazy-src', 'data-original', 'data-url'])

export const LAZY_SRCSET_ATTRIBUTES: readonly string[] = Object.freeze(['data-srcset', 'data-lazy-srcset'])

/** Currency amounts: $9, 29 €, £1,200.00, USD 40. */
export const PRICE_PATTERN = /(?:[$€£¥₹]\s?\d[\d,.]*|\d[\d,.]*\s?(?:[$€£¥₹]|USD|EUR|GBP))/g

/** Characters of nearby text kept per image / link context. */
export const CONTEXT_CHARS = 200

/** A page whose main extractor output has fewer words is rendered section by section instead. */
export const ARTICLE_MIN_WORDS = 150
