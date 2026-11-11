import { afterEach, describe, expect, test } from 'bun:test'
import { BotTransport, BotUnsupportedAction } from '@owlmeans/bot'
import { addLogPlugin, configureLog, memoryPlugin, type MemoryPlugin } from '@owlmeans/log'
import { makeBotMockHelper } from '../src/mock/mock.js'
import { makeTestBotPlatform } from '../src/mock/platform.js'
import { makeBotPlatformRegistry } from '../src/platforms/registry.js'
import { makeTestBot, scopeOf } from './context.js'

describe('@owlmeans/server-bot — the platform registry', () => {
  test('holds exactly the registered plugins, in registration order; a later one replaces an earlier in place', () => {
    const first = makeTestBotPlatform({ title: 'First' })
    const other = makeTestBotPlatform({ platform: 'other' })
    const registry = makeBotPlatformRegistry([first, other])
    const replacement = makeTestBotPlatform({ title: 'Replacement' })
    registry.register(replacement)

    expect(registry.platforms().map(descriptor => [descriptor.platform, descriptor.title]))
      .toEqual([['test', 'Replacement'], ['other', 'Test']])
    expect(registry.get('test')).toBe(replacement)
    expect(registry.descriptor('absent')).toBeNull()
    expect(() => registry.require('absent')).toThrow(BotUnsupportedAction)
    expect(makeBotPlatformRegistry().platforms()).toEqual([])
  })

  test('the service lists its plugins\' descriptors and registers one more later', async () => {
    const { service } = makeTestBot()
    const scope = scopeOf()
    await expect(service.connections.save(scope, { platform: 'late', label: 'x' })).rejects.toBeInstanceOf(BotUnsupportedAction)

    service.register(makeTestBotPlatform({ platform: 'late', title: 'Late' }))
    expect(service.platforms().map(descriptor => descriptor.platform)).toEqual(['test', 'late'])
    const saved = await service.connections.save(scope, { platform: 'late', label: 'Late', transport: BotTransport.Mock })
    expect((await service.connections.verify(scope, saved.id)).identity?.username).toMatch(/^mock_/)
  })

  test('the mock helper reaches only the plugins it is given', () => {
    const plugin = makeTestBotPlatform()
    const mocks = makeBotMockHelper([plugin])

    expect(mocks.plugin('test')).toBe(plugin)
    expect(mocks.inbound('test', { text: 'hi' }, { id: 'c-1', hookSecret: 's' }).headers).toMatchObject({ 'x-bot-test-secret': 's' })
    expect(() => mocks.plugin('other')).toThrow(BotUnsupportedAction)
  })
})

describe('@owlmeans/server-bot — a service without platforms', () => {
  let memory: MemoryPlugin
  let remove: (() => void) | undefined
  afterEach(() => {
    remove?.()
    configureLog({ level: process.env.LOG_LEVEL ?? 'error' })
  })

  const warnings = (): string[] => memory.records
    .filter(record => record.level === 'warn' && record.event === 'bot.platforms.missing').map(record => record.message)

  test('warns once where it boots — the worker\'s runtime or the panels\' platform list — and refuses every save', async () => {
    configureLog({ level: 'warn' })
    memory = memoryPlugin('server-bot-platforms')
    remove = addLogPlugin(memory)
    const { service } = makeTestBot({ platforms: [] })

    service.runtime([])
    expect(service.platforms()).toEqual([])
    expect(warnings().length).toBe(1)
    await expect(service.connections.save(scopeOf(), { platform: 'test', label: 'x' })).rejects.toBeInstanceOf(BotUnsupportedAction)
  })

  test('says nothing when a platform is registered', () => {
    configureLog({ level: 'warn' })
    memory = memoryPlugin('server-bot-platforms-ok')
    remove = addLogPlugin(memory)
    const { service } = makeTestBot()

    service.runtime([])
    service.platforms()
    expect(warnings()).toEqual([])
  })
})
