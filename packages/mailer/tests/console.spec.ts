import { describe, expect, test } from 'bun:test'
import { AppType, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig } from '@owlmeans/context'
import { CONSOLE_MAILER, MAILER_SERVICE, makeConsoleMailerService, makeDefaultConsoleMailerService } from '../src/index.js'
import type { MailerService } from '../src/index.js'

/** Registered and initialized the way an application does it, then looked up by alias. */
const booted = async (service: MailerService) => {
  const ctx = makeBasicContext<BasicConfig>({ ready: false, service: 'mailer-tests', type: AppType.Backend })
  ctx.registerService(service)
  ctx.configure()
  await ctx.init()

  return ctx
}

describe('@owlmeans/mailer — console transport', () => {
  test('is registered under its own alias unless told otherwise', () => {
    expect(makeConsoleMailerService().alias).toBe(CONSOLE_MAILER)
    expect(makeConsoleMailerService('outbox').alias).toBe('outbox')
  })

  test('the default variant answers the alias every consumer looks the mailer up by', async () => {
    const mailer = makeDefaultConsoleMailerService()
    const ctx = await booted(mailer)

    expect(ctx.service<MailerService>(MAILER_SERVICE)).toBe(mailer)
  })

  test('captures every message as sent, in order, without touching it', async () => {
    const mailer = makeConsoleMailerService()
    await booted(mailer)
    const first = { to: 'a@example.com', subject: 'Code', text: '123456' }
    const second = {
      to: 'b@example.com', subject: 'Report', html: '<b>done</b>', from: 'Ops <ops@example.com>',
      replyTo: 'help@example.com', headers: { 'X-Run': '7' },
    }

    await mailer.send(first)
    await mailer.send(second)

    expect(mailer.captured).toEqual([first, second])
  })

  test('each instance keeps its own outbox', async () => {
    const one = makeConsoleMailerService('one')
    const two = makeConsoleMailerService('two')
    await one.send({ to: 'a@example.com', subject: 'only one' })

    expect(one.captured).toHaveLength(1)
    expect(two.captured).toHaveLength(0)
  })
})
