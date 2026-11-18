import { ModelEffort } from '@owlmeans/llm-common'
import { effortUtils } from '../../utils/effort.js'
import { fetchUtils } from '../../utils/fetch.js'
import type { LlmFetch } from '../transport/types.js'
import type { LlmStreamResume } from '../types.js'
import { BACKGROUND_FETCH, BACKGROUND_TIMINGS, BackgroundMode, RESPONSES_PATH } from './background/consts.js'
import { createBackgroundSplice } from './background/splice.js'
import type {
  BackgroundMark, BackgroundTimings, OpenAiBackgroundHelper, OpenAiBackgroundOptions,
} from './background/types.js'

export const createOpenAiBackgroundHelper = (options: OpenAiBackgroundOptions = {}): OpenAiBackgroundHelper => {
  const { fetch: base = fetchUtils.global, ...overrides } = options
  const timings: BackgroundTimings = { ...BACKGROUND_TIMINGS }
  for (const [key, value] of Object.entries(overrides) as [keyof BackgroundTimings, number | undefined][]) {
    if (value != null) timings[key] = value
  }
  const splicer = createBackgroundSplice(base, timings)

  /** The URL and body of a POST `/responses` asking for `background: true` — `undefined` for every other request. */
  const backgroundOf = (
    input: string | URL | Request, init: RequestInit | undefined,
  ): { url: string, body: Record<string, unknown> } | undefined => {
    if (typeof input !== 'string' && !(input instanceof URL)) return undefined
    if ((init?.method ?? 'GET').toUpperCase() !== 'POST' || typeof init?.body !== 'string') return undefined
    if (!init.body.includes('"background"')) return undefined
    try {
      const url = new URL(String(input))
      if (!url.pathname.replace(/\/+$/, '').endsWith(RESPONSES_PATH)) return undefined
      const body = JSON.parse(init.body) as Record<string, unknown> | null

      return body?.background === true ? { url: `${url.origin}${url.pathname.replace(/\/+$/, '')}`, body } : undefined
    } catch {
      return undefined
    }
  }

  const fetchWith = (onResume?: (event: LlmStreamResume) => void): LlmFetch => async (input, init) => {
    const request = backgroundOf(input, init)
    if (request == null) return await base(input, init)
    if (request.body.stream !== true) {
      // Only a streamed call is spliced: a plain one would come back queued, with no output at all.
      const { background: _background, ...body } = request.body
      return await base(input, { ...init, body: JSON.stringify(body) })
    }
    const response = await base(input, init)
    if (!response.ok || response.body == null) return response

    return splicer.splice({ url: request.url, headers: new Headers(init?.headers), signal: init?.signal ?? undefined, onResume }, response)
  }

  const markOf = (fetch: unknown): BackgroundMark | undefined => typeof fetch === 'function'
    ? (fetch as unknown as Record<symbol, BackgroundMark | undefined>)[BACKGROUND_FETCH]
    : undefined

  const fetchFor: OpenAiBackgroundHelper['fetchFor'] = config => {
    if (config.background === false) return undefined
    const fetch = fetchWith()
    const mark: BackgroundMark = {
      mode: config.background === true ? BackgroundMode.Always : BackgroundMode.Auto,
      observed: onResume => fetchWith(onResume),
    }
    Object.defineProperty(fetch, BACKGROUND_FETCH, { value: mark })

    return fetch
  }

  return {
    fetchFor,
    modeOf: fetch => markOf(fetch)?.mode,
    wants: (mode, effort) => mode === BackgroundMode.Always || effortUtils.effortAtLeast(effort, ModelEffort.High),
    observed: (fetch, onResume) => markOf(fetch)?.observed(onResume) ?? fetch,
  }
}

export const openAiBackgroundHelper = createOpenAiBackgroundHelper()
