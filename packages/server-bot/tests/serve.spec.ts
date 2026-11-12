import { describe, expect, test } from 'bun:test'
import { BotSignatureRejected, BotTransport, makeBotHookProtocols, makeBotProtocols } from '@owlmeans/bot'
import { protocols } from '@owlmeans/entrypoint'
import { makeBotMockHelper } from '../src/mock/mock.js'
import { makeTestBotPlatform } from '../src/mock/platform.js'
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
    expect(managing.map(binding => binding.alias)).toContain('api:bot:operator:platform:list')
    expect(inbound.map(binding => binding.alias).sort()).toEqual(protocols(hook as never).map(protocol => protocol.alias).sort())
  })

  test('a tree restated without `platform` (before the leaf existed) still binds every leaf it has', () => {
    const { platform: _platform, ...restated } = operator
    const managing = serveBotEntrypoints(restated, { scope: async () => 'org' })

    expect(managing.map(binding => binding.alias)).not.toContain('api:bot:operator:platform:list')
    expect(managing.length).toBe(protocols(operator as never).length - 1)
  })

  test('platform.list answers the registered descriptors in registration order, asking no scope', async () => {
    const bot = makeTestBot({ platforms: [makeTestBotPlatform({ title: 'First' }), makeTestBotPlatform({ platform: 'second', title: 'Second' })] })
    const seen: string[] = []
    const bindings = serveBotEntrypoints(operator, { scope: async request => { seen.push(request.alias); return 'org' } })
    bot.context.registerEntrypoints(bindings)
    const list = bindings.find(binding => binding.alias === operator.platform.list.alias)!

    const descriptors = await invoke(list, { alias: operator.platform.list.alias })
    expect(descriptors.map((descriptor: { platform: string, title: string }) => [descriptor.platform, descriptor.title]))
      .toEqual([['test', 'First'], ['second', 'Second']])
    expect(descriptors[0]).toMatchObject({ glyph: 'chat', credentials: [{ key: 'token', label: { en: 'Token' } }] })
    expect(seen).toEqual([])
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
      body: { platform: 'test', label: 'Wired', transport: BotTransport.Mock },
    })
    expect(saved.scope).toBe(scope)
    expect(saved.hookUrl).toBe(`https://shop.example.com/api/bot/hook/test/${saved.id}`)

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
    const saved = await bot.service.connections.save(scope, { platform: 'test', label: 'Hooked', transport: BotTransport.Mock })
    const record = await bot.connections.get(saved.id)
    const bindings = serveBotHookEntrypoints(hook)
    bot.context.registerEntrypoints(bindings)
    const receive = bindings.find(binding => binding.alias === hook.receive.alias)!
    const signed = makeBotMockHelper([bot.platform]).inbound('test', { text: 'hello' }, record)

    const reply = await invoke(receive, {
      params: { platform: 'test', connection: saved.id }, headers: signed.headers, body: signed.body,
      original: { rawBody: signed.rawBody },
    })
    expect(reply).toEqual({ ok: true })
    expect(await bot.updates.count({ connection: saved.id })).toBe(1)

    await expect(invoke(receive, {
      params: { platform: 'test', connection: saved.id }, headers: { 'content-type': 'application/json' }, body: signed.body,
    })).rejects.toBeInstanceOf(BotSignatureRejected)
  })
})
