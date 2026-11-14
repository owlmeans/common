import type { CollectStatus } from '../../consts.js'
import type { ReaderFetchPlugin } from '../fetcher/types.js'

export interface LocalBundleOptions {
  /** The directory the bundle is served from — an uploaded prototype: `home.html`, its css, its pictures. */
  root: string
  /** The synthetic origin its files are addressed under. Default `https://bundle.local`. */
  origin?: string
}

/** An asset a collected bundle did not keep, and why. */
export interface BundleSkip {
  url: string
  status: CollectStatus
  reason: string
}

/**
 * `bundle.json` — written by `collect` at the root of a page bundle. Its `files` map lets
 * {@link createLocalBundlePlugin} answer the ORIGINAL URLs from disk, so the bundle renders and reads
 * offline.
 */
export interface BundleManifest {
  /** {@link BUNDLE_MANIFEST_VERSION}. */
  version: number
  /** The link as given. */
  url: string
  /** Where it ended up (redirects, the rendered page). */
  finalUrl: string
  /** The page's local path. */
  entry: string
  /** Whether the HTML is a rendered snapshot (an app shell). */
  rendered: boolean
  collectedAt: string
  /** Every file written: absolute URL → path relative to the manifest. */
  files: Record<string, string>
  skipped: BundleSkip[]
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
  /** The root's `bundle.json`, when it holds one (read once, when the plugin is built). */
  readonly manifest?: BundleManifest
  /**
   * Whether a URL belongs to this bundle: its synthetic origin, a URL the manifest maps, or a path
   * under the collected page's own origin that exists in the root.
   */
  serves: (url: string) => boolean
  /** The URL of a relative path inside the bundle — `home.html` → `https://bundle.local/home.html`. */
  urlOf: (path: string) => string
  /**
   * The file a bundle URL (or a URL the manifest maps) names — a directory answers with its
   * `index.html` — or `null` when there is none. `maxBytes` refuses a larger file with
   * `ReaderContentError` before it is read.
   */
  read: (url: string, maxBytes?: number) => Promise<LocalBundleFile | null>
}

/**
 * A reader fetch plugin serving a {@link LocalBundle}: a request under its origin (or one its manifest
 * maps) is answered from the root (a missing file is a 404 page), every other request goes on down the
 * chain — to the proxy plugin, the address guard and the network. Put it first in `plugins`.
 */
export interface LocalBundlePlugin extends ReaderFetchPlugin, LocalBundle {}
