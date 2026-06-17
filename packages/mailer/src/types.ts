import type { InitializedService } from '@owlmeans/context'

export interface MailMessage {
  to: string
  subject: string
  text?: string
  html?: string
}

/** Provider-agnostic email dispatch service */
export interface MailerService extends InitializedService {
  send: (message: MailMessage) => Promise<void>
}
