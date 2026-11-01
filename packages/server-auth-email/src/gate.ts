import { createLazyService } from '@owlmeans/context'
import type { GateService } from '@owlmeans/entrypoint'
import { EMAIL_AUTH_TECH_GATE } from '@owlmeans/auth-email'
import { createEmailTechPolicy } from './tech.js'
import type { EmailTechOptions } from './types.js'

/**
 * The gate over the developer (tech) routes (`EMAIL_AUTH_TECH_GATE`, the default `techGate` of
 * `makeEmailAuthProtocols`): off → `EmailTechDisabled` (404), a signer outside `tech.signers` →
 * `AuthForbidden` (403). The route's `GUARD_ED25519` has already proven the signature.
 */
export const makeEmailTechGate = (tech?: EmailTechOptions, alias: string = EMAIL_AUTH_TECH_GATE): GateService => {
  const policy = createEmailTechPolicy(tech)

  return createLazyService<GateService>(alias, {
    assert: async req => { policy.assert(req) },
  })
}
