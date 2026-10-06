import { AuthForbidden } from '@owlmeans/auth'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { MarketingConsentSubject } from './types.js'
import type { MarketingConsentSubjectHelper } from './subject/types.js'

export const createMarketingConsentSubjectHelper = (): MarketingConsentSubjectHelper => {
  const subjectOf = (req: AbstractRequest): MarketingConsentSubject => {
    const userId = req.auth?.userId
    if (userId == null || userId === '') {
      throw new AuthForbidden('marketing-consent: no authenticated user')
    }

    return { userId, profileId: req.auth?.profileId, entityId: req.entity?.id }
  }

  const subjectKey = (subject: MarketingConsentSubject): string =>
    `${subject.entityId ?? ''}|${subject.userId}|${subject.profileId ?? ''}`

  return { subjectOf, subjectKey }
}

export const marketingConsentSubjectHelper = createMarketingConsentSubjectHelper()
