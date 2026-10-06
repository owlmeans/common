import type { LoginMethod, LoginOutcome, ResolvedTermsDocument } from '@owlmeans/client-auth/login'
import type { BrandSettings, LoginScreenConfig, LoginTermsConfig } from '@owlmeans/config'

export interface UseLoginMethodsOptions {
  /** Overrides the configuration the context carries. */
  config?: LoginScreenConfig
  terms?: LoginTermsConfig | false
  /** Replace or reorder what the resolver produced. */
  methods?: LoginMethod[] | ((methods: LoginMethod[]) => LoginMethod[])
}

export interface LoginTermsModel {
  required: boolean
  accepted: boolean
  /**
   * A registered, bound `LoginStep` confirms the terms instead of this screen — see
   * `termsDeferred` (`@owlmeans/client-auth/login`). While true, `required` and `accepted` still
   * carry their ordinary values (for a renderer that wants them), but nothing is EVER blocked on
   * them here, and a renderer should show the privacy notice only, no checkbox.
   */
  deferred: boolean
  /** A blocked selection was attempted — render the explanation. */
  attempted: boolean
  /** What the checkbox agrees to — terms, then billing/product when configured, then custom. */
  documents: ResolvedTermsDocument[]
  /** What is merely disclosed, never consented to — privacy, plus cookies per its own rule. */
  notices: ResolvedTermsDocument[]
  /** The latest revision date among `documents`, only when the configuration asked to show it. */
  revisedAt?: string
  /** The digest acceptance is recorded against — changes whenever a document does. */
  version: string
  accept: (value: boolean) => void
}

export interface LoginCreditModel {
  poweredBy: boolean
  line: string | null
}

/** Where the provider disclosure sits: a strip above the card, or a line inside it. */
export type LoginProviderPlacement = 'top' | 'inline'

/**
 * Who actually signs a person in, when that is not the application on whose screen they are.
 *
 * Read from `cfg.security.auth.login.provider` (declared onto `LoginScreenConfig` by
 * `./provider-config.ts`). Blank strings are unset, exactly as they are for the credit line: this
 * config is filled from build-time environment variables, and an undelivered one arrives as `''`.
 */
export interface LoginProviderConfig {
  /** The sign-in service as a person reads it — "OwlMeans IAM". */
  name: string
  /** Who runs it. Defaults to `name`. */
  operator?: string
  /** "More information" — an absolute http(s) URL or a root-relative path; anything else is dropped. */
  info?: string
  /** Default `'inline'`. */
  placement?: LoginProviderPlacement
}

export interface LoginProviderModel {
  name: string
  operator: string
  /** The application the person is signing in to — `cfg.brand.name`. */
  product: string
  info: string | null
  placement: LoginProviderPlacement
}

export interface LoginProviderHelper {
  /**
   * The disclosure a sign-in screen renders, or `null` when there is nothing to disclose.
   *
   * Null unless both the provider's `name` and the product (`brand.name`) are set — a sentence
   * relating two parties cannot be written with one of them missing, and a screen that showed half
   * of it would be worse than one that shows none.
   */
  resolve: (cfg?: LoginProviderConfig, brand?: BrandSettings) => LoginProviderModel | null
  /**
   * Put the names into a sentence AFTER it was translated.
   *
   * `{{provider}}`, `{{operator}}` and `{{product}}`, replaced in one pass — a name that itself
   * contains a placeholder is never expanded a second time. The names never travel as i18next
   * interpolation parameters, so no translation backend gets the chance to escape or format them.
   */
  fill: (template: string, model: LoginProviderModel) => string
}

export interface LoginMethodsModel {
  methods: LoginMethod[]
  /** The one a screen highlights and focuses. It is never started automatically. */
  primary: LoginMethod | null
  terms: LoginTermsModel
  credit: LoginCreditModel
  /** Who signs the person in, on behalf of which product — `null` when the app configured nobody. */
  provider: LoginProviderModel | null
  /** True while the terms have not been confirmed and confirming them is required. */
  blocked: boolean
  /** Id of the method currently starting. */
  busy: string | null
  outcome: LoginOutcome | null
  error: string | null
  /**
   * Start a method.
   *
   * NOT async, and it awaits nothing before delegating — the flow may need to open a window, and a
   * window opened after the click has finished being handled is eaten by the popup blocker.
   */
  select: (method: LoginMethod) => void
}
