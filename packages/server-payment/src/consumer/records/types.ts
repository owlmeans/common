import type { BillingProfileView, ConsumerRightsPolicy } from '@owlmeans/payment'
import type {
  BillingProfileRecord, ConsumerEventRecord, PaymentSubscriptionRecord, PurchaseRecord, UnlockOptions,
} from '../../types.js'
import type { LockInput, LockResult, PurchaseDraft } from '../types.js'

/** One audit step as it is appended — `at` defaults to now. */
export interface ConsumerEventDraft extends Omit<ConsumerEventRecord, 'at' | 'id'> { at?: Date }

/** The consumer-rights records of a context: purchases, billing profiles and the audit trail. */
export interface ConsumerRecords {
  /** The purchase id of a paygate checkout session or subscription: `stripe:<id>`. */
  purchaseIdOf: (externalId: string) => string
  /** A locked profile as the wire sees it. */
  profileViewOf: (record: BillingProfileRecord, policy: ConsumerRightsPolicy | null) => BillingProfileView
  /** No profile yet: nothing locked, the default legal language, an unknown buyer (protected by default). */
  unlockedProfileView: (policy: ConsumerRightsPolicy | null) => BillingProfileView
  /**
   * Append one audit step. A failure to write it is logged and never fails the act it describes —
   * the act's own record (consent, declaration, purchase) is already written.
   */
  recordEvent: (event: ConsumerEventDraft) => Promise<void>
  /** Whether a step already succeeded (or a mail was deliberately skipped) for a record. */
  hasEvent: (recordId: string, action: ConsumerEventRecord['action'], step?: string, ok?: boolean) => Promise<boolean>
  /** The entity's highest-ranked entitling Stripe subscription, or `null`. */
  entitlingStripeSubscription: (entityId: string) => Promise<PaymentSubscriptionRecord | null>
  /** Whether the entity ever paid through the paygate (a fulfilled checkout or a propagated subscription). */
  hasPaid: (entityId: string) => Promise<boolean>
  /**
   * Fix an entity's billing country — the FIRST write wins (a unique index on `entityId` settles a
   * race). A later, different country is only a `lock-mismatch` event; only a `manual` lock with
   * `force` replaces the country, audited as `relock`. The charge currency is fixed with it: the
   * currency of an entitling paygate subscription when one exists (a customer's subscriptions share
   * one currency), else the region's (`policy.currencies`), else the given one.
   */
  lockProfile: (policy: ConsumerRightsPolicy | null, input: LockInput) => Promise<LockResult>
  /**
   * An operator removes an entity's lock: the profile row is deleted (only while it still holds the
   * country read — a concurrent relock survives) and an `unlock` event keeps the whole row, `by` and
   * `reason`. `null` when nothing was locked.
   */
  unlockProfile: (entityId: string, opts?: UnlockOptions) => Promise<BillingProfileRecord | null>
  /**
   * Whether an operator unlocked the entity — then no lock is taken from its paygate customer's saved
   * address (at checkout or in reconcile): its next completed purchase locks it.
   */
  wasUnlocked: (entityId: string) => Promise<boolean>
  /** The open, unconsented top-up windows of an entity — what a performance consent covers. */
  unconsentedWindows: (entityId: string, at?: Date) => Promise<PurchaseRecord[]>
  /**
   * Write a purchase once: an existing row for the same purchase (or the same checkout session) is
   * returned as it is. A contract-reference collision retries with a fresh reference.
   */
  createPurchase: (draft: PurchaseDraft) => Promise<{ record: PurchaseRecord, created: boolean }>
  /** Set fields on a purchase without replacing it (a concurrent conditional write survives). */
  patchPurchase: (purchaseId: string, fields: Partial<PurchaseRecord>) => Promise<void>
  /** The e-mail a consumer-rights mail reaches the organization at when no person named one. */
  contactEmailOf: (entityId: string) => Promise<string | undefined>
  /**
   * Whether an e-mail address belongs to a purchase: its checkout e-mail, the organization's
   * profile e-mail or its paygate customer's — compared case-insensitively.
   */
  emailMatches: (purchase: PurchaseRecord, email: string) => Promise<boolean>
}
