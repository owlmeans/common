import { Readable } from 'node:stream'
import { HttpError } from './errors.js'
import {
  NULL_BODY_STATUSES, PINNED_FETCH_DROPPED_REQUEST_HEADERS, PINNED_FETCH_DROPPED_RESPONSE_HEADERS, PINNED_FETCH_METHODS,
} from './pinned-fetch/consts.local.js'
import type { PinnedFetch, PinnedFetchOptions } from './pinned-fetch/types.js'
import { createHttpClient } from './http.js'
import { REDIRECT_STATUSES } from './http/consts.js'
import type { HttpMethod } from './http/types.js'
import { signalUtils } from './utils/signals.js'
import { streamUtils } from './utils/streams.js'

/**
 * A `fetch` whose connections are pinned at connect time — hand it to code written against the
 * WHATWG API (`@owlmeans/llm-reader`, a renderer) so its traffic gets the policy, the proxies and
 * the resolvers of {@link createHttpClient}. This module and its imports never load the AWS SDK or
 * the S3 modules: import it from `@owlmeans/file-streams/fetch`.
 */
export const createPinnedFetch = (options: PinnedFetchOptions = {}): PinnedFetch => {
  const { client: given, ...clientOptions } = options
  const client = given ?? createHttpClient(clientOptions)

  const headersOf = (input: string | URL | Request, init?: RequestInit): Record<string, string> => {
    const merged = new Headers(input instanceof Request ? input.headers : undefined)
    new Headers(init?.headers).forEach((value, name) => merged.set(name, value))
    const headers: Record<string, string> = {}
    merged.forEach((value, name) => {
      if (!PINNED_FETCH_DROPPED_REQUEST_HEADERS.includes(name)) {
        headers[name] = value
      }
    })

    return headers
  }

  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    if (!PINNED_FETCH_METHODS.includes(method)) {
      throw new HttpError(`method:${method}`)
    }
    if (init?.body != null) {
      throw new HttpError('body')
    }
    const mode = init?.redirect ?? (input instanceof Request ? input.redirect : 'follow')
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined) ?? undefined
    signalUtils.throwIfAborted(signal)

    const response = await client.request(url, {
      method: method as HttpMethod,
      headers: headersOf(input, init),
      signal,
      redirect: mode === 'follow' ? 'follow' : 'manual',
      anyStatus: true,
    })
    const isRedirect = REDIRECT_STATUSES.includes(response.status) && response.headers.location != null
    if (mode === 'error' && isRedirect) {
      streamUtils.discard(response.body)
      throw new HttpError('redirect')
    }

    const headers = new Headers()
    for (const [name, value] of Object.entries(response.headers)) {
      if (value == null || PINNED_FETCH_DROPPED_RESPONSE_HEADERS.includes(name)) {
        continue
      }
      if (response.decoded === true && (name === 'content-encoding' || name === 'content-length')) {
        continue
      }
      for (const one of Array.isArray(value) ? value : [value]) {
        headers.append(name, one)
      }
    }

    let body: ReadableStream<Uint8Array> | null = null
    if (method === 'HEAD' || NULL_BODY_STATUSES.includes(response.status)) {
      streamUtils.discard(response.body)
    } else {
      // The client stops listening once the head arrived; an abort must still end the body.
      const release = signalUtils.onAbort(signal, reason => response.body.destroy(reason as Error))
      response.body.once('close', release)
      body = Readable.toWeb(response.body) as unknown as ReadableStream<Uint8Array>
    }

    const answer = new Response(body, { status: response.status, headers })
    Object.defineProperty(answer, 'url', { value: response.url.href })
    if (response.redirects > 0) {
      Object.defineProperty(answer, 'redirected', { value: true })
    }

    return answer
  }
}
