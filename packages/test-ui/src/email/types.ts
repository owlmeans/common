/**
 * What a Node-side test needs to drive e-mail sign-in without a mailbox: the developer (tech) routes
 * of `@owlmeans/auth-email`, signed as one of the deployment's trusted records.
 */
export interface EmailTechClientOptions {
  /**
   * The API base the e-mail routes hang under — for an app whose API lives at `<web>/api`, that
   * address (`https://app.example/api`); the routes are `<apiUrl><path>/tech/*`.
   */
  apiUrl: string
  /**
   * The private key of a trusted record the deployment allows to sign tech calls (its `tech.signers`
   * names the record), e.g. `ed25519:<base64>` from `.env.dev.secrets`.
   */
  privateKey: string
  /**
   * The trusted record's id (its DID). By default the key's own address — `ed25519:<address>`, what
   * `makeKeyPairModel(privateKey).exportAddress()` gives and what OwlMeans deployments use as the
   * record id (viable's `shared-key` record reads it from `/etc/app-config/shared-did`). Pass it only
   * for a record whose id is not its key's address.
   */
  credentialId?: string
  /** The e-mail routes' base path; default `EMAIL_AUTH_API_PATH` (`/auth/email`). */
  path?: string
  fetchImpl?: typeof fetch
}

/** The two developer calls: a captcha/throttle waiver, and rewriting a mailed PIN. */
export interface EmailTechClient {
  /**
   * A fresh signed waiver (`POST tech/waiver`). Sent in `EMAIL_WAIVER_HEADER` on the e-mail routes,
   * it skips the captcha and the send/password throttles — never the PIN's attempt limit — for about
   * two hours, on a deployment whose tech routes are on.
   */
  waiver: () => Promise<string>
  /**
   * Replace the PIN of a pending challenge (`POST tech/pin`) — the `challenge` a send-PIN, a
   * device-PIN sign-in or a confirmation answered. Resolves the PIN now valid for it: `pin` when
   * given (6 digits), else 6 random digits.
   *
   * @throws when the server refuses, or answers that nothing was rewritten (the challenge expired,
   * was spent, or names another address).
   */
  rewritePin: (challenge: string, pin?: string) => Promise<string>
}
