import { CONSENT_ESSENTIAL, consentStore } from '@owlmeans/consent'
import { ensureLoginService } from '@owlmeans/client-auth/login'
import type { BasicContext } from '@owlmeans/context'

export const CONSENT_LOGIN_PRECONDITION = 'consent-before-login'

export interface ConsentLoginOptions {
  /** The category that must be granted. Defaults to `essential`. */
  category?: string
  /** Off switch, for an application that genuinely sets no cookie at all. */
  disabled?: boolean
}

/**
 * Refuse to start a sign-in flow until the required consent category is granted, and open the
 * consent dialog in the same gesture so the user can grant it.
 *
 * It sits on `LoginService.begin` rather than on `useLogin`, on a screen, or in a login plugin,
 * and each of those alternatives is wrong for its own reason:
 *
 * - `useLogin` is one of four call sites (a header control, a sign-in-required panel, the
 *   dispatcher, and the surrogate screen). Enforcing there means enforcing four times, and the
 *   fifth call site somebody adds is unguarded.
 * - a `LoginPlugin` is SELECTED, not chained — `plugin(env)` returns exactly one — so a "consent
 *   plugin" would displace the redirect or surrogate plugin rather than run before it, and the
 *   flow it was guarding would stop happening at all.
 * - `begin` is the single funnel every mechanic passes through, and it is the one place where the
 *   user's gesture is still live, which is what lets the dialog open without being blocked.
 *
 * The check is synchronous because `begin` is: crossing a microtask before a plugin's
 * `window.open` hands the window to the popup blocker.
 *
 * A refusal resolves `begin` as `LoginOutcome.Gesture`, which already means "cannot proceed
 * without a fresh user gesture — render a control". After accepting, the user presses Log in
 * again; that second press is deliberate, not an oversight, because the redirect or popup must
 * originate from a real gesture.
 */
export const requireConsentForLogin = (
  ctx: BasicContext<any>, opts?: ConsentLoginOptions
): void => {
  if (opts?.disabled === true) {
    return
  }
  const category = opts?.category ?? CONSENT_ESSENTIAL

  ensureLoginService(ctx).registerPrecondition({
    alias: CONSENT_LOGIN_PRECONDITION,
    // Above anything an application adds by default, so a user is never asked to satisfy some
    // other precondition before being told about the one that is actually blocking them.
    priority: 100,
    check: () => {
      if (consentStore.granted(category) && consentStore.get().record != null) {
        return true
      }
      consentStore.open('login')

      return false
    },
  })
}
