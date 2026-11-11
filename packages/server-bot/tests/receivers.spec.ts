import { afterEach, describe, expect, test } from 'bun:test'
import { BotConnectionStatus, BotReceiveMode } from '@owlmeans/bot'
import type { BotFetch } from '../src/platforms/types.js'
import type { BotRuntime } from '../src/types.js'
import { makeTestBot, scopeOf, sleep, until, type TestBot } from './context.js'

const runtimes: BotRuntime[] = []
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map(async runtime => { await runtime.stop() }))
})

type Polling = 'ok' | 'revoked' | 'down'

interface PlatformApi {
  fetch: BotFetch
  /** How `updates` answers from now on. */
  polling: Polling
  /** Calls per API method. */
  count: (method: string) => number
}

/**
 * The test platform's API as a LIVE connection reaches it, in its own envelopes: `me` knows the bot,
 * `updates` long-polls with nothing new (`ok`), refuses a revoked token (`revoked`: 401) or is not
 * reachable at all (`down`) — whatever `polling` says at the call.
 */
const makePlatformApi = (): PlatformApi => {
  const counts = new Map<string, number>()
  const api: PlatformApi = {
    polling: 'ok',
    count: method => counts.get(method) ?? 0,
    fetch: async (url, init) => {
      const method = url.split('/').pop() ?? ''
      counts.set(method, api.count(method) + 1)
      if (method === 'me') {
        return Response.json({ ok: true, result: { id: '42', username: 'guard_bot', name: 'Guard' } })
      }
      if (method !== 'updates') {
        return Response.json({ ok: true, result: true })
      }
      if (api.polling === 'revoked') {
        return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
      }
      if (api.polling === 'down') {
        throw new TypeError('fetch failed')
      }
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 20)
        init?.signal?.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }))
        }, { once: true })
      })

      return Response.json({ ok: true, result: [] })
    },
  }

  return api
}

/** A live connection, verified without a public origin — so it polls. */
const polling = async (bot: TestBot, scope: string): Promise<string> => {
  const saved = await bot.service.connections.save(scope, { platform: 'test', label: 'Guard', credentials: { token: '42:AA' } })
  const verified = await bot.service.connections.verify(scope, saved.id)
  expect([verified.status, verified.receive]).toEqual([BotConnectionStatus.Connected, BotReceiveMode.Poll])

  return saved.id
}

describe('@owlmeans/server-bot — receivers', () => {
  test('a revoked token fails the connection; no reconciliation restarts it until it is verified again', async () => {
    const api = makePlatformApi()
    api.polling = 'revoked'
    const bot = makeTestBot({ fetch: api.fetch })
    const scope = scopeOf()
    const id = await polling(bot, scope)
    const runtime = bot.service.runtime([])
    runtimes.push(runtime)

    await runtime.reconcile()
    await until(async () => (await bot.connections.get(id)).status === BotConnectionStatus.Failed)
    const failed = await bot.service.connections.get(scope, id)
    expect([failed.status, failed.lastError]).toEqual([BotConnectionStatus.Failed, 'receiver:bot:platform:test:401:Unauthorized'])

    const polls = api.count('updates')
    await runtime.reconcile()
    await runtime.reconcile()
    await sleep(30)
    expect(api.count('updates')).toBe(polls)

    // A new token is saved: pending, still not received from — verification decides.
    api.polling = 'ok'
    const saved = await bot.service.connections.save(scope, { id, platform: 'test', label: 'Guard', credentials: { token: '42:BB' } })
    expect(saved.status).toBe(BotConnectionStatus.Pending)
    await runtime.reconcile()
    expect(api.count('updates')).toBe(polls)

    const verified = await bot.service.connections.verify(scope, id)
    expect([verified.status, verified.lastError]).toEqual([BotConnectionStatus.Connected, undefined])
    await runtime.reconcile()
    await until(async () => api.count('updates') > polls)
    expect((await bot.connections.get(id)).status).toBe(BotConnectionStatus.Connected)
  })

  test('an unreachable platform is recoverable: the error is recorded and the receiver restarts', async () => {
    const api = makePlatformApi()
    api.polling = 'down'
    const bot = makeTestBot({ fetch: api.fetch })
    const scope = scopeOf()
    const id = await polling(bot, scope)
    const runtime = bot.service.runtime([])
    runtimes.push(runtime)

    await runtime.reconcile()
    await until(async () => (await bot.connections.get(id)).lastError != null)
    const record = await bot.connections.get(id)
    expect([record.status, record.lastError]).toEqual([BotConnectionStatus.Connected, 'receiver:bot:platform:test:503:updates: unreachable'])

    // Each reconciliation starts it again (`deleteHook` opens every run) — and once the platform answers, it polls.
    const runs = api.count('deleteHook')
    await until(async () => {
      await runtime.reconcile()
      return api.count('deleteHook') > runs
    })
    api.polling = 'ok'
    const polls = api.count('updates')
    await until(async () => {
      await runtime.reconcile()
      return api.count('updates') > polls + 1
    })
    expect((await bot.connections.get(id)).status).toBe(BotConnectionStatus.Connected)
  })
})
