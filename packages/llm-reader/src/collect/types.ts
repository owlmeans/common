import type { CollectKind, CollectRole, CollectStatus } from '../consts.js'
import type { PageFetcher } from '../fetch/fetcher/types.js'
import type { RenderStep } from '../render/types.js'

/** What the sink is told about one file. */
export interface CollectFileInfo {
  /** The absolute URL the bytes came from. */
  url: string
  role: CollectRole
  /** The media type the answer declared, without parameters. */
  mime?: string
  /** The size the answer or the source declared. */
  size?: number
  /** The remote file name — `Content-Disposition`, the URL, or the source's entry. */
  name?: string
}

export interface CollectWritten {
  /** Bytes the sink stored. */
  bytes: number
}

/**
 * Where collected files go — a directory (`createDirectoryCollectSink`), a workspace scope, an
 * upload intake. The collector hands it relative POSIX paths it already made safe (no `..`, no
 * leading `/`, no backslash or NUL), and streams it every file, never a buffer of the whole.
 */
export interface CollectSink {
  /**
   * Store one file and resolve once the stream is fully written. A stream that errors (a limit hit
   * mid-file) must leave nothing at `path`; the write rejects.
   */
  write: (path: string, stream: ReadableStream<Uint8Array>, info: CollectFileInfo) => Promise<CollectWritten>
}

export interface CollectLimits {
  /** Files written by one collect, the manifest excluded. Default 100. */
  maxFiles: number
  /** Bytes of one file. Default 12 MiB. */
  maxFileBytes: number
  /** Bytes of every file one collect writes. Default 100 MiB. */
  maxTotalBytes: number
  /** Stylesheets, fonts and pictures of one page. Default 150. */
  maxAssets: number
  /** Bytes of one page's assets together. Default 30 MiB. */
  maxAssetBytes: number
}

export interface CollectOptions {
  sink: CollectSink
  limits?: Partial<CollectLimits>
  /** A folder every path is written under (`links/01-site`) — relative, made safe like any path. */
  prefix?: string
  /** The proxy key; the target host when omitted. */
  key?: string
  signal?: AbortSignal
  /**
   * Render the page: `true` always, `false` never; unset, only a page that turned out to be an app
   * shell, when a renderer is configured. A rendered page is saved as its DOM snapshot.
   */
  render?: boolean
  /** Deadline of one file's download, ms. Default 120 000. */
  timeout?: number
}

/** One file of a collect — written, or why not. */
export interface CollectItem {
  url: string
  role: CollectRole
  status: CollectStatus
  /** Where it was written, prefix included (or where it would have gone). */
  path?: string
  bytes?: number
  mime?: string
  /** Why it was skipped, refused or failed: `max-files`, `max-file-bytes`, `status-404`, an error message … */
  reason?: string
}

/** What one link became. `collect` throws only for an abort or a misconfiguration — everything else is an item. */
export interface CollectResult {
  /** The link as given. */
  url: string
  /** Where it ended up after redirects. */
  finalUrl: string
  kind: CollectKind
  /** The source that expanded the link (`s3`, a plugin's name). */
  source?: string
  /** The main file: the page of a bundle, the one file of a direct link or a one-entry source. */
  entry?: string
  /** `bundle.json` of a bundle. */
  manifest?: string
  /** Every file, in the order it was decided — the page, its assets, the manifest; or the source's entries. */
  items: CollectItem[]
  /** Files written, the manifest included. */
  files: number
  /** Bytes written, the manifest included. */
  bytes: number
}

/** A page already in hand — an HTML file whose stylesheets, fonts and pictures still live elsewhere. */
export interface BundleInput {
  /** The URL its relative references resolve against. */
  url: string
  html: string
  /** Its local path; derived from `url` when omitted. */
  entry?: string
}

/** The answer to a link no source matched, as a source sees it before claiming the link. */
export interface SourceAnswer {
  url: string
  finalUrl: string
  status: number
  headers: Record<string, string>
  /** Lower-cased media type without parameters. */
  contentType: string
  /** Up to `maxBytes` (default 4 KiB) of the body as text, read without consuming it. */
  peek: (maxBytes?: number) => Promise<string>
}

export interface SourceFetchInit {
  headers?: Record<string, string>
  signal?: AbortSignal
  /** Body cap, bytes. Default 8 MiB. */
  maxBytes?: number
}

/** What a source works with. */
export interface ReaderSourceContext {
  /**
   * A guarded fetch: every hop checked by the reader's address guard and sent through its plugins and
   * transport (the injected fetch when there is one); any status comes back, the body unread.
   */
  fetch: (url: string, init?: SourceFetchInit) => Promise<Response>
  limits: CollectLimits
  key?: string
  signal?: AbortSignal
}

/** One file a source expanded a link to. */
export interface SourceEntry {
  /** Relative POSIX path inside the link's folder, as the source names it (`sub/a.txt`). */
  path: string
  /** Where its bytes are fetched from — through the same guarded chain. */
  url: string
  name?: string
  size?: number
  mime?: string
}

/**
 * A link-expanding provider — an S3 prefix, a Drive folder: one link becomes many files, each then
 * downloaded like a direct file under the collect's limits.
 */
export interface ReaderSource {
  readonly name: string
  /** Whether it takes the link, from the URL alone, before any request. */
  matches: (url: string) => boolean
  /** Whether it takes a link nothing matched, from that link's answer (an S3 listing, an S3 error). */
  recognizes?: (answer: SourceAnswer) => Promise<boolean>
  /** The files behind the link. Throws when it cannot expand it (a refused listing). */
  expand: (url: string, context: ReaderSourceContext) => Promise<SourceEntry[]>
}

export interface CollectorOptions {
  fetcher: PageFetcher
  /** Renders app shells (and every page under `render: true`) — the reader's render step. */
  render?: RenderStep
  /** Consulted in order: `matches` before any request, `recognizes` after the link answered. */
  sources?: ReaderSource[]
  /** Defaults under every collect's own `limits`. */
  limits?: Partial<CollectLimits>
}

/** Turns one link into files written to a sink. */
export interface Collector {
  /**
   * An HTML page → a bundle (the page, its stylesheets with `@import` chains, CSS `url()` fonts and
   * pictures, `img`/`srcset`/`picture`/icons/posters, all rewritten to relative local paths; scripts,
   * inline handlers, `javascript:` URLs, `<base>` and meta refresh removed; `bundle.json`). Any other
   * answer → the file streamed as is. A link a source matches or recognizes → its entries.
   */
  collect: (url: string, options: CollectOptions) => Promise<CollectResult>
  /** Bundle a page already in hand: its assets fetched, its references rewritten, `bundle.json` written. */
  bundle: (page: BundleInput, options: CollectOptions) => Promise<CollectResult>
}
