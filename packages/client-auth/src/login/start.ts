import { DISPATCHER } from '@owlmeans/auth'
import type { AuthService } from '@owlmeans/auth-common'
import { DEFAULT_ALIAS as AUTH_ALIAS } from '../consts.js'
import { LOGIN_SERVICE, LoginOutcome } from './consts.js'
import type { LoginContext, LoginService } from './types.js'
import { memoHelper } from '@owlmeans/context'
import type { LoginStartHelper } from './start/types.js'

export const makeLoginStartHelper = (ctx: LoginContext): LoginStartHelper => {
  /**
   * Whether this document already holds a session, answered WITHOUT awaiting anything.
   *
   * Read off the auth service's in-memory token, which every guard and `authenticated()` call fills.
   * A session not yet read from storage answers `false` and costs nothing: the sign-in it starts finds
   * the session at the dispatcher, which lands on the parked target all the same.
   */
  const holdsSession = (): boolean => {
    if (!ctx.hasService(AUTH_ALIAS)) {
      return false
    }
    const token = ctx.service<AuthService>(AUTH_ALIAS).token

    return token != null && token !== ''
  }

  const startLogin: LoginStartHelper['startLogin'] = start => {
    const { url, target, go } = start
    if (target != null && target !== '' && holdsSession()) {
      return Promise.resolve(go(target)).then(() => LoginOutcome.Handled)
    }

    return ctx.service<LoginService>(LOGIN_SERVICE).begin({
      url,
      target,
      // Only a component may call `useNavigate`, so the in-app continuation is handed to the
      // plugin rather than reinvented by it.
      navigate: () => { void go(DISPATCHER) },
    })
  }

  return { startLogin }
}

export const loginStartOf = memoHelper.oncePer(makeLoginStartHelper)
