import { createService } from '@owlmeans/context'
import { mailAttachmentHelper } from '@owlmeans/mailer'
import type { MailerService, MailMessage } from '@owlmeans/mailer'
import { MAILGUN_MAILER } from './consts.js'
import type { Context } from './types.local.js'

export const makeMailgunMailerService = (alias = MAILGUN_MAILER): MailerService => {
  /** The message's parameters under their Mailgun names, in the order they are sent. */
  const fieldsOf = (message: MailMessage, from: string): [string, string][] => {
    const fields: [string, string][] = [
      ['from', message.from ?? from],
      ['to', message.to],
      ['subject', message.subject],
    ]
    if (message.text) fields.push(['text', message.text])
    if (message.html) fields.push(['html', message.html])
    // Mailgun carries arbitrary headers under the `h:` prefix.
    if (message.replyTo) fields.push(['h:Reply-To', message.replyTo])
    for (const [name, value] of Object.entries(message.headers ?? {})) {
      fields.push([`h:${name}`, value])
    }

    return fields
  }

  /**
   * A form-encoded body for a plain message; `multipart/form-data` with one `attachment` part per
   * file when the message carries files — the only shape Mailgun accepts them in.
   */
  const bodyOf = (message: MailMessage, from: string): URLSearchParams | FormData => {
    const fields = fieldsOf(message, from)
    const attachments = message.attachments ?? []
    if (attachments.length === 0) {
      return new URLSearchParams(fields)
    }

    const form = new FormData()
    for (const [name, value] of fields) form.append(name, value)
    for (const attachment of attachments) {
      const bytes = mailAttachmentHelper.bytesOf(attachment)
      const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: attachment.contentType ?? 'application/octet-stream' })
      form.append('attachment', blob, attachment.filename)
    }

    return form
  }

  const service = createService<MailerService>(alias, {
    send: async message => {
      const ctx = (service as any).ctx as Context
      const { apiKey, domain, from, baseUrl = 'https://api.mailgun.net/v3' } = ctx.cfg.mailgun

      const url = `${baseUrl}/${domain}/messages`

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`api:${apiKey}`)}`,
        },
        body: bodyOf(message, from),
      })

      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(`Mailgun send failed [${res.status}]: ${detail}`)
      }
    },
  })

  return service
}
