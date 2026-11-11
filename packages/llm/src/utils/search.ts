import { LlmSearchError } from '../errors.js'
import { WEB_SEARCH_BACKOFF_CAP_MS, WEB_SEARCH_BACKOFF_MS } from '../search/consts.js'
import type { WebSearchCitation, WebSearchSource } from '../search/types.js'
import type { SearchUtils } from './search/types.js'

/** Error detail kept from a provider body — enough to diagnose, never a payload dump. */
const DETAIL_CHARS = 500

export const createSearchUtils = (): SearchUtils => {
  const redact = (text: string, secret: string): string =>
    (secret.length > 0 ? text.split(secret).join('***') : text).slice(0, DETAIL_CHARS)

  const retryAfterOf = (headers: Headers): number | undefined => {
    const raw = headers.get('retry-after-ms') ?? headers.get('retry-after')
    if (raw == null) return undefined
    const seconds = Number(raw)
    if (Number.isFinite(seconds)) {
      return headers.has('retry-after-ms') ? seconds : seconds * 1000
    }
    const at = Date.parse(raw)
    return Number.isFinite(at) ? Math.max(0, at - Date.now()) : undefined
  }

  /** Provider error bodies: `{error: {type|code, message}}` (OpenAI, Anthropic, OpenRouter). */
  const describe = (body: unknown): { code?: string, message?: string, status?: number } => {
    const error = (body as { error?: unknown } | null)?.error
    if (error == null) return {}
    if (typeof error === 'string') return { message: error }
    const e = error as { type?: unknown, code?: unknown, message?: unknown }
    const code = typeof e.code === 'string' ? e.code : typeof e.type === 'string' ? e.type : undefined
    const status = typeof e.code === 'number' ? e.code : undefined

    return { code, status, message: typeof e.message === 'string' ? e.message : undefined }
  }

  const fail = (
    reason: string, init: { status?: number, code?: string, provider: string, retryAfter?: number, detail?: string },
  ): LlmSearchError => {
    const error = new LlmSearchError(reason)
    error.status = init.status
    error.code = init.code
    error.provider = init.provider
    error.retryAfter = init.retryAfter
    error.detail = init.detail

    return error
  }

  const postJson: SearchUtils['postJson'] = async ({ fetch, url, headers, body, signal, provider, secret }) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
      body: JSON.stringify(body),
      signal,
    })
    const raw = await response.text()
    let parsed: unknown = undefined
    try {
      parsed = raw.length > 0 ? JSON.parse(raw) : undefined
    } catch {
      parsed = undefined
    }
    if (!response.ok) {
      const { code, message } = describe(parsed)
      throw fail(`http-${response.status}`, {
        status: response.status, code, provider, retryAfter: retryAfterOf(response.headers),
        detail: redact(message ?? raw, secret),
      })
    }
    if (parsed == null || typeof parsed !== 'object') {
      throw fail('unreadable-response', { provider, detail: redact(raw, secret) })
    }
    const embedded = describe(parsed)
    if ((parsed as { error?: unknown }).error != null) {
      throw fail('provider-error', {
        status: embedded.status, code: embedded.code, provider, detail: redact(embedded.message ?? raw, secret),
      })
    }

    return parsed as Record<string, unknown>
  }

  const hostOf = (url: string | undefined): string | undefined => {
    if (url == null) return undefined
    try {
      return new URL(url).hostname.toLowerCase()
    } catch {
      return undefined
    }
  }

  const matchesHost = (host: string, domain: string): boolean =>
    host === domain || host.endsWith(`.${domain}`)

  const join: SearchUtils['join'] = output => {
    const separator = output.separator ?? ''
    let text = ''
    const citations: WebSearchCitation[] = []
    output.parts.forEach((part, index) => {
      if (index > 0 && text.length > 0 && part.text.length > 0) {
        text += separator
      }
      const offset = text.length
      for (const citation of part.citations) {
        citations.push(citation.start != null && citation.end != null
          ? { ...citation, start: citation.start + offset, end: citation.end + offset }
          : citation)
      }
      text += part.text
    })

    return { text: text.trim().length > 0 ? text : '', citations }
  }

  const mergeSources = (sources: WebSearchSource[], citations: WebSearchCitation[]): WebSearchSource[] => {
    const byUrl = new Map<string, WebSearchSource>()
    const add = (source: WebSearchSource): void => {
      const known = byUrl.get(source.url)
      if (known == null) {
        byUrl.set(source.url, { ...source })
        return
      }
      known.title ??= source.title
      known.age ??= source.age
      known.snippet ??= source.snippet
    }
    sources.filter(source => source.url.length > 0).forEach(add)
    citations.forEach(citation => add({
      url: citation.url,
      ...(citation.title != null ? { title: citation.title } : {}),
      ...(citation.quote != null ? { snippet: citation.quote } : {}),
    }))

    return [...byUrl.values()]
  }

  const covers = (url: URL, entry: string): boolean => {
    const [domain = '', ...path] = entry.trim().toLowerCase().replace(/^[a-z]+:\/\//, '').split('/')
    const prefix = path.length > 0 ? `/${path.join('/')}` : ''
    return domain.length > 0 && matchesHost(url.hostname.toLowerCase(), domain)
      && (prefix.length === 0 || url.pathname.toLowerCase().startsWith(prefix))
  }

  const inBounds = (url: string, allowed?: string[], blocked?: string[]): boolean => {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return false
    }
    if (allowed != null && !allowed.some(entry => covers(parsed, entry))) return false
    return blocked == null || !blocked.some(entry => covers(parsed, entry))
  }

  const unique = (values: (string | undefined | null)[]): string[] =>
    [...new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0))]

  const backoff = (attempt: number, retryAfter?: number): number =>
    Math.min(retryAfter ?? WEB_SEARCH_BACKOFF_MS * Math.pow(2, Math.max(0, attempt - 1)), WEB_SEARCH_BACKOFF_CAP_MS)

  const range: SearchUtils['range'] = (start, end) =>
    typeof start === 'number' && typeof end === 'number' && end > start && start >= 0 ? { start, end } : {}

  return { postJson, hostOf, matchesHost, join, mergeSources, unique, backoff, range, inBounds }
}

export const searchUtils = createSearchUtils()
