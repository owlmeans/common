export interface SdkContextOptions {
  apiUrl: string
  /**
   * A fixed token, or a thunk resolved on every request. The thunk form is what lets a
   * credential holder (`@owlmeans/cli-auth`) hand the carrier guard something that changes
   * across the process's lifetime — empty before a sign-in completes, a real token after — with
   * no reconfiguration in between.
   */
  token: string | (() => string | Promise<string>)
  /** The service alias the API is registered under. One deployment, one alias. */
  service?: string
  /** Called when the platform rejects a request that presented this token — a credential holder
   * wires this to forgetting a dead token (and signing in again) or reporting the problem. */
  onRejected?: () => void | Promise<void>
}
