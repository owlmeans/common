import type { LoginStep } from '@owlmeans/client-auth/login'
import { EMAIL_OFFER_LOGIN_STEP, EMAIL_OFFER_STEP_PRIORITY } from './consts.js'
import { emailStorageHelper } from './storage.js'
import type { EmailStorageHelper } from './storage/types.js'
import type { EmailLoginClientService } from './types.js'
import { signedInAccount } from './utils/account.js'

/**
 * The post-sign-in "set a password" step.
 *
 * Pending only while BOTH hold: this tab keeps an offer ticket from a fresh PIN sign-in (unexpired,
 * this account's), and the account's password status still says enabled, unset and not declined.
 * A ticket the status no longer allows is forgotten on the spot. Optional: a status read that throws
 * or hangs is "not pending" (the login host fails open), so a broken read never blocks a sign-in.
 *
 * Its priority sits below the marketing-consent step, so a Terms confirmation and the consent
 * choices come first.
 */
export const emailOfferStep = (
  client: Pick<EmailLoginClientService, 'passwordStatus'>, entrypointAlias: string,
  storage: EmailStorageHelper = emailStorageHelper,
): LoginStep => ({
  alias: EMAIL_OFFER_LOGIN_STEP,
  priority: EMAIL_OFFER_STEP_PRIORITY,
  entrypoint: entrypointAlias,
  pending: async ctx => {
    if (storage.offer(signedInAccount(ctx)) == null) {
      return false
    }
    const status = await client.passwordStatus()
    if (status.enabled && !status.set && !status.declined) {
      return true
    }
    storage.dropOffer()

    return false
  },
})
