import { describe, expect, test } from 'bun:test'
import nodemailer from 'nodemailer'
import {
  assertSmtpSettings, makeSmtpSettingsModel, SMTP_DEFAULT_PORT,
} from '@owlmeans/mailer-smtp'
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
  test('authenticated mode requires host, from, user, and password', () => {
    expect(() => assertSmtpSettings(base, 'mailer', { authenticated: true })).not.toThrow()
    for (const field of ['host', 'from', 'user', 'pass'] as const) {
      expect(() => assertSmtpSettings({ ...base, [field]: '' }, 'mailer', { authenticated: true }))
        .toThrow(`cfg.smtp.${field}`)
    }
  })

  test('defaults to implicit TLS on 465 with certificate verification', () => {
    const options = makeSmtpSettingsModel(base).toTransportOptions()

    expect(options.port).toBe(SMTP_DEFAULT_PORT)
    expect(options.secure).toBe(true)
    expect(options.tls).toEqual({ rejectUnauthorized: true })
    expect(options.auth).toEqual({ user: base.user, pass: base.pass })
  })

  test('coerces the string forms a ConfigMap file delivers', () => {
    const options = makeSmtpSettingsModel({
      ...base, port: '2525', secure: 'false', rejectUnauthorized: '0', timeout: '5000',
    }).toTransportOptions()

    expect(options.port).toBe(2525)
    expect(options.secure).toBe(false)
    expect(options.tls).toEqual({ rejectUnauthorized: false })
    expect(options.connectionTimeout).toBe(5000)
  })

  test('falls back to the default port when the value is unusable', () => {
    expect(makeSmtpSettingsModel({ ...base, port: '' }).toTransportOptions().port).toBe(SMTP_DEFAULT_PORT)
    expect(makeSmtpSettingsModel({ ...base, port: 'nonsense' }).toTransportOptions().port).toBe(SMTP_DEFAULT_PORT)
  })

  test('omits auth for an unauthenticated relay', () => {
    expect(makeSmtpSettingsModel({ ...base, user: '' }).toTransportOptions().auth).toBeUndefined()
  })
})

describe('@owlmeans/mailer-smtp — message mapping', () => {
  const message = { to: 'user@example.com', subject: 'Your login code', text: '106341' }

  test('applies the configured sender and reply-to', () => {
    const options = makeSmtpSettingsModel({ ...base, replyTo: 'support@example.org' }).toMailOptions(message)

    expect(options.from).toBe(base.from)
    expect(options.replyTo).toBe('support@example.org')
    expect(options.headers).toBeUndefined()
  })

  test('lets a message override the sender and reply-to', () => {
    const options = makeSmtpSettingsModel({ ...base, replyTo: 'support@example.org' }).toMailOptions(
      { ...message, from: 'Other <other@example.org>', replyTo: 'nobody@example.org' }
    )

    expect(options.from).toBe('Other <other@example.org>')
    expect(options.replyTo).toBe('nobody@example.org')
  })

  test('merges headers with the message winning', () => {
    const options = makeSmtpSettingsModel({ ...base, headers: { 'X-Origin': 'config', 'X-Kept': 'yes' } }).toMailOptions(
      { ...message, headers: { 'X-Origin': 'message' } }
    )

    expect(options.headers).toEqual({ 'X-Origin': 'message', 'X-Kept': 'yes' })
  })

  test('nodemailer builds the envelope we described', async () => {
    const transport = nodemailer.createTransport({ jsonTransport: true })
    const info = await transport.sendMail(makeSmtpSettingsModel({ ...base, headers: { 'X-OwlMeans-Test': 'mapping' } }).toMailOptions(
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

  test('attachments travel as decoded bytes under their own names and types', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const options = makeSmtpSettingsModel(base).toMailOptions({
      ...message,
      attachments: [
        { filename: 'shot.png', content: png, contentType: 'image/png' },
        { filename: 'notes.txt', content: 'aGVsbG8=', encoding: 'base64', contentType: 'text/plain' },
      ],
    })

    expect(options.attachments).toHaveLength(2)
    expect(makeSmtpSettingsModel(base).toMailOptions(message).attachments).toBeUndefined()

    const transport = nodemailer.createTransport({ jsonTransport: true })
    const info = await transport.sendMail(options)
    const built = JSON.parse(info.message as unknown as string)

    expect(built.attachments.map((a: { filename: string }) => a.filename)).toEqual(['shot.png', 'notes.txt'])
    expect(built.attachments[0].contentType).toBe('image/png')
    expect(Buffer.from(built.attachments[0].content, 'base64')).toEqual(Buffer.from(png))
    expect(built.attachments[1].contentType).toBe('text/plain')
    expect(Buffer.from(built.attachments[1].content, 'base64').toString('utf8')).toBe('hello')
  })
})
