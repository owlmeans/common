import type { CancellationStatus, WithdrawalStatus } from '@owlmeans/payment'
import type { ConsumerConsentRecord, ConsumerDeclarationRecord, PurchaseRecord } from '../../types.js'
import type { WithdrawalComputation, WithdrawalExecution } from '../types.js'

/** The consumer-rights observers of a context, told after the records and the paygate steps of an act. */
export interface ConsumerObserversHelper {
  /** Run the consumer-rights observers of one act; a throw is recorded for `reconcile` to retry. */
  runConsumerObservers: (
    family: 'consent' | 'withdrawal' | 'cancellation', recordId: string, entityId: string | undefined,
    run: () => Promise<void>,
  ) => Promise<boolean>
  /** Tell the withdrawal observers — after the records and the paygate steps. */
  notifyWithdrawal: (
    declaration: ConsumerDeclarationRecord, purchase: PurchaseRecord, status: WithdrawalStatus,
    computation: Pick<WithdrawalComputation, 'reading' | 'deducted' | 'unitsReturned' | 'netMinor' | 'refundMinor'> | null,
    execution: WithdrawalExecution | null,
  ) => Promise<boolean>
  /** Tell the cancellation observers. */
  notifyCancellation: (declaration: ConsumerDeclarationRecord, status: CancellationStatus) => Promise<boolean>
  /** Tell the consent observers. */
  notifyConsent: (consent: ConsumerConsentRecord) => Promise<boolean>
}
