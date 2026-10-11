import type { ConnectLlm } from '@owlmeans/viable-common'

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
  /** The planning client's HTTP deadline. `TOOL_DEADLINE_MS` when absent. */
  timeout?: number
  /**
   * Who performs the platform's model calls for this connector. `ConnectLlm.Local` (the delegated
   * mode) names every write with `x-viable-call` and collects an early `{ pending }` answer through
   * `connect.call.collect`, so a write that waits on its own parent's model call is never bounded by
   * one HTTP request. Absent or `cloud`, calls go out untouched.
   */
  llm?: ConnectLlm
  /** Called when the platform rejects a request that presented this token — a credential holder
   * wires this to forgetting a dead token (and signing in again) or reporting the problem. */
  onRejected?: () => void | Promise<void>
}
