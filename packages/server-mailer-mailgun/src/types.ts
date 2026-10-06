import type { ServerConfig } from '@owlmeans/server-context'

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
