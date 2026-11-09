import { handler } from '@owlmeans/client'
import { bindScreen } from '@owlmeans/client-entrypoint'
import type { EmailAuthEntrypoints } from '@owlmeans/auth-email'
import { PasswordOfferScreen } from './components/offer.js'

/**
 * The offer screen, bound and ready to spread into an application's entrypoint list.
 *
 * The API routes are NOT bound here: they are ordinary backend routes the application binds with
 * its own `bindAll(protocols)`, beside the server's `serveEmailAuthEntrypoints` — the same split as
 * `marketingConsentEntrypoints`.
 */
export const emailAuthEntrypoints = (protocols: EmailAuthEntrypoints) => [
  bindScreen(protocols.offer, handler(PasswordOfferScreen)),
]
