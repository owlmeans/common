import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { AppType, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig } from '@owlmeans/context'
import type { NativeConsole } from '@owlmeans/log'
import {
  addLogPlugin, appendLog, configureLog, logConfig, logEnabled, logger, logThrottle, memoryPlugin, overrideConsole, resetLog, restoreConsole, logStateHelper, logLevelHelper, redactHelper
} from '@owlmeans/log'

type Written = { method: string, args: unknown[] }

const captured: Written[] = []
let saved: NativeConsole

const capture = () => {
  const native = logStateHelper.nativeConsole()
  saved = { ...native }
  for (const method of Object.keys(native) as (keyof typeof native)[]) {
    native[method] = (...args: unknown[]) => { captured.push({ method, args }) }
  }
}

beforeEach(() => {
  resetLog()
  captured.length = 0
  capture()
})

afterEach(() => {
  restoreConsole()
  Object.assign(logStateHelper.nativeConsole(), saved)
  resetLog()
})

describe('levels', () => {
  test('parseLogLevel trims, lowercases and rejects unknown values', () => {
    expect(logLevelHelper.parseLogLevel(' INFO\n')).toBe('info')
    expect(logLevelHelper.parseLogLevel('warning')).toBe('warn')
    expect(logLevelHelper.parseLogLevel('/etc/app-config/log-level', 'info')).toBe('info')
    expect(logLevelHelper.parseLogLevel(undefined)).toBeUndefined()
  })

  test('info level admits info and above, drops debug', () => {
    configureLog({ level: 'info' })
    const log = logger('t')
    log.debug('hidden')
    log.info('shown')
    log.warn('warned')
    expect(captured.map(w => w.method)).toEqual(['info', 'warn'])
  })

  test('silent admits nothing, even errors', () => {
    configureLog({ level: 'silent' })
    logger('t').error('boom')
    expect(captured).toHaveLength(0)
  })

  test('an unresolved or invalid value leaves the previous setting alone', () => {
    configureLog({ level: 'warn' })
    configureLog({ level: '/etc/app-config/log-level', format: 'xml' })
    expect(logConfig().level).toBe('warn')
    expect(logConfig().format).toBe('text')
  })

  test('debug scopes force debug for matching scopes and their children only', () => {
    configureLog({ level: 'info', debug: 'agent, jobs:queue' })
    expect(logEnabled('debug', 'agent')).toBe(true)
    expect(logEnabled('debug', 'agent:story')).toBe(true)
    expect(logEnabled('debug', 'agentic')).toBe(false)
    expect(logEnabled('debug', 'jobs')).toBe(false)
    expect(logEnabled('debug', 'jobs:queue')).toBe(true)
    configureLog({ debug: '*' })
    expect(logEnabled('debug', 'anything')).toBe(true)
    configureLog({ debug: '' })
    expect(logEnabled('debug', 'anything')).toBe(false)
  })
})

describe('routing', () => {
  test('console and analytics are independent, chosen by call parameters', () => {
    const memory = memoryPlugin()
    addLogPlugin(memory)
    configureLog({ level: 'info' })
    const log = logger('billing')

    log.info('console only')
    log.info('both', { plan: 'pro' }, { event: 'subscription.started', analytics: true })
    log.info('analytics only', undefined, { analytics: 'page_view', console: false })

    expect(memory.records.map(r => r.message)).toEqual(['console only', 'both'])
    expect(memory.events.map(e => e.event)).toEqual(['subscription.started', 'page_view'])
    expect(captured).toHaveLength(2)
  })

  test('analytics ignores the level: a debug call still tracks', () => {
    const memory = memoryPlugin()
    addLogPlugin(memory)
    configureLog({ level: 'error' })
    logger('ui').debug('clicked', { id: 1 }, { analytics: 'click' })
    expect(memory.events).toHaveLength(1)
    expect(memory.records).toHaveLength(0)
    expect(captured).toHaveLength(0)
  })

  test('a broken plugin never breaks the caller or the other plugins', () => {
    addLogPlugin({ name: 'bad', log: () => { throw new Error('nope') }, track: () => { throw new Error('nope') } })
    const memory = memoryPlugin()
    addLogPlugin(memory)
    expect(() => logger('t').info('x', undefined, { analytics: true })).not.toThrow()
    expect(memory.records).toHaveLength(1)
    expect(memory.events).toHaveLength(1)
  })

  test('a plugin of the same name is replaced and uninstall runs on removal', () => {
    const calls: string[] = []
    const remove = addLogPlugin({ name: 'p', install: () => calls.push('in1'), uninstall: () => calls.push('out1') })
    addLogPlugin({ name: 'p', install: () => calls.push('in2') })
    remove()
    // The replacement uninstalls the first plugin, installs the second, and removing the handle
    // of the first removes whatever carries that name now.
    expect(calls).toEqual(['in1', 'out1', 'in2'])
  })

  test('child loggers extend the scope and carry bound data', () => {
    const memory = memoryPlugin()
    addLogPlugin(memory)
    logger('agent', { project: 'p1' }).child('story', { story: 's1' }).info('started', { step: 2 })
    expect(memory.records[0].scope).toBe('agent:story')
    expect(memory.records[0].data).toEqual({ project: 'p1', story: 's1', step: 2 })
  })
})

describe('sink', () => {
  test('text format on a server: iso time, level, scope, event and data', () => {
    logger('jobs').info('Job started', { alias: 'init' }, { event: 'job.start' })
    const [line] = captured[0].args as string[]
    expect(captured[0].method).toBe('info')
    expect(line).toMatch(/^\d{4}-\d\d-\d\dT[\d:.]+Z INFO  \[jobs\] Job started event=job\.start alias=init$/)
  })

  test('absent (undefined) fields are left out of the text line', () => {
    logger('billing').info('Top-up', { plan: undefined, amount: 5 })
    expect(captured[0].args[0] as string).toMatch(/Top-up amount=5$/)
  })

  test('json format writes one parseable line with the error', () => {
    configureLog({ format: 'json' })
    logger('http').error('Request failed', new Error('db down'))
    const parsed = JSON.parse(captured[0].args[0] as string)
    expect(parsed).toMatchObject({ level: 'error', scope: 'http', msg: 'Request failed' })
    expect(parsed.err.message).toBe('db down')
    expect(parsed.err.stack).toContain('db down')
  })

  test('an Error passed as the message becomes the message and the record error', () => {
    const memory = memoryPlugin()
    addLogPlugin(memory)
    const error = new Error('exploded')
    logger('t').error(error)
    expect(memory.records[0].message).toBe('exploded')
    expect(memory.records[0].error).toBe(error)
  })

  test('an Error under data.error is carried once, not duplicated in data', () => {
    const memory = memoryPlugin()
    addLogPlugin(memory)
    const error = new Error('x')
    logger('t').warn('failed', { error, id: 7 })
    expect(memory.records[0].error).toBe(error)
    expect(memory.records[0].data).toEqual({ id: 7 })
  })
})

describe('redaction', () => {
  test('secret-looking keys are replaced, strings clipped, cycles cut', () => {
    const cyclic: Record<string, unknown> = { name: 'a' }
    cyclic.self = cyclic
    const out = redactHelper.redact({
      token: 'abc', nested: { Authorization: 'Bearer x', password: '', fine: 1 },
      long: 'x'.repeat(5000), cyclic,
    }) as Record<string, any>
    expect(out.token).toBe('[redacted]')
    expect(out.nested.Authorization).toBe('[redacted]')
    expect(out.nested.password).toBe('')
    expect(out.nested.fine).toBe(1)
    expect((out.long as string).length).toBeLessThan(2100)
    expect(out.cyclic.self).toBe('[circular]')
  })

  test('token is a secret only at the end of a key — usage counters are not', () => {
    const out = redactHelper.redact({
      token: 'a', accessToken: 'b', id_token: 'c', 'x-auth-token': 'd',
      maxTokens: 10, inputTokens: 5, tokens: 3, tokenCount: 2, apiKey: 'k', clientSecret: 's',
    }) as Record<string, unknown>
    expect([out.token, out.accessToken, out.id_token, out['x-auth-token'], out.apiKey, out.clientSecret])
      .toEqual(Array(6).fill('[redacted]'))
    expect([out.maxTokens, out.inputTokens, out.tokens, out.tokenCount]).toEqual([10, 5, 3, 2])
  })

  test('data is redacted before any sink sees it', () => {
    const memory = memoryPlugin()
    addLogPlugin(memory)
    logger('auth').info('signed in', { account: 'a1', accessToken: 'secret-value' })
    expect(JSON.stringify(memory.records[0].data)).not.toContain('secret-value')
    expect(captured[0].args[0] as string).not.toContain('secret-value')
  })
})

describe('console override', () => {
  test('routes console methods through the logger at their level, under the console scope', () => {
    const memory = memoryPlugin()
    addLogPlugin(memory)
    configureLog({ level: 'debug' })
    overrideConsole()
    console.log('plain', { a: 1 })
    console.info('info line')
    console.warn('warn line')
    console.error('failed', new Error('inner'))
    expect(memory.records.map(r => [r.level, r.scope, r.message])).toEqual([
      ['debug', 'console', 'plain'], ['info', 'console', 'info line'],
      ['warn', 'console', 'warn line'], ['error', 'console', 'failed'],
    ])
    expect(memory.records[0].data).toEqual({ a: 1 })
    expect(memory.records[3].error?.message).toBe('inner')
  })

  test('at info level console.log is dropped and console.error survives', () => {
    configureLog({ level: 'info' })
    overrideConsole()
    console.log('noise')
    console.error('real')
    expect(captured.map(w => w.method)).toEqual(['error'])
  })

  test('is idempotent and restorable, and the sink never recurses', () => {
    overrideConsole()
    const first = console.error
    overrideConsole()
    expect(console.error).toBe(first)
    console.error('once')
    expect(captured).toHaveLength(1)
    restoreConsole()
    expect(console.error).not.toBe(first)
  })
})

describe('appendLog', () => {
  const contextOf = (log: BasicConfig['log']) =>
    makeBasicContext({ ready: false, service: 'x', type: AppType.Backend, log } as BasicConfig)

  test('applies static config at once and installs the console override', () => {
    const before = console.info
    appendLog(contextOf({ level: 'warn' }))
    expect(logConfig().level).toBe('warn')
    expect(console.info).not.toBe(before)
  })

  test('console: native leaves the console alone', () => {
    const before = console.log
    appendLog(contextOf({ level: 'info', console: 'native' }))
    expect(console.log).toBe(before)
  })

  test('a config value resolved by a Config middleware wins, by the Context middleware', async () => {
    const context = contextOf({ level: '/etc/app-config/log-level' })
    // A reader registered BEFORE appendLog, and one registered AFTER it: both resolve the path.
    context.registerMiddleware({
      type: 'config' as never, stage: 'configuration' as never,
      apply: async ctx => { ctx.cfg.log!.level = 'debug' },
    })
    appendLog(context)
    context.registerMiddleware({
      type: 'config' as never, stage: 'configuration' as never,
      apply: async ctx => { ctx.cfg.log!.level = 'error' },
    })
    context.configure()
    await context.init()
    expect(logConfig().level).toBe('error')
  })

  test('is idempotent per context and fills only what cfg.log leaves out', () => {
    const context = contextOf({ level: 'warn' })
    appendLog(context, { level: 'debug', format: 'json' })
    appendLog(context, { level: 'debug', format: 'text' })
    expect(logConfig()).toMatchObject({ level: 'warn', format: 'json' })
  })
})

describe('throttle', () => {
  test('admits a key once per window', () => {
    expect(logThrottle('k', 60_000)).toBe(true)
    expect(logThrottle('k', 60_000)).toBe(false)
    expect(logThrottle('other', 60_000)).toBe(true)
  })
})
