import { describe, expect, test } from 'bun:test'
import { AppType, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig } from '@owlmeans/context'
import { addLogPlugin, configureLog, logConfig, memoryPlugin } from '@owlmeans/log'
import {
  CONSOLE_MAILER, MAILER_SERVICE, mailAttachmentHelper, makeConsoleMailerService, makeDefaultConsoleMailerService,
} from '../src/index.js'
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

  test('writes the envelope at info and the text only at debug', async () => {
    const memory = memoryPlugin('mailer-body')
    const remove = addLogPlugin(memory)
    const level = logConfig().level
    try {
      const mailer = makeConsoleMailerService()
      const message = { to: 'a@example.com', subject: 'Code', text: 'your code is 482913' }

      configureLog({ level: 'info' })
      await mailer.send(message)
      expect(memory.records.map(r => [r.level, r.message, r.data])).toEqual([
        ['info', 'Mail written to the console', { to: 'a@example.com', subject: 'Code' }],
      ])
      expect(JSON.stringify(memory.records)).not.toContain('482913')

      memory.clear()
      configureLog({ level: 'debug' })
      await mailer.send(message)
      expect(memory.records.map(r => [r.level, r.message])).toEqual([
        ['info', 'Mail written to the console'], ['debug', 'Mail body'],
      ])
      expect((memory.records[1].data as { body: string }).body).toBe('your code is 482913')
    } finally {
      configureLog({ level })
      remove()
    }
  })

  test('each instance keeps its own outbox', async () => {
    const one = makeConsoleMailerService('one')
    const two = makeConsoleMailerService('two')
    await one.send({ to: 'a@example.com', subject: 'only one' })

    expect(one.captured).toHaveLength(1)
    expect(two.captured).toHaveLength(0)
  })
})

describe('@owlmeans/mailer — attachments', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  test('the console transport names and sizes attachments, never logs their content', async () => {
    const memory = memoryPlugin('mailer-attachments')
    const remove = addLogPlugin(memory)
    try {
      const mailer = makeConsoleMailerService()
      await mailer.send({
        to: 'a@example.com', subject: 'Report', text: 'see attached',
        attachments: [
          { filename: 'shot.png', content: png, contentType: 'image/png' },
          { filename: 'notes.txt', content: 'c2VjcmV0LWNvbnRlbnQ=', encoding: 'base64' },
        ],
      })

      const record = memory.records.find(r => r.message === 'Mail written to the console')
      expect(record).toBeDefined()
      expect((record!.data as { attachments: unknown }).attachments).toEqual([
        { filename: 'shot.png', size: 8, contentType: 'image/png' },
        { filename: 'notes.txt', size: 14 },
      ])
      expect(JSON.stringify(record!.data)).not.toContain('c2VjcmV0LWNvbnRlbnQ=')
      expect(JSON.stringify(record!.data)).not.toContain('secret-content')
      expect(mailer.captured[0].attachments).toHaveLength(2)
    } finally {
      remove()
    }
  })

  test('decodes string content by its encoding', () => {
    const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes)

    expect(mailAttachmentHelper.bytesOf({ filename: 'a', content: png })).toBe(png)
    expect(text(mailAttachmentHelper.bytesOf({ filename: 'a', content: 'aGVsbG8=', encoding: 'base64' }))).toBe('hello')
    expect(text(mailAttachmentHelper.bytesOf({ filename: 'a', content: '68656c6c6f', encoding: 'hex' }))).toBe('hello')
    expect(mailAttachmentHelper.sizeOf({ filename: 'a', content: 'żółw' })).toBe(7)
    expect(mailAttachmentHelper.sizeOf({ filename: 'a', content: 'abc', encoding: 'latin1' })).toBe(3)
    expect(() => mailAttachmentHelper.bytesOf({ filename: 'a', content: 'abc', encoding: 'hex' })).toThrow()
  })
})
