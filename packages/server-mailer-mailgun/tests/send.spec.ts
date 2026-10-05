import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { AppType, makeBasicContext } from '@owlmeans/context'
import type { BasicConfig } from '@owlmeans/context'
import type { MailerService } from '@owlmeans/mailer'
import { MAILGUN_MAILER, makeMailgunMailerService } from '../src/index.js'
import type { MailgunConfig } from '../src/index.js'

interface Received { path: string, authorization: string | null, form: URLSearchParams }

/**
 * A local stand-in for the Mailgun messages API: it records what arrives and answers with the status
 * the test asks for. `baseUrl` is the config's own override, so the service code runs unchanged.
 */
const received: Received[] = []
let status = 200
const api = Bun.serve({
  port: 0,
  fetch: async request => {
    received.push({
      path: new URL(request.url).pathname,
      authorization: request.headers.get('authorization'),
      form: new URLSearchParams(await request.text()),
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

  test('a refusal surfaces as an error carrying the status and the body', async () => {
    status = 404
    await expect(mailer.send({ to: 'person@example.com', subject: 'Hi', text: 'x' }))
      .rejects.toThrow('Mailgun send failed [404]: domain not found')
    status = 200
  })
})
