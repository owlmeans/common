import { createHash } from 'node:crypto'
import { base58 } from '@scure/base'
import type { ProviderProfileDetails } from '@owlmeans/oidc'
import type { IdentityCredentials } from './types.js'
import { EXTERNAL_KEY_DELIMITER, LOGIN_SERVICE_PREFIX, PROFILE_DIGEST_LENGTH } from './consts.js'
import type { IdentityKeyHelper } from './keys/types.js'

export const createIdentityKeyHelper = (): IdentityKeyHelper => {
  const profileIdOf = (service: string, accountId: string): string =>
    `${service}:${base58.encode(createHash('sha256').update(`${accountId}:${service}`).digest())
      .slice(0, PROFILE_DIGEST_LENGTH)}`

  const credentialKeyOf = (details: ProviderProfileDetails): Pick<IdentityCredentials, 'type' | 'userId' | 'credential'> => ({
    type: details.type,
    userId: [details.type, details.service, details.userId].join(EXTERNAL_KEY_DELIMITER),
    credential: [LOGIN_SERVICE_PREFIX, details.type, details.service].join(EXTERNAL_KEY_DELIMITER),
  })

  const normalizeEmail = (email: string): string => email.trim().toLowerCase()

  return { profileIdOf, credentialKeyOf, normalizeEmail }
}

export const identityKeyHelper = createIdentityKeyHelper()
