import type { LlmFetch } from '../plugins/transport/types.js'
import { BODY_HEADERS, NULL_BODY_STATUSES } from './fetch/consts.js'
import type { FetchUtils } from './fetch/types.js'

export const createFetchUtils = (): FetchUtils => {
  const global: LlmFetch = (input, init) => globalThis.fetch(input, init)

  const withBody = (response: Response, body: ReadableStream<Uint8Array>): Response => {
    if (NULL_BODY_STATUSES.includes(response.status)) return response
    const headers = new Headers(response.headers)
    for (const name of BODY_HEADERS) headers.delete(name)

    return new Response(body, { status: response.status, statusText: response.statusText, headers })
  }

  return { global, withBody }
}

export const fetchUtils = createFetchUtils()
