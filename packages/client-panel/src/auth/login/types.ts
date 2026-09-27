import type { LoginMethod, LoginOutcome, ResolvedTermsDocument } from '@owlmeans/client-auth/login'
import type { LoginScreenConfig, LoginTermsConfig } from '@owlmeans/config'

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

export interface LoginMethodsModel {
  methods: LoginMethod[]
  /** The one a screen highlights and focuses. It is never started automatically. */
  primary: LoginMethod | null
  terms: LoginTermsModel
  credit: LoginCreditModel
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
