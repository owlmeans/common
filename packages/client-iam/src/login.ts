/**
 * IAM sign-in is assembled from immutable declarations: decorate the app's protocol tree with
 * {@link withIamGuard}, then append the browser-local {@link iamEntrypoints} bindings.
 */
export { withOidcGuard as withIamGuard } from '@owlmeans/oidc'
export { oidcEntrypoints as iamEntrypoints } from '@owlmeans/web-oidc-rp'

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
