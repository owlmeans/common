export interface CliCredentialsOptions {
  /** The API origin this credential set is for, and the OAuth `resource` it is scoped to unless
   * `resource` says otherwise. */
  apiUrl: string
  /** This CLI's OAuth `client_id` — a static one the authorization server declared, or an https
   * Client ID Metadata Document URL. */
  clientId: string
  deviceName?: string
  resource?: string
  scope?: string
  /** Which key in `~/.owlmeans` (and the environment) carries the token. */
  tokenEnvKey: string
  /** Which key records the URL a stored token belongs to. A file naming no URL at all is treated
   * as belonging to whichever `apiUrl` is asked for — only an explicit MISMATCH refuses it. */
  apiUrlEnvKey: string
  env?: NodeJS.ProcessEnv
  /** Best-effort progress — "open this URL and enter this code", "signed in", a failure. A host
   * wires this to stderr, an MCP `notifications/message`, or nothing at all. */
  onNotify?: (message: string) => void
}

export interface CliCredentials {
  /** The token this call site should use right now: the environment, then the bound file value,
   * or `null` when neither has one. */
  token: () => Promise<string | null>
  /** Ensure a usable token exists. Starts or joins a device sign-in when there is none, waits up
   * to `waitMs` for it to be approved, and returns the token. The sign-in keeps running in the
   * background past that wait — a later `require()` call picks up wherever it left off, rather
   * than starting over. */
  require: (waitMs?: number) => Promise<string>
  /** A 401 happened while presenting `rejectedToken`. A token that came from the FILE is forgotten
   * so the next `require()` signs in again; a token that came from the ENVIRONMENT is reported —
   * silently trying another identity behind an operator's back is worse than failing loudly. */
  invalidate: (rejectedToken: string) => Promise<void>
  /** Revoke the current token at the server and remove it from the file. */
  signOut: () => Promise<void>
}

/**
 * What one process tells every other one about the sign-in it is driving — the browser URL and
 * code so a SECOND process can show the same "waiting on…" state instead of opening a second
 * browser tab for the same API URL.
 */
export interface SignInLockInfo {
  pid: number
  apiUrl: string
  verificationUri: string
  verificationUriComplete?: string
  userCode?: string
  /** The device flow's own secret — protected the same way the eventual access token is (mode
   * `0600`, same directory as the credentials file), so a joining process can poll the SAME
   * pending authorization instead of requesting a second one nobody will ever display. */
  deviceCode: string
  interval: number
  expiresAt: number
  /** Proves ownership at release time — a process only clears the lock it itself wrote. */
  nonce: string
}
