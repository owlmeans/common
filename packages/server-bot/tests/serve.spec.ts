import { describe, expect, test } from 'bun:test'
import {
  BotPlatform, BotSignatureRejected, BotTransport, makeBotHookProtocols, makeBotProtocols,
} from '@owlmeans/bot'
import { protocols } from '@owlmeans/entrypoint'
import { botMockHelper } from '../src/mock/index.js'
import { serveBotHookEntrypoints } from '../src/serve-hook.js'
import { serveBotEntrypoints } from '../src/serve.js'
import { invoke, makeTestBot, scopeOf } from './context.js'

const operator = makeBotProtocols({ base: { alias: 'api:bot:operator', path: '/bot/operator' }, guards: 'guard:test' })
const hook = makeBotHookProtocols({ base: { alias: 'api:bot:hook', path: '/bot/hook' } })

describe('@owlmeans/server-bot — serving the protocol trees', () => {
  test('one binding per protocol of each tree', () => {
    const managing = serveBotEntrypoints(operator, { scope: async () => 'org' })
    const inbound = serveBotHookEntrypoints(hook)

    expect(managing.map(binding => binding.alias).sort()).toEqual(protocols(operator as never).map(protocol => protocol.alias).sort())
    expect(inbound.map(binding => binding.alias).sort()).toEqual(protocols(hook as never).map(protocol => protocol.alias).sort())
  })

  test('the scope comes from the resolver, the hook URL from the request\'s forwarded origin', async () => {
    const bot = makeTestBot()
    const scope = scopeOf()
    const seen: string[] = []
    const bindings = serveBotEntrypoints(operator, { scope: async request => { seen.push(request.alias); return scope } })
    bot.context.registerEntrypoints(bindings)
    const at = (alias: string) => bindings.find(binding => binding.alias === alias)!
    const forwarded = { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'shop.example.com, internal:8080', host: 'api:3000' }

    const saved = await invoke(at(operator.connection.save.alias), {
      alias: operator.connection.save.alias, headers: forwarded,
      body: { platform: BotPlatform.Telegram, label: 'Wired', transport: BotTransport.Mock },
    })
    expect(saved.scope).toBe(scope)
    expect(saved.hookUrl).toBe(`https://shop.example.com/api/bot/hook/telegram/${saved.id}`)

    const verified = await invoke(at(operator.connection.verify.alias), { headers: forwarded, params: { id: saved.id } })
    expect(verified.receive).toBe('webhook')
    const simulated = await invoke(at(operator.connection.simulate.alias), { params: { id: saved.id }, body: { text: 'casino' } })
    expect(typeof simulated.update).toBe('string')
    expect(await invoke(at(operator.activity.list.alias), { query: { limit: '5' } })).toEqual([])
    expect((await invoke(at(operator.connection.list.alias), {})).map((connection: { id: string }) => connection.id)).toEqual([saved.id])
    expect(await invoke(at(operator.connection.remove.alias), { params: { id: saved.id } })).toEqual({ id: saved.id })
    expect(seen.length).toBe(6)
  })

  test('the hook reads the raw body Fastify keeps and answers 200 at once; a forged one is refused', async () => {
    const bot = makeTestBot()
    const scope = scopeOf()
    const saved = await bot.service.connections.save(scope, { platform: BotPlatform.Telegram, label: 'Hooked', transport: BotTransport.Mock })
    const record = await bot.connections.get(saved.id)
    const bindings = serveBotHookEntrypoints(hook)
    bot.context.registerEntrypoints(bindings)
    const receive = bindings.find(binding => binding.alias === hook.receive.alias)!
    const signed = botMockHelper.inbound(BotPlatform.Telegram, { text: 'hello' }, record)

    const reply = await invoke(receive, {
      params: { platform: BotPlatform.Telegram, connection: saved.id }, headers: signed.headers, body: signed.body,
      original: { rawBody: signed.rawBody },
    })
    expect(reply).toEqual({ ok: true })
    expect(await bot.updates.count({ connection: saved.id })).toBe(1)

    await expect(invoke(receive, {
      params: { platform: BotPlatform.Telegram, connection: saved.id }, headers: { 'content-type': 'application/json' }, body: signed.body,
    })).rejects.toBeInstanceOf(BotSignatureRejected)
  })
})
