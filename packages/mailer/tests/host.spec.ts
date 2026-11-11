import { describe, expect, test } from 'bun:test'
import { AppType, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig } from '@owlmeans/context'
import { configureLog, logConfig } from '@owlmeans/log'
import {
  appendMailerTransport, CONSOLE_MAILER, createConsoleMailerTransport, createMailerService, ensureMailerService,
  MAILER_SERVICE, makeDefaultConsoleMailerService,
} from '../src/index.js'
import type { ConsoleMailerTransport, MailerService, MailerTransport, MailMessage } from '../src/index.js'

const context = () => makeBasicContext<BasicConfig>({ ready: false, service: 'mailer-host-tests', type: AppType.Backend })

/** A transport that records what reached it and which lifecycle members ran. */
const recording = (id: string, failInit = false) => {
  const sent: MailMessage[] = []
  const calls: string[] = []
  const transport: MailerTransport = {
    id,
    send: async message => { sent.push(message) },
    init: async () => {
      calls.push('init')
      if (failInit) throw new Error(`${id}: relay refused`)
    },
  }

  return { transport, sent, calls }
}

const message: MailMessage = { to: 'a@example.com', subject: 'Code', text: '123456' }

describe('@owlmeans/mailer — the host', () => {
  test('callers resolve MAILER_SERVICE and their send reaches the registered transport', async () => {
    const ctx = context()
    const smtp = recording('relay')
    appendMailerTransport(ctx, smtp.transport)
    ctx.configure()
    await ctx.init()

    await ctx.service<MailerService>(MAILER_SERVICE).send(message)

    expect(smtp.sent).toEqual([message])
  })

  test('with no transport registered, mail goes to the built-in console transport', async () => {
    const level = logConfig().level
    configureLog({ level: 'warn' })
    try {
      const ctx = context()
      const host = ensureMailerService(ctx)
      ctx.configure()
      await ctx.init()

      await host.send(message)

      expect(host.active().id).toBe(CONSOLE_MAILER)
      expect((host.get(CONSOLE_MAILER) as ConsoleMailerTransport).captured).toEqual([message])
    } finally {
      configureLog({ level })
    }
  })

  test('is idempotent before the context initializes — a second ensure is the same host', () => {
    const ctx = context()

    expect(ensureMailerService(ctx)).toBe(ensureMailerService(ctx))
    expect(ctx.hasService(MAILER_SERVICE)).toBe(true)
  })

  test('finds a host registered directly with registerService', () => {
    const ctx = context()
    const host = createMailerService()
    ctx.registerService(host)

    expect(ensureMailerService(ctx)).toBe(host)
  })

  test('the most recently registered transport is the one send uses; an id registered again replaces it', async () => {
    const ctx = context()
    const one = recording('one')
    const two = recording('two')
    const again = recording('one')
    const host = ensureMailerService(ctx)

    host.register(one.transport)
    host.register(two.transport)
    expect(host.active()).toBe(two.transport)

    host.register(again.transport)
    expect(host.active()).toBe(again.transport)
    expect(host.get('one')).toBe(again.transport)
    expect(host.get('two')).toBe(two.transport)
    expect(host.get('absent')).toBeUndefined()
  })

  test('the context runs the init of the transport send uses, and only that one', async () => {
    const ctx = context()
    const replaced = recording('replaced')
    const chosen = recording('chosen')
    appendMailerTransport(ctx, replaced.transport)
    appendMailerTransport(ctx, chosen.transport)
    ctx.configure()
    await ctx.init()

    expect(chosen.calls).toEqual(['init'])
    expect(replaced.calls).toEqual([])
  })

  test('a transport whose init throws fails the context start', async () => {
    const ctx = context()
    appendMailerTransport(ctx, recording('broken', true).transport)
    ctx.configure()

    await expect(ctx.init()).rejects.toThrow('broken: relay refused')
  })

  test('a host under another alias is separate — one process can run two transports', async () => {
    const ctx = context()
    const main = recording('main')
    const guarded = recording('guarded')
    appendMailerTransport(ctx, main.transport)
    expect(appendMailerTransport(ctx, guarded.transport, { alias: 'guarded-mail' })).toBe(guarded.transport)
    ctx.configure()
    await ctx.init()

    await ctx.service<MailerService>('guarded-mail').send(message)

    expect(guarded.sent).toEqual([message])
    expect(main.sent).toEqual([])
    expect(ensureMailerService(ctx, 'guarded-mail')).not.toBe(ensureMailerService(ctx))
  })

  test('refuses an alias held by a standalone mailer service instead of shadowing it', () => {
    const ctx = context()
    ctx.registerService(makeDefaultConsoleMailerService())

    expect(() => ensureMailerService(ctx)).toThrow(/not a mailer host/)
  })

  test('a console transport registered explicitly keeps its own outbox for the test to read', async () => {
    const ctx = context()
    const outbox = appendMailerTransport(ctx, createConsoleMailerTransport())
    ctx.configure()
    await ctx.init()

    const level = logConfig().level
    configureLog({ level: 'warn' })
    try {
      await ctx.service<MailerService>(MAILER_SERVICE).send(message)
    } finally {
      configureLog({ level })
    }

    expect(outbox.captured).toEqual([message])
  })
})
