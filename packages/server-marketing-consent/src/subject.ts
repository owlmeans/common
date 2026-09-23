import { AuthForbidden } from '@owlmeans/auth'
import type { AbstractRequest } from '@owlmeans/entrypoint'

/** Who a consent decision or a terms acceptance is recorded for. */
export interface MarketingConsentSubject {
  userId: string
  profileId?: string
  entityId?: string
}

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
export const subjectOf = (req: AbstractRequest): MarketingConsentSubject => {
  const userId = req.auth?.userId
  if (userId == null || userId === '') {
    throw new AuthForbidden('marketing-consent: no authenticated user')
  }

  return { userId, profileId: req.auth?.profileId, entityId: req.entity?.id }
}

/** One string key per subject — the state record's own `id`. */
export const subjectKey = (subject: MarketingConsentSubject): string =>
  `${subject.entityId ?? ''}|${subject.userId}|${subject.profileId ?? ''}`
