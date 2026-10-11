import type {
  ConnectAccessTokenList, ConnectPrivacyChoices, ConnectProfileSettingsView, ConnectProjectSettings,
} from '@owlmeans/viable-common'

/** The person's own records as a parent reads them — who performs the model calls, the access tokens, the consents. */
export interface AccountHelper {
  /**
   * The person's inference preference and, when a project is named, its override and what it
   * resolves to — always ending in what the setting does NOT reach: a stdio connector already
   * running keeps the mode it was started with.
   */
  renderInference: (account: ConnectProfileSettingsView, project?: { id: string, settings: ConnectProjectSettings }) => string
  /** The person's tokens, newest first: name, the display prefix, when used, and whether revoked. */
  renderTokens: (list: ConnectAccessTokenList) => string
  /** The person's marketing consents with their SAVED answers, ending in how to withdraw one. */
  renderPrivacy: (choices: ConnectPrivacyChoices) => string
  /**
   * The intent reference a tool was given: a bare code, or the `ref` of a `/start?ref=…` address
   * pasted whole. `null` when it is neither — the platform's schema decides whether the code is
   * well formed.
   */
  intentRefOf: (code: unknown) => string | null
}
