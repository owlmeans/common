import type { InitializedService } from '@owlmeans/context'

/** A file carried by a message. */
export interface MailAttachment {
  /** The name the recipient sees; the transport never derives a path from it. */
  filename: string
  /**
   * The file itself: raw bytes, or text in `encoding` (UTF-8 when `encoding` is absent). A
   * transport may hand the bytes to its provider, never to a log.
   */
  content: Uint8Array | string
  /** How a string `content` is encoded — `base64`, `hex`, `latin1`/`binary` or `utf8` (default). */
  encoding?: string
  /** The MIME type the file is sent with; absent = the transport's own guess from the name. */
  contentType?: string
}

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
  /** Files sent with the message, in order. */
  attachments?: MailAttachment[]
}

/** Provider-agnostic email dispatch service */
export interface MailerService extends InitializedService {
  send: (message: MailMessage) => Promise<void>
}

/** The dev/test transport: delivers by logging, and keeps what it sent for inspection. */
export interface ConsoleMailerService extends MailerService {
  /** Messages captured since the service was created (use in tests). */
  captured: MailMessage[]
}

/** What every transport needs to know about an attachment without reading it into a log. */
export interface MailAttachmentHelper {
  /** The attachment's bytes, decoded from a string `content` by its `encoding`. */
  bytesOf: (attachment: MailAttachment) => Uint8Array
  /** The attachment's size in bytes. */
  sizeOf: (attachment: MailAttachment) => number
  /** What a log may say about the attachments: their names and sizes, never their content. */
  describe: (attachments?: MailAttachment[]) => MailAttachmentSummary[]
}

/** One attachment as a log line carries it. */
export interface MailAttachmentSummary {
  filename: string
  size: number
  contentType?: string
}
