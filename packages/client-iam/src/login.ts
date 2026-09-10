import type { CommonEntrypoint } from '@owlmeans/entrypoint'
import { setupOidcGuard } from '@owlmeans/web-oidc-rp'

/**
 * Wire this app's entrypoints for IAM sign-in.
 *
 * The companion to {@link appendIam}: that one prepares the context, this one prepares the
 * entrypoint list — it adds the authorization endpoints the browser calls and attaches the IAM
 * dispatcher screen, and it prepends the OIDC guard to every entrypoint that already asks for
 * authentication.
 *
 * Call it exactly ONCE per entrypoint list. It appends to the list it is given rather than
 * returning a new one, so a second call adds the same entrypoints twice and the elevation that
 * follows throws `Entrypoint with alias … is already elevated`.
 */
export const setupIam = (entrypoints: CommonEntrypoint[], coguards?: string | string[]): void => {
  setupOidcGuard(entrypoints, coguards)
}

/**
 * How a user signs in and out.
 *
 * Re-exported here so an app has one IAM import rather than three, and so the control it renders
 * carries no knowledge of the browsing context it happens to be in — whether the flow can redirect
 * from where it is, has to run one window up, or is already answered by a session this document
 * holds, is decided by the login plugin the framework selected. See the `login-plugins` guidance
 * for what that means and how to add a mechanic.
 */
export { useLogin, useLogout } from '@owlmeans/client-auth/login'
export { LoginOutcome, LoginIntent } from '@owlmeans/client-auth/login'
export type {
  LoginPlugin, LoginRequest, LogoutRequest, LoginService, LoginPrecondition,
  LoginMethod, LoginMethodSource, LoginScreenProps,
} from '@owlmeans/client-auth/login'
