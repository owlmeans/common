/** The longest robots.txt `Crawl-delay` honoured, ms. */
export const MAX_CRAWL_DELAY_MS = 10_000

/** robots.txt bytes read at most (RFC 9309 asks for at least 500 KiB). */
export const ROBOTS_MAX_BYTES = 512 * 1024

/** Query parameters that only track a visit. */
export const TRACKING_PARAMS: readonly RegExp[] = Object.freeze([/^utm_/i, /^fbclid$/i, /^gclid$/i, /^mc_[ce]id$/i, /^_hs[a-z]+$/i, /^yclid$/i])

/** Extensions of files a page reader does not read. */
export const ASSET_EXTENSIONS: readonly string[] = Object.freeze([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'ico', 'bmp', 'css', 'js', 'mjs', 'json', 'xml', 'rss', 'atom', 'pdf', 'zip',
  'gz', 'tgz', 'rar', '7z', 'tar', 'mp3', 'mp4', 'webm', 'mov', 'avi', 'wav', 'ogg', 'woff', 'woff2', 'ttf', 'otf', 'eot', 'exe',
  'dmg', 'apk', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv',
])

/** Path words of pages that rarely answer an intent — ranked last by the heuristic. */
export const LOW_VALUE_PATHS: readonly RegExp[] = Object.freeze([
  /\/(log-?in|sign-?in|sign-?up|register|account|cart|checkout)(\/|$)/i, /\/(privacy|terms|cookies?|legal|imprint|gdpr)(\/|$)/i,
  /\/(tag|tags|author|category)\//i, /[?&]page=\d+/i,
])

/** Words an intent is not ranked by. */
export const STOP_WORDS: readonly string[] = Object.freeze([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'what', 'how', 'are', 'its', 'our', 'your', 'into', 'about', 'which', 'their',
  'they', 'have', 'has', 'will', 'can', 'all', 'any', 'out', 'use', 'using',
])
