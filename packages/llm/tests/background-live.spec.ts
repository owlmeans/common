import { afterEach, describe, expect, test } from 'bun:test'
import type { JSONSchemaType } from 'ajv'
import { logger } from '@owlmeans/log'
import { ModelEffort, ModelProvider } from '@owlmeans/llm-common'
import { LlmNoticeKind, makeLlmModel, makeLlmService, openAiPlugin } from '../src/index.js'
import type { LlmSpectator, LlmSpectatorNotice, ModelConfig } from '../src/index.js'
import { gates, recordingSpectator } from './context.js'

/**
 * LIVE — OpenAI background mode on the official API (gate `OPENAI_SECRET`; self-skips without it).
 * One structured call at high effort, one whose stream is cut mid-way and must be recovered without asking again, one aborted
 * that must be cancelled, and a probe of `store: false`. A tap under the background-aware fetch
 * records every request and every SSE record KIND — never the content — and logs what OpenAI's
 * keepalive looks like on the wire.
 *
 *   bun test ./tests/background-live.spec.ts --timeout 900000
 */

const log = logger('llm:background-live')

const skip = 'skip' in gates.openai ? gates.openai.reason : null
const titled = (name: string): string => skip != null ? `${name} — SKIPPED: ${skip}` : name

const API = 'https://api.openai.com/v1'
const MODEL = 'gpt-6-luna'
const TIMEOUT = 600_000
/** Record kinds whose raw text is worth a sample in the log: anything that is not a known event. */
const KNOWN = /^(response\.|error$)/

interface TapRequest {
  method: string
  path: string
  status: number
  background?: unknown
  stream?: unknown
  /** The `status` a JSON answer names (a poll, a cancellation). */
  answered?: unknown
}

interface Tap {
  requests: TapRequest[]
  /** How often each record kind came: an event type, `comment:<text>`, or `data-only`. */
  kinds: Map<string, number>
  /** Raw text of the records that are not known events (comments, keepalives) — first few only. */
  samples: string[]
  /** The longest silence between two body reads, ms. */
  maxGapMs: number
  responseIds: string[]
  restore: () => void
}

/**
 * Tap the global fetch — what the background-aware fetch sends through. `cutAfter`: the first
 * streamed POST is cut after that many complete records, as a network drop would.
 */
const tapGlobal = (cutAfter?: number): Tap => {
  const original = globalThis.fetch
  let cut = cutAfter != null
  const tap: Tap = { requests: [], kinds: new Map(), samples: [], maxGapMs: 0, responseIds: [], restore: () => { globalThis.fetch = original } }

  const note = (record: string): void => {
    const lines = record.split(/\r?\n/)
    const comment = lines.find(line => line.startsWith(':'))
    const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim()
    const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n')
    let type = event
    try {
      const parsed = JSON.parse(data) as { type?: string, response?: { id?: string } }
      type = parsed.type ?? event
      if (parsed.type === 'response.created' && parsed.response?.id != null) tap.responseIds.push(parsed.response.id)
    } catch {}
    const kind = comment != null ? `comment:${comment.slice(1).trim().slice(0, 40)}` : type ?? 'data-only'
    tap.kinds.set(kind, (tap.kinds.get(kind) ?? 0) + 1)
    if (!KNOWN.test(kind) && tap.samples.length < 10) tap.samples.push(record.slice(0, 200))
  }

  const watched = (body: ReadableStream<Uint8Array>, limit: number | undefined): ReadableStream<Uint8Array> => {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    const encoder = new TextEncoder()
    let buffer = ''
    let records = 0
    let lastAt = performance.now()
    return new ReadableStream<Uint8Array>({
      pull: async controller => {
        for (;;) {
          if (limit != null && records >= limit) {
            void reader.cancel().catch(() => {})
            controller.error(new Error('forced drop'))
            return
          }
          const { done, value } = await reader.read()
          const now = performance.now()
          tap.maxGapMs = Math.max(tap.maxGapMs, now - lastAt)
          lastAt = now
          if (done) {
            controller.close()
            return
          }
          buffer += decoder.decode(value, { stream: true })
          let out = ''
          for (let match = /\r?\n\r?\n/.exec(buffer); match != null; match = /\r?\n\r?\n/.exec(buffer)) {
            const record = buffer.slice(0, match.index)
            buffer = buffer.slice(match.index + match[0].length)
            note(record)
            out += `${record}\n\n`
            records += 1
            if (limit != null && records >= limit) break
          }
          if (out !== '') {
            controller.enqueue(encoder.encode(out))
            return
          }
        }
      },
      cancel: reason => reader.cancel(reason),
    })
  }

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const method = (init?.method ?? 'GET').toUpperCase()
    let flags: Pick<TapRequest, 'background' | 'stream'> = {}
    if (typeof init?.body === 'string') {
      try {
        const body = JSON.parse(init.body) as Record<string, unknown>
        flags = { background: body.background, stream: body.stream }
      } catch {}
    }
    const response = await original(input, init)
    const json = (response.headers.get('content-type') ?? '').includes('application/json')
    const answered = json ? await response.clone().json().then(body => (body as { status?: unknown }).status, () => undefined) : undefined
    tap.requests.push({ method, path: `${url.pathname}${url.search}`, status: response.status, ...flags, ...(answered != null ? { answered } : {}) })
    if (response.body == null || !(response.headers.get('content-type') ?? '').includes('text/event-stream')) return response
    const limit = cut && method === 'POST' ? cutAfter : undefined
    if (limit != null) cut = false
    const headers = new Headers(response.headers)
    headers.delete('content-length')
    headers.delete('content-encoding')

    return new Response(watched(response.body, limit), { status: response.status, statusText: response.statusText, headers })
  }) as typeof fetch

  return tap
}

const report = (name: string, tap: Tap): void => {
  log.info('Background wire', {
    test: name,
    requests: tap.requests.map(({ method, path, status, background, answered }) =>
      `${method} ${path.replace(/resp_[A-Za-z0-9]+/, 'resp_…')} ${status}${background === true ? ' background' : ''}${answered != null ? ` ${String(answered)}` : ''}`),
    kinds: Object.fromEntries(tap.kinds),
    samples: tap.samples,
    maxGapMs: Math.round(tap.maxGapMs),
  })
}

const configs = (extra: Partial<ModelConfig> = {}): (() => ModelConfig[]) => () => [{
  alias: 'luna', provider: ModelProvider.OpenAI, model: MODEL, secret: process.env.OPENAI_SECRET!,
  effort: ModelEffort.High, maxTokens: 8_000, maxTokensCap: 16_000, ...extra,
}]

interface Counted { answer: number, reasoning: string }

const CountedSchema: JSONSchemaType<Counted> = {
  type: 'object', title: 'Counted',
  properties: { answer: { type: 'integer' }, reasoning: { type: 'string' } },
  required: ['answer', 'reasoning'], additionalProperties: false,
}

const QUESTION = 'How many positive integers below 1000 are divisible by 3 or by 5, but not by 15? '
  + 'Give the count and one sentence of reasoning.'

const spectatorWithNotices = (): LlmSpectator & { notices: LlmSpectatorNotice[] } => {
  const notices: LlmSpectatorNotice[] = []
  return { ...recordingSpectator(), notices, notice: event => { notices.push(event) } }
}

const statusOf = async (id: string): Promise<string | undefined> => {
  const response = await fetch(`${API}/responses/${id}`, { headers: { authorization: `Bearer ${process.env.OPENAI_SECRET}` } })
  return response.ok ? (await response.json() as { status?: string }).status : undefined
}

let active: Tap | undefined
afterEach(() => {
  active?.restore()
  active = undefined
})

describe('@owlmeans/llm — LIVE OpenAI background mode', () => {
  test.skipIf(skip != null)(titled('a structured call at high effort runs in background'), async () => {
    const tap = active = tapGlobal()
    const llm = makeLlmService({ models: configs() }, 'llm-background-live-call')
    const model = makeLlmModel({ model: llm.getModel('luna'), purpose: { type: 'background-live' }, retries: 2 }, spectatorWithNotices())
    const counted = await model.invoke(QUESTION, CountedSchema, { action: 'background-live' })
    report('call', tap)

    expect(counted.answer).toBe(400)
    expect(tap.requests[0]).toMatchObject({ method: 'POST', path: '/v1/responses', background: true, stream: true, status: 200 })
  }, TIMEOUT)

  // Cut once the response is in progress: a probe that dropped the stream while the response was still
  // `queued` saw it stay `in_progress` for over five minutes (bounded by the progress deadline, then
  // asked again). OpenAI's resumed stream has also been seen to bring keepalives only — the polls
  // then see the response finish and its stored copy completes the stream.
  test.skipIf(skip != null)(titled('a stream cut mid-way is recovered without asking again'), async () => {
    const tap = active = tapGlobal(3)
    const spectator = spectatorWithNotices()
    const llm = makeLlmService({ models: configs() }, 'llm-background-live-cut')
    const model = makeLlmModel({ model: llm.getModel('luna'), purpose: { type: 'background-live' }, retries: 2 }, spectator)
    const counted = await model.invoke(QUESTION, CountedSchema, { action: 'background-live-cut' })
    report('cut', tap)

    expect(counted.answer).toBe(400)
    expect(spectator.notices.some(notice => notice.kind === LlmNoticeKind.Resumed)).toBe(true)
    expect(tap.requests.some(({ method, path }) => method === 'GET' && /^\/v1\/responses\/resp_[^?]+$/.test(path))).toBe(true)
    // One response, recovered — never a second POST.
    expect(tap.requests.filter(({ method, path }) => method === 'POST' && path === '/v1/responses')).toHaveLength(1)
  }, TIMEOUT)

  // A stop aborts the call's signal, which reaches the SDK at once. (A bare `break` out of a
  // langchain stream does not: the generator's return waits for its next chunk.) OpenAI answers the
  // cancellation `cancelled` at once but reports a RUNNING response `in_progress` for a while before
  // its own status follows (13 s measured mid-reasoning) — so the poll waits up to two minutes.
  test.skipIf(skip != null)(titled('an aborted call cancels its response'), async () => {
    const tap = active = tapGlobal()
    const llm = makeLlmService({ models: configs({ background: true, maxTokens: 2_000, maxTokensCap: 2_000 }) }, 'llm-background-live-abort')
    const refined = openAiPlugin.refine({ base: llm.getModel('luna'), attempt: 0, maxOutputCap: 2_000 })
    const controller = new AbortController()
    const stream = await refined.stream('Write a detailed 3000-word essay on the history of the printing press.', { signal: controller.signal })
    for await (const _chunk of stream) {
      if (tap.responseIds.length > 0) {
        controller.abort()
        break
      }
    }
    const id = tap.responseIds[0]!
    const startedAt = Date.now()
    const timeline: string[] = []
    let status: string | undefined
    while (status !== 'cancelled' && Date.now() - startedAt < 120_000) {
      await new Promise(resolve => setTimeout(resolve, 2_000))
      const next = await statusOf(id)
      if (next !== status) timeline.push(`${Math.round((Date.now() - startedAt) / 1000)}s ${String(next)}`)
      status = next
    }
    report('abort', tap)
    log.info('Background cancellation', { timeline })

    const cancel = tap.requests.find(({ method, path }) => method === 'POST' && path === `/v1/responses/${id}/cancel`)
    expect(cancel).toMatchObject({ status: 200, answered: 'cancelled' })
    expect(tap.requests.filter(({ path }) => path.endsWith('/cancel'))).toHaveLength(1)
    expect(status).toBe('cancelled')
  }, TIMEOUT)

  test.skipIf(skip != null)(titled('records whether background mode needs store'), async () => {
    const response = await fetch(`${API}/responses`, {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.OPENAI_SECRET}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, input: 'Say OK.', background: true, store: false, max_output_tokens: 16 }),
    })
    const body = await response.json() as { id?: string, status?: string, error?: { message?: string, code?: string } }
    log.info('Background with store: false', { status: response.status, responseStatus: body.status, error: body.error?.message, code: body.error?.code })
    if (body.id != null && (body.status === 'queued' || body.status === 'in_progress')) {
      await fetch(`${API}/responses/${body.id}/cancel`, { method: 'POST', headers: { authorization: `Bearer ${process.env.OPENAI_SECRET}` } })
    }

    expect(typeof response.status).toBe('number')
  }, TIMEOUT)
})
