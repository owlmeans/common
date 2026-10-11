import type { ConsumerRightsPolicy } from '@owlmeans/payment'
import type { ConsumerMailData, ConsumerMailKind, ConsumerMailPluginConfig, TraderDef } from '../../types.js'

/** The consumer-rights mails of a context, on a durable medium. */
export interface ConsumerMailHelper {
  /** The trader as the mails and the withdrawal information name it: legal name, address, e-mail. */
  traderIdentityOf: (trader: TraderDef) => string
  /** The declared trader; an undeclared one falls back to the service name (no mechanism is on then). */
  traderOf: (mail: ConsumerMailPluginConfig | null) => TraderDef
  /** A plan's title in a language: its localization, else its catalogue title, else its sku. */
  planTitleOf: (planSku: string | undefined, lng: string) => Promise<string>
  /**
   * Everything a mail of `kind` about `recordId` is rendered from, read back from the records — the
   * mail repeats exactly what was recorded, and a retry renders the same message. `null` when there
   * is nobody to write to.
   */
  mailDataOf: (
    policy: ConsumerRightsPolicy, trader: TraderDef, kind: ConsumerMailKind, recordId: string,
  ) => Promise<ConsumerMailData | null>
  /**
   * Send one consumer-rights mail on a durable medium, in the language the consumer was shown, and
   * record the outcome as a `mail` event (step = the mail kind): sent, skipped (a reserved domain
   * such as `.test` / `.example` / `.invalid` / `.localhost`, or a renderer that suppressed it) or
   * failed (a transport error, no mailer registered — retried by `reconcile`). The application's
   * renderer (`useMailRenderer`) may replace the message. Each archive (`bcc`) address gets its own
   * copy. Never throws.
   *
   * @returns whether the consumer's own copy was handed to the mailer
   */
  sendConsumerMail: (policy: ConsumerRightsPolicy, kind: ConsumerMailKind, recordId: string) => Promise<boolean>
}
