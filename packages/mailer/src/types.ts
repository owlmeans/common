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

/** Provider-agnostic email dispatch service — what every caller resolves by alias. */
export interface MailerService extends InitializedService {
  send: (message: MailMessage) => Promise<void>
}

/**
 * One way of delivering mail, plugged into a mailer host. A transport package builds it (bound to
 * the context it reads its settings from) and registers it with `appendMailerTransport`.
 */
export interface MailerTransport {
  /**
   * The id the host keeps the transport by. Registering a transport with an id the host already
   * holds replaces the earlier one.
   */
  readonly id: string
  /** Deliver one message. A refusal throws; nothing is retried here. */
  send: (message: MailMessage) => Promise<void>
  /**
   * Run once while the context initializes, when the transport is the one the host sends through:
   * validate settings, open or verify a connection. A throw fails the context's start.
   */
  init?: () => Promise<void>
  /** Prove the transport can deliver without sending anything. Throws when it cannot. */
  verify?: () => Promise<true>
  /** Release whatever the transport holds open. */
  close?: () => Promise<void>
}

/** The dev/test transport: delivers by logging, and keeps what it sent for inspection. */
export interface ConsoleMailerTransport extends MailerTransport {
  /** Messages captured since the transport was created (use in tests). */
  captured: MailMessage[]
}

/**
 * The mailer host: the `MailerService` callers resolve, dispatching every `send` to one registered
 * transport. With none registered it writes mail to the console.
 */
export interface MailerHostService extends MailerService {
  /**
   * Add a transport (replacing one of the same id) and make it the one `send` uses — the most
   * recently registered transport wins. Register from `makeContext`, before the context initializes:
   * the host runs the chosen transport's `init` while the context does.
   */
  register: (transport: MailerTransport) => void
  /** A registered transport by id; `CONSOLE_MAILER` answers the built-in console transport. */
  get: (id: string) => MailerTransport | undefined
  /** The transport `send` dispatches to: the most recently registered one, else the console. */
  active: () => MailerTransport
}

/** Where a transport is registered. */
export interface MailerAppendOptions {
  /** The alias of the host to register into; `MAILER_SERVICE` by default. */
  alias?: string
}

/** The standalone console service: delivers by logging, and keeps what it sent for inspection. */
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
