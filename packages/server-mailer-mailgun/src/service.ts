import { createService } from '@owlmeans/context'
import type { MailerService } from '@owlmeans/mailer'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import { MAILGUN_MAILER } from './consts.js'

export interface MailgunConfig extends ServerConfig {
  mailgun: {
    /** Mailgun API key (starts with key-...) */
    apiKey: string
    /** Mailgun sending domain (e.g. mg.example.com) */
    domain: string
    /** Sender address (e.g. "OwlMeans Platform <noreply@mg.example.com>") */
    from: string
    /** Override the Mailgun API base URL. Defaults to https://api.mailgun.net/v3 */
    baseUrl?: string
  }
}

type Context = ServerContext<MailgunConfig>

export const makeMailgunMailerService = (alias = MAILGUN_MAILER): MailerService => {
  const service = createService<MailerService>(alias, {
    send: async message => {
      const ctx = (service as any).ctx as Context
      const { apiKey, domain, from, baseUrl = 'https://api.mailgun.net/v3' } = ctx.cfg.mailgun

      const url = `${baseUrl}/${domain}/messages`

      const body = new URLSearchParams()
      body.set('from', message.from ?? from)
      body.set('to', message.to)
      body.set('subject', message.subject)
      if (message.text) body.set('text', message.text)
      if (message.html) body.set('html', message.html)
      // Mailgun carries arbitrary headers under the `h:` prefix.
      if (message.replyTo) body.set('h:Reply-To', message.replyTo)
      for (const [name, value] of Object.entries(message.headers ?? {})) {
        body.set(`h:${name}`, value)
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`api:${apiKey}`)}`,
        },
        body,
      })

      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(`Mailgun send failed [${res.status}]: ${detail}`)
      }
    },
  })

  return service
}
