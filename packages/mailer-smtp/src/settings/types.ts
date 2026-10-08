import type { MailMessage } from '@owlmeans/mailer'
import type { SendMailOptions, SMTPTransportOptions } from 'nodemailer'

/** One `cfg.smtp` block, translated into what nodemailer takes. */
export interface SmtpSettingsModel {
  /**
   * Translate the settings block into nodemailer's transport options.
   *
   * Deliberately unpooled: a pooled transport holds its socket open and would keep a
   * short-lived process alive, and the traffic this serves — login codes — is far below
   * the volume that makes pooling worth that.
   */
  toTransportOptions: () => SMTPTransportOptions
  /**
   * Translate a provider-agnostic message into nodemailer's envelope, applying the config defaults.
   * Attachments are handed over as decoded bytes with their name and declared MIME type.
   */
  toMailOptions: (message: MailMessage) => SendMailOptions
}
