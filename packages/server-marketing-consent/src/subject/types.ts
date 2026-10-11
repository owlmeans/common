import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { MarketingConsentSubject } from '../types.js'

/** Who a marketing-consent decision belongs to, and the one key the state record is stored under. */
export interface MarketingConsentSubjectHelper {
  /**
   * Read the subject off an authenticated request.
   *
   * `entityId` is read ONLY from `req.entity?.id` — never `requireEntityKey`, never a slug. A
   * deployment with no organization concept at all (an end-user-facing generated target app, say)
   * registers no entity resolver, so `req.entity` stays `undefined` and `entityId` is simply absent
   * here — that is a valid, expected shape, not an error.
   *
   * @throws {AuthForbidden} when the request carries no authenticated user.
   */
  subjectOf: (req: AbstractRequest) => MarketingConsentSubject
  /** One string key per subject — the state record's own `id`. */
  subjectKey: (subject: MarketingConsentSubject) => string
}
