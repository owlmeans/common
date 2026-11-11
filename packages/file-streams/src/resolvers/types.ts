/** The head of a response a resolver inspects. */
export interface ResolverResponseHead {
  url: URL
  status: number
  headers: Record<string, string | string[] | undefined>
}

export interface ResolverAccept {
  action: 'accept'
}

export interface ResolverFollow {
  action: 'follow'
  url: URL
  /** Only `cookie` is honoured, and only towards the resolver's own origins. */
  headers?: Record<string, string>
}

export interface ResolverFail {
  action: 'fail'
  reason: string
}

/** What a resolver decides about a response. */
// Three distinct steps a discriminated union names best.
export type ResolverStep = ResolverAccept | ResolverFollow | ResolverFail

/** Reads at most `maxBytes` of the body as text; the bytes are replayed to the caller on `accept`. */
export interface ResolverBodyReader {
  (maxBytes?: number): Promise<string>
}

/** Turns a page or share link into the bytes behind it (Google Drive, Docs exports). */
export interface UrlResolver {
  readonly name: string
  /** Follow-ups one download may take. */
  readonly maxSteps: number
  matches: (url: URL) => boolean
  /** The URL that serves the bytes; throws `ResolverError` for links that cannot (folders). */
  rewrite: (url: URL) => URL
  /** Decides on a final (post-redirect) response before its body reaches the caller. */
  inspect: (head: ResolverResponseHead, readBody: ResolverBodyReader) => Promise<ResolverStep>
  /** Whether a follow-up URL belongs to this resolver (cookies are sent only there). */
  owns: (url: URL) => boolean
}
