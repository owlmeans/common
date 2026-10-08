import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { AppType, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig } from '@owlmeans/context'
import type { MailerService } from '@owlmeans/mailer'
import { MAILGUN_MAILER, makeMailgunMailerService } from '../src/index.js'
import type { MailgunConfig } from '../src/index.js'

interface ReceivedFile { name: string, type: string, bytes: Uint8Array }
interface Received {
  path: string, authorization: string | null, contentType: string | null, form: URLSearchParams, files: ReceivedFile[]
}

/**
 * A local stand-in for the Mailgun messages API: it records what arrives and answers with the status
 * the test asks for. `baseUrl` is the config's own override, so the service code runs unchanged.
 */
const received: Received[] = []
let status = 200
const api = Bun.serve({
  port: 0,
  fetch: async request => {
    const contentType = request.headers.get('content-type')
    const form = new URLSearchParams()
    const files: ReceivedFile[] = []
    if (contentType?.startsWith('multipart/form-data') === true) {
      for (const [name, value] of await request.formData()) {
        if (typeof value === 'string') {
          form.append(name, value)
        } else {
          files.push({ name: `${name}:${value.name}`, type: value.type, bytes: new Uint8Array(await value.arrayBuffer()) })
        }
      }
    } else {
      for (const [name, value] of new URLSearchParams(await request.text())) form.append(name, value)
    }
    received.push({
      path: new URL(request.url).pathname,
      authorization: request.headers.get('authorization'),
      contentType, form, files,
    })

    return new Response(status === 200 ? '{"id":"<1@mg>","message":"Queued"}' : 'domain not found', { status })
  },
})

const mailgun: MailgunConfig['mailgun'] = {
  apiKey: 'key-test', domain: 'mg.example.com', from: 'App <noreply@mg.example.com>',
  baseUrl: `http://127.0.0.1:${api.port}/v3`,
}

const booted = async (): Promise<MailerService> => {
  const service = makeMailgunMailerService()
  const ctx = makeBasicContext<BasicConfig>({
    ready: false, service: 'mailgun-tests', type: AppType.Backend, mailgun,
  } as BasicConfig)
  ctx.registerService(service)
  ctx.configure()
  await ctx.init()

  return service
}

let mailer: MailerService
beforeAll(async () => { mailer = await booted() })
afterAll(() => { api.stop(true) })

describe('@owlmeans/server-mailer-mailgun', () => {
  test('is registered under its own alias by default', () => {
    expect(makeMailgunMailerService().alias).toBe(MAILGUN_MAILER)
  })

  test('posts the message as a form to the domain endpoint with basic auth for the api user', async () => {
    received.length = 0
    status = 200
    await mailer.send({ to: 'person@example.com', subject: 'Your code', text: '123456', html: '<p>123456</p>' })

    expect(received).toHaveLength(1)
    const [call] = received
    expect(call.path).toBe('/v3/mg.example.com/messages')
    expect(call.authorization).toBe(`Basic ${btoa('api:key-test')}`)
    expect(Object.fromEntries(call.form)).toEqual({
      from: mailgun.from, to: 'person@example.com', subject: 'Your code', text: '123456', html: '<p>123456</p>',
    })
  })

  test('a message sender, reply-to and headers ride under their Mailgun names', async () => {
    received.length = 0
    status = 200
    await mailer.send({
      to: 'person@example.com', subject: 'Hi', text: 'x', from: 'Ops <ops@mg.example.com>',
      replyTo: 'help@example.com', headers: { 'X-Run': '7' },
    })

    const form = received[0].form
    expect(form.get('from')).toBe('Ops <ops@mg.example.com>')
    expect(form.get('h:Reply-To')).toBe('help@example.com')
    expect(form.get('h:X-Run')).toBe('7')
    expect(form.has('html')).toBe(false)
  })

  test('a message without files is form-encoded', async () => {
    received.length = 0
    status = 200
    await mailer.send({ to: 'person@example.com', subject: 'Hi', text: 'x' })

    expect(received[0].contentType).toStartWith('application/x-www-form-urlencoded')
    expect(received[0].files).toEqual([])
  })

  test('files ride as multipart `attachment` parts beside the same fields', async () => {
    received.length = 0
    status = 200
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    await mailer.send({
      to: 'person@example.com', subject: 'Report', text: 'see attached', replyTo: 'help@example.com',
      attachments: [
        { filename: 'shot.png', content: png, contentType: 'image/png' },
        { filename: 'notes.txt', content: 'aGVsbG8=', encoding: 'base64', contentType: 'text/plain' },
      ],
    })

    const [call] = received
    expect(call.contentType).toStartWith('multipart/form-data')
    expect(Object.fromEntries(call.form)).toEqual({
      from: mailgun.from, to: 'person@example.com', subject: 'Report', text: 'see attached', 'h:Reply-To': 'help@example.com',
    })
    // A text type may arrive with the runtime's charset parameter appended.
    expect(call.files.map(file => [file.name, file.type.split(';')[0]])).toEqual([
      ['attachment:shot.png', 'image/png'], ['attachment:notes.txt', 'text/plain'],
    ])
    expect(call.files[0].bytes).toEqual(png)
    expect(new TextDecoder().decode(call.files[1].bytes)).toBe('hello')
  })

  test('a refusal surfaces as an error carrying the status and the body', async () => {
    status = 404
    await expect(mailer.send({ to: 'person@example.com', subject: 'Hi', text: 'x' }))
      .rejects.toThrow('Mailgun send failed [404]: domain not found')
    status = 200
  })
})
