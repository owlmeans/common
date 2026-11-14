/** How deep a chain of CSS `@import`s is followed. */
export const MAX_IMPORT_DEPTH = 4

/** Assets of one page fetched at once. */
export const ASSET_CONCURRENCY = 4

/** Body cap of a source's own requests (listings), bytes. */
export const DEFAULT_SOURCE_FETCH_BYTES = 8 * 1024 * 1024

/** What a source's `peek` reads by default, bytes. */
export const DEFAULT_PEEK_BYTES = 4096

/** Media types a page is bundled from. */
export const HTML_TYPES: readonly string[] = Object.freeze(['text/html', 'application/xhtml+xml'])

/** Media types an asset (other than a page) is never kept as: they would run in the bundle. */
export const ACTIVE_ASSET_TYPES: readonly RegExp[] = Object.freeze([
  /^text\/html$/, /^application\/xhtml\+xml$/, /javascript$/, /ecmascript$/, /^application\/x-sh$/,
])

/** `rel` tokens of a `<link>` whose `href` is a picture. */
export const ICON_RELS: readonly string[] = Object.freeze(['icon', 'apple-touch-icon', 'apple-touch-icon-precomposed', 'mask-icon'])

/** `rel` tokens of a `<link>` that loads a script — removed with the scripts. */
export const SCRIPT_RELS: readonly string[] = Object.freeze(['modulepreload'])

/** Attributes whose `javascript:` URL is removed. */
export const URL_ATTRIBUTES: readonly string[] = Object.freeze([
  'href', 'src', 'action', 'formaction', 'xlink:href', 'data', 'poster', 'background', 'ping', 'cite', 'manifest',
])

/** File extensions read as a font. */
export const FONT_EXTENSIONS: readonly string[] = Object.freeze(['woff', 'woff2', 'ttf', 'otf', 'eot'])

/** File extensions read as a picture. */
export const IMAGE_EXTENSIONS: readonly string[] = Object.freeze([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'ico', 'bmp', 'cur', 'apng', 'jfif',
])

/** The extension a file without one gets, by media type. */
export const EXTENSION_BY_MIME: Readonly<Record<string, string>> = Object.freeze({
  'text/html': 'html',
  'application/xhtml+xml': 'xhtml',
  'text/css': 'css',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/csv': 'csv',
  'application/json': 'json',
  'application/xml': 'xml',
  'text/xml': 'xml',
  'application/pdf': 'pdf',
  'application/zip': 'zip',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/bmp': 'bmp',
  'font/woff': 'woff',
  'font/woff2': 'woff2',
  'font/ttf': 'ttf',
  'font/otf': 'otf',
  'application/font-woff': 'woff',
  'application/font-woff2': 'woff2',
  'application/x-font-ttf': 'ttf',
  'application/vnd.ms-fontobject': 'eot',
  'video/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
})

/** The name a file gets when neither its answer nor its URL names it. */
export const FALLBACK_FILE_NAME = 'download'

/** Bytes of one path segment at most (its extension kept). */
export const MAX_SEGMENT_LENGTH = 120

/** Statuses a `Response` carries without a body. */
export const NULL_BODY_STATUSES: ReadonlySet<number> = new Set([101, 103, 204, 205, 304])

/**
 * Comments (kept as they are), `@import "x"` / `@import url(x)`, and every other `url(x)` — quoted
 * with either quote, or bare.
 */
export const CSS_TOKENS = /\/\*[\s\S]*?\*\/|@import\s+(?:url\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|((?:\\.|[^)'"\s\\])*))\s*\)|"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')|url\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'|((?:\\.|[^)'"\s\\])*))\s*\)/gi

/** Attributes that hold a single URL the browser loads or follows, made absolute once `<base>` is gone. */
export const ABSOLUTE_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  a: ['href'], area: ['href'], form: ['action'], iframe: ['src'], frame: ['src'], embed: ['src'], object: ['data'],
  video: ['src'], audio: ['src'], track: ['src'], source: ['src'], button: ['formaction'], input: ['formaction'], blockquote: ['cite'],
  q: ['cite'], del: ['cite'], ins: ['cite'],
})

/** Elements whose `data:` URL would run a document. */
export const FRAME_TAGS: ReadonlySet<string> = new Set(['iframe', 'frame', 'object', 'embed'])

/** Attribute names (beyond the URL ones) SVG animation can set a `javascript:` URL through. */
export const ANIMATION_ATTRIBUTES: readonly string[] = Object.freeze(['to', 'from', 'values'])
