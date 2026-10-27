import { afterEach, describe, expect, test } from 'bun:test'
import { BotConnectionStatus, BotPlatform, BotReceiveMode } from '@owlmeans/bot'
import type { BotFetch } from '../src/platforms/types.js'
import type { BotRuntime } from '../src/types.js'
import { makeTestBot, scopeOf, sleep, until, type TestBot } from './context.js'

const runtimes: BotRuntime[] = []
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map(async runtime => { await runtime.stop() }))
})

type Polling = 'ok' | 'revoked' | 'down'

interface BotApi {
  fetch: BotFetch
  /** How `getUpdates` answers from now on. */
  polling: Polling
  /** Calls per Bot API method. */
  count: (method: string) => number
}

/**
 * The Bot API a LIVE Telegram connection reaches, in Telegram's own envelopes: `getMe` knows the bot,
 * `getUpdates` long-polls with nothing new (`ok`), refuses a revoked token (`revoked`: 401
 * Unauthorized) or is not reachable at all (`down`) — whatever `polling` says at the call.
 */
const makeBotApi = (): BotApi => {
  const counts = new Map<string, number>()
  const api: BotApi = {
    polling: 'ok',
    count: method => counts.get(method) ?? 0,
    fetch: async (url, init) => {
      const method = url.split('/').pop() ?? ''
      counts.set(method, api.count(method) + 1)
      if (method === 'getMe') {
        return Response.json({ ok: true, result: { id: 42, is_bot: true, first_name: 'Guard', username: 'guard_bot' } })
      }
      if (method !== 'getUpdates') {
        return Response.json({ ok: true, result: true })
      }
      if (api.polling === 'revoked') {
        return Response.json({ ok: false, error_code: 401, description: 'Unauthorized' }, { status: 401 })
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

/** A live Telegram connection, verified without a public origin — so it polls. */
const polling = async (bot: TestBot, scope: string): Promise<string> => {
  const saved = await bot.service.connections.save(scope, { platform: BotPlatform.Telegram, label: 'Guard', credentials: { token: '42:AA' } })
  const verified = await bot.service.connections.verify(scope, saved.id)
  expect([verified.status, verified.receive]).toEqual([BotConnectionStatus.Connected, BotReceiveMode.Poll])

  return saved.id
}

describe('@owlmeans/server-bot — receivers', () => {
  test('a revoked token fails the connection; no reconciliation restarts it until it is verified again', async () => {
    const api = makeBotApi()
    api.polling = 'revoked'
    const bot = makeTestBot({ fetch: api.fetch })
    const scope = scopeOf()
    const id = await polling(bot, scope)
    const runtime = bot.service.runtime([])
    runtimes.push(runtime)

    await runtime.reconcile()
    await until(async () => (await bot.connections.get(id)).status === BotConnectionStatus.Failed)
    const failed = await bot.service.connections.get(scope, id)
    expect([failed.status, failed.lastError]).toEqual([BotConnectionStatus.Failed, 'receiver:bot:telegram:401:Unauthorized'])

    const polls = api.count('getUpdates')
    await runtime.reconcile()
    await runtime.reconcile()
    await sleep(30)
    expect(api.count('getUpdates')).toBe(polls)

    // A new token is saved: pending, still not received from — verification decides.
    api.polling = 'ok'
    const saved = await bot.service.connections.save(scope, { id, platform: BotPlatform.Telegram, label: 'Guard', credentials: { token: '42:BB' } })
    expect(saved.status).toBe(BotConnectionStatus.Pending)
    await runtime.reconcile()
    expect(api.count('getUpdates')).toBe(polls)

    const verified = await bot.service.connections.verify(scope, id)
    expect([verified.status, verified.lastError]).toEqual([BotConnectionStatus.Connected, undefined])
    await runtime.reconcile()
    await until(async () => api.count('getUpdates') > polls)
    expect((await bot.connections.get(id)).status).toBe(BotConnectionStatus.Connected)
  })

  test('an unreachable platform is recoverable: the error is recorded and the receiver restarts', async () => {
    const api = makeBotApi()
    api.polling = 'down'
    const bot = makeTestBot({ fetch: api.fetch })
    const scope = scopeOf()
    const id = await polling(bot, scope)
    const runtime = bot.service.runtime([])
    runtimes.push(runtime)

    await runtime.reconcile()
    await until(async () => (await bot.connections.get(id)).lastError != null)
    const record = await bot.connections.get(id)
    expect([record.status, record.lastError]).toEqual([BotConnectionStatus.Connected, 'receiver:bot:telegram:503:getUpdates: unreachable'])

    // Each reconciliation starts it again (`deleteWebhook` opens every run) — and once the platform answers, it polls.
    const runs = api.count('deleteWebhook')
    await until(async () => {
      await runtime.reconcile()
      return api.count('deleteWebhook') > runs
    })
    api.polling = 'ok'
    const polls = api.count('getUpdates')
    await until(async () => {
      await runtime.reconcile()
      return api.count('getUpdates') > polls + 1
    })
    expect((await bot.connections.get(id)).status).toBe(BotConnectionStatus.Connected)
  })
})
