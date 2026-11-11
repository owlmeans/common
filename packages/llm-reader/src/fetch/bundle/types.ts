import type { ReaderFetchPlugin } from '../fetcher/types.js'

export interface LocalBundleOptions {
  /** The directory the bundle is served from — an uploaded prototype: `home.html`, its css, its pictures. */
  root: string
  /** The synthetic origin its files are addressed under. Default `https://bundle.local`. */
  origin?: string
}

/** One file of a bundle. */
export interface LocalBundleFile {
  /** Where it is inside the root, `/`-separated, without a leading slash. */
  path: string
  contentType: string
  bytes: Uint8Array
}

/**
 * A directory served under a synthetic origin, confined to its root: a path with `..`, an encoded
 * separator or NUL, an absolute path, and a symbolic link that resolves outside the root are all
 * refused with `ReaderRefusedError`, never served.
 */
export interface LocalBundle {
  /** The synthetic origin, normalized (`https://bundle.local`). */
  readonly origin: string
  /** Whether a URL belongs to this bundle. */
  serves: (url: string) => boolean
  /** The URL of a relative path inside the bundle — `home.html` → `https://bundle.local/home.html`. */
  urlOf: (path: string) => string
  /**
   * The file a bundle URL names — a directory answers with its `index.html` — or `null` when there is
   * none. `maxBytes` refuses a larger file with `ReaderContentError` before it is read.
   */
  read: (url: string, maxBytes?: number) => Promise<LocalBundleFile | null>
}

/**
 * A reader fetch plugin serving a {@link LocalBundle}: a request under its origin is answered from the
 * root (a missing file is a 404 page), every other request goes on down the chain — to the proxy
 * plugin, the address guard and the network. Put it first in `plugins`.
 */
export interface LocalBundlePlugin extends ReaderFetchPlugin, LocalBundle {}
