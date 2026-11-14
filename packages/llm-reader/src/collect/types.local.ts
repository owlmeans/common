import type { CollectRole, CollectStatus } from '../consts.js'

/** Local paths of collected files. Package-private. */
export interface CollectPaths {
  /** A relative POSIX path with every segment kept, or `undefined` when one could leave the root (`..`, absolute, `\`, NUL). */
  safe: (path: string) => string | undefined
  /** Safe parts joined with `/`, empty ones dropped. */
  join: (...parts: Array<string | undefined>) => string
  /** One path segment made storable: control and reserved characters replaced, length capped, its extension kept. */
  segment: (text: string) => string
  /** A bundled page's own path: `/` → `index.html`, `/docs/` → `docs/index.html`, `/pricing` → `pricing.html`. */
  entryOf: (url: string) => string
  /**
   * An asset's path: its URL path under the page's origin, `external/<host>/<path>` elsewhere; an
   * extension from `mime` when the URL has none, the query folded into a short hash.
   */
  assetOf: (url: string, pageOrigin: string, mime?: string, role?: CollectRole) => string
  /** A reference from the file at `from` to the file at `to`, URL-encoded, both relative to one root. */
  relative: (from: string, to: string) => string
  /** A downloaded file's name: `Content-Disposition` (`filename*` first), else the URL's last segment, else a fallback with an extension from `mime`. */
  nameOf: (disposition: string | undefined, url: string, mime?: string) => string
  /** The lower-cased extension of a path or URL path, without the dot. */
  extensionOf: (path: string) => string
}

/** A reference a stylesheet makes. */
export interface CssReference {
  /** As written (unescaped, unquoted). */
  href: string
  /** `import` for `@import`, `url` for every `url()`. */
  kind: 'import' | 'url'
}

/** CSS references read and rewritten in place — the text is never re-generated. Package-private. */
export interface CssRefs {
  references: (css: string) => CssReference[]
  /** `replace` answers the new reference, or `undefined` to keep it. */
  rewrite: (css: string, replace: (reference: CssReference) => string | undefined) => string
}

/** A resource a page loads that a bundle keeps. */
export interface DocumentReference {
  /** Absolute URL, fragment removed. */
  url: string
  role: CollectRole
}

/** One page's HTML made into a bundle page. Package-private. */
export interface BundleDocument {
  /** Remove scripts, inline handlers, `javascript:` URLs, `<base>`, meta refresh and CSP; declare UTF-8. */
  sanitize: () => void
  /** Stylesheets, pictures, icons and `url()`s of inline CSS, in document order, each URL once. */
  references: () => DocumentReference[]
  /**
   * Point every kept reference at its local copy: `localOf` answers the reference to write for an
   * absolute URL (or `undefined` to keep the URL absolute). Links and form actions become absolute.
   */
  rewrite: (localOf: (url: string) => string | undefined) => void
  /** The document serialized. */
  html: () => string
}

/** One page's share of a collect's limits. */
export interface PageAllowance {
  assets: number
  bytes: number
}

/** A stream counted against the limits. */
export interface MeteredStream {
  stream: ReadableStream<Uint8Array>
  /** Bytes through so far. */
  bytes: () => number
  /** The limit it ran into (`max-file-bytes`, `max-total-bytes`, `max-asset-bytes`), if any. */
  exceeded: () => string | undefined
}

/** The limits of one collect, counted as files are admitted and bytes flow. Package-private. */
export interface CollectBudget {
  /** Reserve a file (an asset of `page` counts against its page too); `undefined`, or the limit in the way. */
  admit: (size: number | undefined, page?: PageAllowance) => string | undefined
  /** Give back a reserved file and the bytes it had counted — its write did not stay. */
  release: (bytes: number, page?: PageAllowance) => void
  meter: (stream: ReadableStream<Uint8Array>, page?: PageAllowance) => MeteredStream
  /** A fresh page allowance. */
  page: () => PageAllowance
}

/** A body whose head can be looked at before it is handed on. */
export interface PeekableBody {
  peek: (maxBytes: number) => Promise<string>
  /** The whole body, the peeked head included. */
  stream: () => ReadableStream<Uint8Array>
  /** The whole body in memory — a page — refused with `ReaderContentError('too-large:…')` past `maxBytes`. */
  read: (maxBytes: number) => Promise<Uint8Array>
  cancel: () => Promise<void>
}

/** One asset of a bundle while it is collected. */
export interface AssetState {
  url: string
  role: CollectRole
  status: CollectStatus
  path?: string
  bytes?: number
  mime?: string
  reason?: string
  /** Still being fetched or written. */
  pending: boolean
  done?: Promise<AssetState>
}

export interface SrcsetCandidate {
  url: string
  descriptor: string
}
