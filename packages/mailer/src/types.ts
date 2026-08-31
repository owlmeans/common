import type { InitializedService } from '@owlmeans/context'

export interface MailMessage {
  to: string
  subject: string
  text?: string
  html?: string
  /** Overrides the transport's configured sender for this message alone. */
  from?: string
  replyTo?: string
  /** Extra headers. A transport that cannot carry them ignores the field. */
  headers?: Record<string, string>
}

/** Provider-agnostic email dispatch service */
export interface MailerService extends InitializedService {
  send: (message: MailMessage) => Promise<void>
}
