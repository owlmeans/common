import { describe, expect, test } from 'bun:test'
import nodemailer from 'nodemailer'
import { SMTP_DEFAULT_PORT, toMailOptions, toTransportOptions } from '@owlmeans/mailer-smtp'
import type { SmtpSettings } from '@owlmeans/mailer-smtp'

const base: SmtpSettings = {
  host: 'smtp.example.org',
  user: 'no-reply@example.org',
  pass: 'secret',
  from: 'Example <no-reply@example.org>',
}

/**
 * No gate and no network: these assert the translation into nodemailer's own shapes,
 * and let nodemailer itself build the envelope through its bundled `jsonTransport`.
 */
describe('@owlmeans/mailer-smtp — transport options', () => {
  test('defaults to implicit TLS on 465 with certificate verification', () => {
    const options = toTransportOptions(base)

    expect(options.port).toBe(SMTP_DEFAULT_PORT)
    expect(options.secure).toBe(true)
    expect(options.tls).toEqual({ rejectUnauthorized: true })
    expect(options.auth).toEqual({ user: base.user, pass: base.pass })
  })

  test('coerces the string forms a ConfigMap file delivers', () => {
    const options = toTransportOptions({
      ...base, port: '2525', secure: 'false', rejectUnauthorized: '0', timeout: '5000',
    })

    expect(options.port).toBe(2525)
    expect(options.secure).toBe(false)
    expect(options.tls).toEqual({ rejectUnauthorized: false })
    expect(options.connectionTimeout).toBe(5000)
  })

  test('falls back to the default port when the value is unusable', () => {
    expect(toTransportOptions({ ...base, port: '' }).port).toBe(SMTP_DEFAULT_PORT)
    expect(toTransportOptions({ ...base, port: 'nonsense' }).port).toBe(SMTP_DEFAULT_PORT)
  })

  test('omits auth for an unauthenticated relay', () => {
    expect(toTransportOptions({ ...base, user: '' }).auth).toBeUndefined()
  })
})

describe('@owlmeans/mailer-smtp — message mapping', () => {
  const message = { to: 'user@example.com', subject: 'Your login code', text: '106341' }

  test('applies the configured sender and reply-to', () => {
    const options = toMailOptions({ ...base, replyTo: 'support@example.org' }, message)

    expect(options.from).toBe(base.from)
    expect(options.replyTo).toBe('support@example.org')
    expect(options.headers).toBeUndefined()
  })

  test('lets a message override the sender and reply-to', () => {
    const options = toMailOptions(
      { ...base, replyTo: 'support@example.org' },
      { ...message, from: 'Other <other@example.org>', replyTo: 'nobody@example.org' }
    )

    expect(options.from).toBe('Other <other@example.org>')
    expect(options.replyTo).toBe('nobody@example.org')
  })

  test('merges headers with the message winning', () => {
    const options = toMailOptions(
      { ...base, headers: { 'X-Origin': 'config', 'X-Kept': 'yes' } },
      { ...message, headers: { 'X-Origin': 'message' } }
    )

    expect(options.headers).toEqual({ 'X-Origin': 'message', 'X-Kept': 'yes' })
  })

  test('nodemailer builds the envelope we described', async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true })
    const info = await transport.sendMail(toMailOptions(
      { ...base, headers: { 'X-OwlMeans-Test': 'mapping' } },
      { ...message, html: '<p>106341</p>' }
    ))

    const built = JSON.parse(info.message as unknown as string)

    expect(built.from.address).toBe('no-reply@example.org')
    expect(built.to[0].address).toBe('user@example.com')
    expect(built.subject).toBe('Your login code')
    expect(built.text).toBe('106341')
    expect(built.html).toBe('<p>106341</p>')
    expect(built.headers['X-OwlMeans-Test']).toBe('mapping')
  })
})
