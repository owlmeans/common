import type { ConsentKind } from '@owlmeans/payment'
import type { ConsentDeclined } from '../errors.js'

/** Which express request a failure asks for, read through whatever wraps it. */
export interface ConsentRefusalHelper {
  /**
   * Which express request a failure asks for: `performance` (spend consent), `subscription-start`,
   * `unknown` for a bare HTTP 428 that names neither (a production body carries only an incident
   * id), or `null` for anything else.
   *
   * Read on the error itself and on whatever it wraps (`cause`, `error`, `original`, `inner`, an
   * aggregate's `errors`), and on text as well as objects, because a refusal travels in three shapes:
   * the class (a development body, rebuilt by the registry); its marker inside another error's
   * message or a stored string (a planning commit that failed on the refusal answers
   * `planning:commit-failed:<transition>:<the refusal's text>`); and the bare status of a production
   * body (`@owlmeans/api`'s `ApiStatusError`, `api:client:status:428[:<incident>]`).
   */
  consentRefusalKindOf: (error: unknown) => ConsentKind | 'unknown' | null
  /**
   * Whether a failure is a consent refusal — the class or its marker (`consentRefusalOf`), or an
   * HTTP 428 (`httpStatusOf`), on the error or anything it wraps. What decides that the consent
   * dialog opens and the action is retried once.
   */
  isConsentRefusal: (error: unknown) => boolean
  /** A refusal the performance-consent dialog answers: the spend consent, or a bare 428. */
  isPerformanceConsentRefusal: (error: unknown) => boolean
  /** The person declined the express request (`ConsentDeclined`). */
  isConsentDeclined: (error: unknown) => error is ConsentDeclined
}
