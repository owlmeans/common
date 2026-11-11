import type { LlmFetch } from '../../plugins/transport/types.js'
import type {
  LlmSearchOutput, WebSearchCitation, WebSearchSource,
} from '../../search/types.js'

export interface SearchPostParams {
  fetch: LlmFetch
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
  signal: AbortSignal
  provider: string
  /** Redacted from any error detail. */
  secret: string
}

export interface JoinedAnswer {
  text: string
  citations: WebSearchCitation[]
}

/** The wire plumbing every search dialect shares. Library-private. */
export interface SearchUtils {
  /**
   * POST a JSON body and read the JSON answer. A non-2xx status, or a 200 whose body carries a
   * top-level `error`, throws an `LlmSearchError` with `status`, `code`, `retryAfter` and a
   * redacted `detail` — never the raw body.
   */
  postJson: (params: SearchPostParams) => Promise<Record<string, unknown>>
  /** The lower-cased host of a URL, or `undefined` when it does not parse. */
  hostOf: (url: string | undefined) => string | undefined
  /** `host` is `domain` or one of its subdomains. */
  matchesHost: (host: string, domain: string) => boolean
  /** Join the plugin's parts with its separator, shifting every citation range into the joined text. */
  join: (output: LlmSearchOutput) => JoinedAnswer
  /** Sources deduplicated by URL (first title wins), with every cited URL added. */
  mergeSources: (sources: WebSearchSource[], citations: WebSearchCitation[]) => WebSearchSource[]
  /** Distinct non-empty strings, first occurrence order. */
  unique: (values: (string | undefined | null)[]) => string[]
  /** How long to wait before 0-based `attempt` (> 0): doubling, `retry-after` honoured, capped. */
  backoff: (attempt: number, retryAfter?: number) => number
  /**
   * Whether `url` lies inside the caller's domain bound: under one of `allowed` (when given) and
   * under none of `blocked`. Entries are bare domains, optionally with a path (`example.com/blog`),
   * and cover subdomains.
   */
  inBounds: (url: string, allowed?: string[], blocked?: string[]) => boolean
  /** A citation range only when it is a real, non-empty span. */
  range: (start: unknown, end: unknown) => Pick<WebSearchCitation, 'start' | 'end'>
}
