import type { ComponentType } from 'react'
import type { LazyService } from '@owlmeans/context'
import type { ClientConfig, ClientContext } from '@owlmeans/client-context'
import type { AuthMethodMeta } from '@owlmeans/client-auth/manager/plugins'
import type { LoginScreenProps } from '@owlmeans/client-auth/login'
import type {
  EmailAuthEntrypoints, EmailAuthOptionsView, EmailChallengeView, EmailPasswordPinRequest,
  EmailPasswordRemoveRequest, EmailPasswordSetRequest, EmailPasswordStatusView, EmailPinRequest,
  EmailSignInRequest, EmailSignInView,
} from '@owlmeans/auth-email'

/**
 * `(key, defaultValue) => string` — this package's own translator, or an application's.
 *
 * Keys are this package's (`login.title`, `error.code`, …, resource `auth-email`); the default is
 * the English text. Placeholders such as `{{email}}` are filled by the component, so a translator
 * returns the sentence as it is.
 */
export interface Translate { (key: string, defaultValue: string): string }

/**
 * How an application dresses the e-mail sign-in card — the same props the chooser card
 * (`@owlmeans/web-panel`'s `LoginScreen`) takes for the same purpose.
 */
export interface EmailLoginScreenSetup extends Pick<
  LoginScreenProps,
  'Logo' | 'title' | 'subtitle' | 'footer' | 'className' | 'containerClassName' | 'style' | 'locale' | 'translate'
> {}

export interface EmailLoginScreenProps extends EmailLoginScreenSetup {}

export type EmailLoginScreenComponent = ComponentType<EmailLoginScreenProps>

export interface EmailLoginAppendOptions {
  /**
   * From `makeEmailAuthProtocols(...)` — the tree the application also binds with `bindAll` (the
   * API routes) and `emailAuthEntrypoints` (the offer screen).
   */
  protocols: EmailAuthEntrypoints
  /** Logo, copy and classes of the e-mail card; merged under the props a host passes itself. */
  screen?: EmailLoginScreenSetup
  /**
   * How the method presents itself on the chooser, merged over `EMAIL_LOGIN_METHOD_META`.
   * `available` is always this package's own (the client service is registered).
   */
  method?: Partial<AuthMethodMeta>
  /** Register the post-sign-in "set a password" step. Default `true`. */
  offer?: boolean
}

export type EmailLoginClientContext = ClientContext<ClientConfig>

/**
 * The browser side of e-mail sign-in, registered as `EMAIL_LOGIN_SERVICE` by `appendEmailLogin`.
 *
 * A thin transport over the protocol tree: every call rejects with the error its route answered,
 * and the caller phrases it (`emailRefusalHelper`). Nothing here swallows a failure.
 */
export interface EmailLoginClientService extends LazyService {
  /** The protocol tree the service calls. */
  protocols: () => EmailAuthEntrypoints
  /** `GET options`, cached after the first success; `fresh` asks again. */
  options: (opts?: { fresh?: boolean }) => Promise<EmailAuthOptionsView>
  /** `POST pin` — mail a sign-in PIN. */
  sendPin: (request: EmailPinRequest) => Promise<EmailChallengeView>
  /** `POST sign-in` — PIN mode or password mode. */
  signIn: (request: EmailSignInRequest) => Promise<EmailSignInView>
  /**
   * Finish a signed-in answer the way every self-contained plugin does: adopt the token through the
   * client auth service, keep the offer ticket (when one came) for the offer step, then land with
   * `loginLandingOf(ctx).landAfterLogin()` — a pending step, a parked target, else home; inside a
   * surrogate window the dispatcher, which hands the session to the opener.
   *
   * @throws when the answer carries no token, or the token is refused.
   */
  complete: (view: EmailSignInView) => Promise<void>
  /** `GET password` — the signed-in account's password state. */
  passwordStatus: () => Promise<EmailPasswordStatusView>
  /** `POST password/pin` — mail a confirmation PIN to the account's own address. */
  passwordPin: (request: EmailPasswordPinRequest) => Promise<EmailChallengeView>
  /** `POST password/set`. */
  setPassword: (request: EmailPasswordSetRequest) => Promise<EmailPasswordStatusView>
  /** `POST password/remove`. */
  removePassword: (request: EmailPasswordRemoveRequest) => Promise<EmailPasswordStatusView>
  /** `POST password/decline` — "Not now" on the offer. */
  declinePassword: () => Promise<EmailPasswordStatusView>
  /** The screen the e-mail route renders; null = the package's own. */
  screen: () => EmailLoginScreenComponent | null
  /** Replace the screen the e-mail route renders (`registerEmailLoginScreen`). */
  registerScreen: (screen: EmailLoginScreenComponent) => void
}

export interface MakeEmailLoginClientOptions {
  alias?: string
  /** The screen the e-mail route renders until another is registered. */
  screen?: EmailLoginScreenComponent
}

/**
 * The entrypoint aliases `usePassword` addresses.
 *
 * By default those of the tree given to `appendEmailLogin`, else the `EMAIL_AUTH_PASSWORD_*` aliases
 * `makeEmailAuthProtocols` declares — an application that mounted the password routes under its own
 * aliases (a facade in front of them, say) passes its own here.
 */
export interface EmailPasswordAliases {
  status: string
  pin: string
  set: string
  remove: string
  /** The new-device PIN switch; default the tree's `password.devicePin` (`EMAIL_AUTH_PASSWORD_DEVICE_PIN`). */
  devicePin?: string
}
