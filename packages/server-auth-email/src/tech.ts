import { AuthForbidden, AuthRole } from '@owlmeans/auth'
import { EmailTechDisabled } from '@owlmeans/auth-email'
import { logger, logThrottle } from '@owlmeans/log'
import type { EmailTechOptions } from './types.js'
import type { EmailTechPolicy } from './tech/types.js'

const log = logger('server-auth-email')

export const createEmailTechPolicy = (tech?: EmailTechOptions): EmailTechPolicy => {
  const signers = new Set(tech?.signers ?? [])

  const enabled: EmailTechPolicy['enabled'] = () => {
    const flag = tech?.enabled

    return typeof flag === 'function' ? flag() === true : flag === true
  }

  const assert: EmailTechPolicy['assert'] = req => {
    if (!enabled()) {
      throw new EmailTechDisabled()
    }
    // `GUARD_ED25519` answers the trusted record's NAME as the only scope, with the Service role.
    const signer = req.auth?.role === AuthRole.Service ? req.auth.scopes?.[0] : undefined
    if (signer == null || !signers.has(signer)) {
      if (logThrottle(`auth-email:tech-refused:${req.auth?.userId ?? ''}`, 60_000)) {
        log.warn('E-mail developer route refused', {
          reason: 'signer', userId: req.auth?.userId,
        }, { event: 'access.forbidden' })
      }
      throw new AuthForbidden('auth-email:tech')
    }
  }

  return { enabled, assert }
}
