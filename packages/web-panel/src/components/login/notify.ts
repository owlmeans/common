import { LIB_NAMESPACE, i18nHelper } from '@owlmeans/i18n'
import { i18nInstanceHelper } from '@owlmeans/client-i18n/utils'
import type { ClientConfig } from '@owlmeans/client-context'
import { toast } from 'sonner'
import { LoginOutcome, type LoginNotifier } from '@owlmeans/client-auth/login'
import { AUTH_RESOURCE, POPUP_BLOCKED_FALLBACK } from './consts.local.js'

/**
 * Translate an `auth`-library key with no mounted component to read it through.
 *
 * The toast this feeds fires from `registerNotifier`, which is not a render — there is no
 * `useI18nLib('auth')` around to have already pulled the bundle into this app's i18next instance.
 * `initI18nResource` is the same one-shot loader that hook calls internally: whichever of the two
 * runs first merges the bundle into the SAME instance `getI18nInstance` returns (one per app,
 * memoized), and the other later gets `null` back and no-ops with the bundle already there.
 */
const translateAuth = (cfg: ClientConfig, key: string, fallback: string): string => {
  const i18n = i18nInstanceHelper.getI18nInstance(cfg)
  const resources = i18nHelper.initI18nResource(i18n.language, AUTH_RESOURCE, LIB_NAMESPACE)
  resources?.forEach(
    resource => i18n.addResourceBundle(
      i18n.language, LIB_NAMESPACE, { [AUTH_RESOURCE]: resource.data }, true, true
    )
  )

  return i18n.t(`${AUTH_RESOURCE}.${key}`, { ns: LIB_NAMESPACE, defaultValue: fallback })
}

/**
 * Tell the user a login/logout attempt was silently blocked, when nothing else on screen will.
 *
 * The sign-in SCREEN already renders `loginAttemptError` inline (`LoginScreen`'s `attemptError`),
 * but a header "Log in"/"Log out" control has no screen at all — `useLogin`/`useLogout` fire the
 * facade and forget the result. This is the one place that outcome reaches a person for that
 * control, and it is registered on the login service itself (see `appendLoginScreen`) so an
 * application gets it merely by calling the function it already calls, not by writing new code.
 *
 * Reacts to `Blocked` only: every other outcome either did something (`Handled`, `Redirected`),
 * is reported elsewhere (`Orphaned`, inside the surrogate window), or has nowhere useful to point a
 * toast at (`Gesture`, `Failed`, `Passed`) — a toast that fires on every click would train a user to
 * dismiss it rather than read it.
 */
export const notifyPopupBlocked = (cfg: ClientConfig): LoginNotifier => outcome => {
  if (outcome !== LoginOutcome.Blocked) {
    return
  }
  toast.warning(translateAuth(cfg, 'login.error.blocked', POPUP_BLOCKED_FALLBACK))
}
