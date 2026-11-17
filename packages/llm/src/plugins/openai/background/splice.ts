import { logger } from '@owlmeans/log'
import { LlmModelError } from '../../../errors.js'
import { fetchUtils } from '../../../utils/fetch.js'
import type { LlmFetch } from '../../transport/types.js'
import {
  BACKGROUND_KEEPALIVE_EVENT, BACKGROUND_LIVE_STATUSES, BACKGROUND_POLL_COMMENT, BACKGROUND_STORED_ENDINGS,
  BACKGROUND_TERMINAL_EVENTS, SSE_RECORD_BOUNDARY,
} from './consts.js'
import { sseRecordHelper } from './records.js'
import type {
  BackgroundRequest, BackgroundSplice, BackgroundTimings, SpliceDelivered, SpliceRead, StoredResponse,
} from './types.js'

const log = logger('llm:openai:background')

/** A pause that an abort cuts short. */
const pause = (ms: number, signal: AbortSignal | undefined): Promise<void> => new Promise(resolve => {
  const done = (): void => {
    clearTimeout(timer)
    signal?.removeEventListener('abort', done)
    resolve()
  }
  const timer = setTimeout(done, ms)
  signal?.addEventListener('abort', done, { once: true })
})

/** Settle a stream the consumer may already have cancelled. */
const settle = (act: () => void): void => {
  try { act() } catch {}
}

export const createBackgroundSplice = (fetch: LlmFetch, timings: BackgroundTimings): BackgroundSplice => {
  const splice = (request: BackgroundRequest, first: Response): Response => {
    const { signal } = request
    const encoder = new TextEncoder()
    let decoder = new TextDecoder()
    // The upstream being read: the POST's own stream, then a resumed one — none between the two.
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined = first.body!.getReader()
    // A read of `reader` that lost a race: the next race waits on the same read, never a second one.
    let reading: Promise<SpliceRead> | undefined
    // A resumed stream being opened, and its connection (the POST's belongs to the SDK's signal).
    let resuming: Promise<ReadableStreamDefaultReader<Uint8Array> | undefined> | undefined
    let connection: AbortController | undefined
    let buffer = ''
    let id: string | undefined
    let last = -1
    let terminal = false
    // Whether the current upstream delivered a new event since it was opened: the first one did.
    let delivered = true
    const sent: SpliceDelivered = { added: new Set(), done: new Set(), sent: new Map() }
    // The last new event, or the last poll: the quiet clock a poll is due on.
    let quietSince = Date.now()
    let failures = 0
    let resumes = 0
    let ended = false
    let cancelled = false

    const resource = (): string => `${request.url}/${id}`

    const headersFor = (accept: string): Headers => {
      const headers = new Headers(request.headers)
      headers.delete('content-type')
      headers.delete('content-length')
      headers.set('accept', accept)

      return headers
    }

    const bounded = (ms: number): AbortSignal =>
      signal != null ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms)

    /**
     * Cancel the response on OpenAI — once, only when it is known and still running, and never
     * awaited. Its own timeout: the SDK's signal is the one that was just aborted. OpenAI answers
     * `cancelled` at once; a running response's own status follows within seconds.
     */
    const cancelResponse = (): void => {
      if (cancelled || id == null || terminal) return
      cancelled = true
      const responseId = id
      void fetch(`${resource()}/cancel`, {
        method: 'POST', headers: headersFor('application/json'), signal: AbortSignal.timeout(timings.cancelTimeoutMs),
      }).then(async response => {
        if (!response.ok) {
          void response.body?.cancel().catch(() => {})
          log.warn('Background response not cancelled', { responseId, status: response.status })
          return
        }
        const { status } = await response.json().catch(() => ({})) as { status?: unknown }
        log.info('Background response cancelled', { responseId, status })
      }).catch((error: unknown) => {
        log.warn('Background response not cancelled', { responseId, error })
      })
    }

    const dropReader = (): void => {
      void reader?.cancel().catch(() => {})
      reader = undefined
      reading = undefined
      connection?.abort()
      connection = undefined
    }

    const finish = (): void => {
      ended = true
      signal?.removeEventListener('abort', onAbort)
      dropReader()
      void resuming?.then(late => late?.cancel().catch(() => {}))
      resuming = undefined
    }

    const onAbort = (): void => {
      cancelResponse()
      finish()
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    /** The complete records in `text` (with what came before it) that are new; a torn tail waits in `buffer`. */
    const forward = (text: string): string => {
      buffer += text
      let out = ''
      for (let match = SSE_RECORD_BOUNDARY.exec(buffer); match != null; match = SSE_RECORD_BOUNDARY.exec(buffer)) {
        const record = buffer.slice(0, match.index)
        buffer = buffer.slice(match.index + match[0].length)
        if (record.trim() === '') continue
        const event = sseRecordHelper.eventOf(record)
        // A keepalive is liveness, not part of the response: its `sequence_number` counts the
        // connection's own keepalives (a resumed stream starts again at 0), so it never moves the
        // cursor, is never taken for a replay and always reaches the SDK — bytes the observer counts.
        if (event?.type === BACKGROUND_KEEPALIVE_EVENT) {
          out += `${record}\n\n`
          continue
        }
        if (event?.sequence != null) {
          // Replayed by a resume: the SDK has it already.
          if (event.sequence <= last) continue
          last = event.sequence
          delivered = true
          quietSince = Date.now()
        }
        if (event != null) sseRecordHelper.note(sent, event)
        if (id == null && event?.responseId != null) id = event.responseId
        if (event?.type != null && BACKGROUND_TERMINAL_EVENTS.includes(event.type)) terminal = true
        out += `${record}\n\n`
      }

      return out
    }

    /** The next thing to act on: upstream bytes, a resumed stream opening, or a poll falling due. */
    const read = async (): Promise<SpliceRead> => {
      const racers: Promise<SpliceRead>[] = []
      if (reader != null) {
        reading ??= reader.read().then(
          ({ done, value }): SpliceRead => done ? { kind: 'end' } : { kind: 'data', value },
          (error: unknown): SpliceRead => ({ kind: 'error', error }),
        )
        racers.push(reading)
      }
      if (resuming != null) racers.push(resuming.then((next): SpliceRead => ({ kind: 'resumed', reader: next })))
      let timer: ReturnType<typeof setTimeout> | undefined
      // Keepalives do not count: a stream that brings nothing new for `silenceMs` gets its response polled.
      if (id != null && !terminal) {
        racers.push(new Promise<SpliceRead>(resolve => {
          timer = setTimeout(() => resolve({ kind: 'silence' }), Math.max(0, timings.silenceMs - (Date.now() - quietSince)))
        }))
      }
      try {
        const next = await Promise.race(racers)
        if (next.kind === 'resumed') resuming = undefined
        else if (next.kind !== 'silence') reading = undefined

        return next
      } finally {
        clearTimeout(timer)
      }
    }

    /** The stored response, or `undefined` when it could not be read. */
    const poll = async (): Promise<StoredResponse | undefined> => {
      try {
        const response = await fetch(resource(), {
          method: 'GET', headers: headersFor('application/json'), signal: bounded(timings.pollTimeoutMs),
        })
        if (!response.ok) {
          void response.body?.cancel().catch(() => {})
          log.warn('Background response poll refused', { responseId: id, status: response.status })
          return undefined
        }
        const stored = await response.json() as StoredResponse | null

        return stored != null && typeof stored.status === 'string' ? stored : undefined
      } catch (error) {
        if (!ended) log.warn('Background response poll failed', { responseId: id, error })
        return undefined
      }
    }

    /**
     * A stream of the response after the last forwarded event, or `undefined` when it could not be
     * opened. Opportunistic: OpenAI answers it with its first record — a keepalive ~30 s in when
     * nothing new is ready — and has been seen to deliver keepalives only, so the polls stay the
     * authority and the resume never holds the stream up.
     */
    const resume = async (): Promise<ReadableStreamDefaultReader<Uint8Array> | undefined> => {
      const own = new AbortController()
      const follow = (): void => own.abort(signal?.reason)
      signal?.addEventListener('abort', follow, { once: true })
      const timer = setTimeout(() => own.abort(), timings.silenceMs)
      try {
        const after = last >= 0 ? `&starting_after=${last}` : ''
        const response = await fetch(`${resource()}?stream=true${after}`, {
          method: 'GET', headers: headersFor('text/event-stream'), signal: own.signal,
        })
        signal?.removeEventListener('abort', follow)
        if (!response.ok || response.body == null || ended) {
          void response.body?.cancel().catch(() => {})
          if (!ended) log.warn('Background stream not resumed', { responseId: id, status: response.status })
          return undefined
        }
        connection = own

        return response.body.getReader()
      } catch (error) {
        signal?.removeEventListener('abort', follow)
        if (!ended) log.warn('Background stream resume failed', { responseId: id, error })
        return undefined
      } finally {
        clearTimeout(timer)
      }
    }

    /** The response is out of reach: a retryable stall — never an abort-shaped error, which the SDK swallows. */
    const stall = (controller: ReadableStreamDefaultController<Uint8Array>, reason: string): void => {
      log.warn('Background stream lost', { responseId: id, reason, failures, resumes })
      // A response nobody reads any more would run on, billed, behind the retry.
      cancelResponse()
      finish()
      settle(() => controller.error(new LlmModelError(`stream-stalled:background stream ${reason}`)))
    }

    /**
     * Act on the stored response: while OpenAI works on it, add `: poll` and open a resumed stream if
     * none is being read; once it is finished, hand the SDK what it still owes from the stored copy
     * and end. Answers whether the stream goes on.
     */
    const act = (controller: ReadableStreamDefaultController<Uint8Array>, stored: StoredResponse): boolean => {
      const status = stored.status!
      if (BACKGROUND_LIVE_STATUSES.includes(status)) {
        controller.enqueue(encoder.encode(BACKGROUND_POLL_COMMENT))
        if (reader == null && resuming == null) resuming = resume()
        return true
      }
      if (BACKGROUND_STORED_ENDINGS[status] == null) {
        terminal = true
        stall(controller, `response ${status}`)
        return false
      }
      const rest = sseRecordHelper.remainderOf(stored, sent, last)
      resumes += 1
      log.info('Background stream completed from the stored response', { responseId: id, status, after: last, resumes })
      request.onResume?.({ after: last, resumes })
      terminal = true
      finish()
      controller.enqueue(encoder.encode(rest))
      settle(() => controller.close())

      return false
    }

    /** Poll — again after a pause when it fails, until `maxResumes` failures in a row — and act on the answer. */
    const check = async (controller: ReadableStreamDefaultController<Uint8Array>): Promise<boolean> => {
      for (;;) {
        const stored = await poll()
        if (ended) return false
        quietSince = Date.now()
        if (stored != null) {
          failures = 0
          return act(controller, stored)
        }
        failures += 1
        if (failures >= timings.maxResumes) {
          stall(controller, `lost after ${failures} failed polls`)
          return false
        }
        await pause(timings.retryDelayMs * failures, signal)
        if (ended) return false
      }
    }

    const pull = async (controller: ReadableStreamDefaultController<Uint8Array>): Promise<void> => {
      for (;;) {
        if (ended) {
          if (signal?.aborted === true) settle(() => controller.error(signal.reason))
          return
        }
        const next = await read()
        if (ended) continue
        if (next.kind === 'data') {
          const out = forward(decoder.decode(next.value, { stream: true }))
          if (out !== '') {
            controller.enqueue(encoder.encode(out))
            return
          }
          continue
        }
        if (next.kind === 'resumed') {
          if (next.reader == null) continue
          reader = next.reader
          // What was torn at the drop comes again, whole, after `last`.
          buffer = ''
          decoder = new TextDecoder()
          delivered = false
          resumes += 1
          log.info('Background stream resumed', { responseId: id, after: last, resumes })
          request.onResume?.({ after: last, resumes })
          continue
        }
        if (next.kind === 'silence') {
          if (!await check(controller)) return
          continue
        }
        if (terminal) {
          // The response is over: what follows its terminal event is never resumed.
          finish()
          settle(() => controller.close())
          return
        }
        if (id == null) {
          stall(controller, 'ended before response.created')
          return
        }
        // The upstream dropped. One that brought something new is polled at once; a resumed stream
        // that brought nothing waits for the quiet clock, so a stream that keeps dropping is not hammered.
        const fresh = delivered
        dropReader()
        if (fresh && !await check(controller)) return
      }
    }

    return fetchUtils.withBody(first, new ReadableStream<Uint8Array>({
      pull,
      cancel: () => {
        cancelResponse()
        finish()
      },
    }))
  }

  return { splice }
}
