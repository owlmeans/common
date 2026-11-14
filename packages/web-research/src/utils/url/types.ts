/** URL primitives the pipelines share. */
export interface UrlUtils {
  /** An http(s) URL without its fragment and tracking parameters, or `null` when it is not one. */
  normalize: (url: string) => string | null
  /** Whether the URL's host is one of `domains` or under one. */
  blocked: (url: string, domains: readonly string[]) => boolean
  /** Origin and path only — what a log line may carry. */
  loggable: (url: string) => string
}
