import { useCallback } from 'react'
import type { MouseEvent } from 'react'
import { useContext, useNavigate } from '@owlmeans/client'
import type { ClientContext } from '@owlmeans/client-context'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import { DISPATCHER } from '@owlmeans/auth'
import type { LoginContext, LoginService } from './types.js'
import { LoginIntent } from './types.js'
import { LOGIN_SERVICE } from './consts.js'
import { surrogatePath } from './surrogate.js'

/**
 * Wiring for a "Log in" control: where it points, and what it does when clicked.
 *
 * The caller renders one control and attaches one handler — which browsing context the flow can
 * actually complete in is the login service's problem, not the app's. An ordinary tab redirects;
 * an app embedded in a frame runs the flow one window up, because the provider refuses to be
 * framed and its cookies are third-party there.
 *
 * The returned handler is deliberately NOT async and awaits nothing before delegating: a window
 * opened after the user gesture has finished being handled is eaten by the popup blocker.
 *
 * The dispatcher entrypoint is resolved INSIDE the hook, never at module scope. Module bodies run
 * while the app is still being imported, before `registerEntrypoints` has put anything on the
 * context, and a top-level lookup throws `Entrypoint dispatcher not found` — which escapes during
 * import, takes the whole render down, and paints an empty page with no component at fault.
 */
export const useLogin = (target?: string): readonly [string, (event?: MouseEvent) => void] => {
  const context = useContext() as unknown as ClientContext
  const nav = useNavigate()
  const dispatcher = context.entrypoint<ClientEntrypoint>(DISPATCHER)
  const path = dispatcher.getPath()

  const onLogin = useCallback((event?: MouseEvent) => {
    event?.preventDefault()
    const login = context.service<LoginService>(LOGIN_SERVICE)
    void login.begin({
      url: path,
      target,
      // Only a component may call `useNavigate`, so the in-app continuation is handed to the
      // plugin rather than reinvented by it.
      navigate: () => { nav.go(target ?? DISPATCHER) },
    })
  }, [context, path, target])

  return [path, onLogin] as const
}

/**
 * Wiring for a "Log out" control.
 *
 * One control, one handler, no decision — the mirror of {@link useLogin}. Where the session has to
 * be ended (here, or one window up in a surrogate whose storage partition this document cannot
 * reach) is the login plugin's call.
 *
 * NOT async, and nothing is awaited before delegating: logging out of a framed application opens a
 * window, and a window opened after the gesture has finished being handled is eaten by the popup
 * blocker. The surrogate entrypoint is resolved INSIDE the hook for the same reason `useLogin`
 * resolves the dispatcher there.
 *
 * The return shape stays a bare handler rather than `useLogin`'s tuple: a logout control has no
 * address to point at, and every generated application carries a copy of a component that writes
 * `const onLogOut = useLogout()`. `(event?: MouseEvent) => void` is assignable to `() => void`, so
 * `onClick={onLogOut}` keeps compiling everywhere.
 */
export const useLogout = (target?: string): ((event?: MouseEvent) => void) => {
  const context = useContext() as unknown as ClientContext
  const nav = useNavigate()
  const path = surrogatePath(context as unknown as LoginContext, { intent: LoginIntent.Logout })

  return useCallback((event?: MouseEvent) => {
    event?.preventDefault()
    const login = context.service<LoginService>(LOGIN_SERVICE)
    void login.logout({
      // An application whose entrypoint list predates the surrogate route logs out in place.
      url: path ?? '',
      ...(target != null ? { navigate: () => { nav.go(target) } } : {}),
    })
  }, [context, path, target])
}
