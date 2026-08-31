import type { MailerService } from '@owlmeans/mailer'
import type { ServerConfig } from '@owlmeans/server-context'

/**
 * SMTP transport settings, read from `cfg.smtp` at send time.
 *
 * Numbers and booleans accept a string form on purpose: server contexts resolve
 * config leafs that look like paths through `fileConfigReader`, so a value mounted
 * from a Kubernetes ConfigMap always arrives as text. The service coerces them.
 */
export interface SmtpSettings {
  /** SMTP server, e.g. `smtp.eu.mailgun.org`. */
  host: string
  /** Defaults to 465. */
  port?: number | string
  /** `true` (default) = implicit TLS, for port 465. Use `false` with the STARTTLS ports. */
  secure?: boolean | string
  user?: string
  pass?: string
  /** Default `From` header — `'OwlMeans <no-reply@example.com>'`. A message may override it. */
  from: string
  /** Default `Reply-To` header. */
  replyTo?: string
  /** Verify the server certificate. Defaults to `true`; only disable knowingly. */
  rejectUnauthorized?: boolean | string
  /** Headers added to every message. Per-message headers win on conflict. */
  headers?: Record<string, string>
  /** Connection timeout in milliseconds. */
  timeout?: number | string
}

export interface SmtpConfig extends ServerConfig {
  smtp: SmtpSettings
}

export interface SmtpMailerService extends MailerService {
  /** Open a session and authenticate without submitting a message. Throws when the server rejects. */
  verify: () => Promise<true>
  /** Release a pooled connection. A no-op for the default, non-pooled transport. */
  close: () => Promise<void>
}
