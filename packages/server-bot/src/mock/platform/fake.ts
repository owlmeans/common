import { randomInt } from 'node:crypto'
import type { BotSimulateInput } from '@owlmeans/bot'
import type {
  BotFetch, BotFetchInit, BotMockCall, BotNativeInbound, BotPlatformConnection, BotPlatformMock,
} from '../../platforms/types.js'
import { BOT_TEST_CHAT, BOT_TEST_POLL_WAIT_MS, BOT_TEST_SECRET_HEADER, BOT_TEST_SENDER } from './consts.js'
import type { BotTestMessage, BotTestPayload } from './types.js'
import type { BotTestFakeState } from './types.local.js'

/**
 * The test platform's API faked in memory — the same envelopes the live client reads, every call
 * recorded per connection (`auth` names the credential the call authorized with). Ids are seeded
 * from the clock, so a fresh instance (a restart) never hands out an id an earlier one stored.
 */
export const makeBotTestFake = (): BotPlatformMock => {
  const states = new Map<string, BotTestFakeState>()
  let counter = Date.now() * 1000 + randomInt(1000)
  const next = (): number => ++counter

  const stateOf = (connection: string): BotTestFakeState => {
    let state = states.get(connection)
    if (state == null) {
      state = { calls: [], queue: [], waiters: new Set() }
      states.set(connection, state)
    }

    return state
  }

  const ok = (result: unknown): Response => Response.json({ ok: true, result })

  const authOf = (connection: BotPlatformConnection, init?: BotFetchInit): string => {
    const header = init?.headers?.authorization ?? ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : ''
    if (token === '') {
      return 'none'
    }

    return Object.entries(connection.credentials).find(([, value]) => value === token)?.[0] ?? 'unknown'
  }

  /** Wait for a fed payload (or the poll's end, or an abort). */
  const wait = async (state: BotTestFakeState, signal?: AbortSignal): Promise<void> => {
    if (state.queue.length > 0) {
      return
    }
    await new Promise<void>((resolve, reject) => {
      const done = (): void => {
        clearTimeout(timer)
        state.waiters.delete(done)
        signal?.removeEventListener('abort', abort)
        resolve()
      }
      const abort = (): void => {
        clearTimeout(timer)
        state.waiters.delete(done)
        reject(signal?.reason ?? Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }))
      }
      const timer = setTimeout(done, BOT_TEST_POLL_WAIT_MS)
      state.waiters.add(done)
      signal?.addEventListener('abort', abort, { once: true })
    })
  }

  const fetch = (connection: BotPlatformConnection): BotFetch => async (url, init) => {
    const method = url.split('/').pop() ?? ''
    const params = init?.body != null && init.body !== '' ? JSON.parse(init.body) as Record<string, unknown> : {}
    const state = stateOf(connection.id)
    state.calls.push({ method, params, at: new Date().toISOString(), auth: authOf(connection, init) })

    switch (method) {
      case 'me': {
        const slug = connection.id.replace(/[^A-Za-z0-9]/g, '').slice(0, 24) || 'bot'
        return ok({ id: `mock-${slug}`, username: `mock_${slug}_bot`, name: 'Mock bot' })
      }
      case 'updates': {
        const offset = Number(params.offset ?? 0)
        state.queue = state.queue.filter(update => update.id >= offset)
        await wait(state, init?.signal)
        return ok(state.queue.map(update => ({ ...update })))
      }
      case 'sendMessage': {
        const thread = typeof params.thread === 'string' ? { thread: params.thread } : {}
        return ok({ id: `${next()}`, chat: `${params.chat ?? ''}`, ...thread })
      }
      default:
        return ok(true)
    }
  }

  const inbound = (input: BotSimulateInput, connection: BotPlatformConnection): BotNativeInbound => {
    const id = next()
    const message: BotTestMessage = {
      id: `${id}`,
      chat: { ...BOT_TEST_CHAT, ...(input.chat ?? {}) } as BotTestMessage['chat'],
      from: { ...BOT_TEST_SENDER, ...(input.sender ?? {}) } as BotTestMessage['from'],
      text: input.text,
      date: new Date().toISOString(),
      ...(input.replyTo != null ? { replyTo: { id: input.replyTo.id, ...(input.replyTo.text != null ? { text: input.replyTo.text } : {}) } } : {}),
    }
    const body: BotTestPayload = { id, message }
    const rawBody = JSON.stringify(body)

    return {
      body,
      rawBody,
      headers: { 'content-type': 'application/json', [BOT_TEST_SECRET_HEADER]: connection.hookSecret },
    }
  }

  const feed = (connection: string, payload: unknown): void => {
    const state = stateOf(connection)
    state.queue.push(payload as BotTestPayload)
    for (const waiter of [...state.waiters]) {
      waiter()
    }
  }

  const calls = (connection: string): BotMockCall[] => [...(states.get(connection)?.calls ?? [])]

  const reset = (connection?: string): void => {
    if (connection == null) {
      states.clear()
    } else {
      states.delete(connection)
    }
  }

  return { fetch, inbound, feed, calls, reset }
}
