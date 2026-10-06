

/**
 * What the platform injects when it mounts the connector routes.
 *
 * The names of the guard and the gates belong to the deployment, not to the contract: a connector
 * API on another platform would guard the same paths with its own vocabulary. Everything else —
 * paths, methods, schemas, parents — is fixed here so a client cannot address them differently.
 */
export interface ConnectEntrypointOptions {
  /** The guard alias every connector route carries. */
  guard: string
  /** The gate alias and parameters that decide project ownership. */
  gate?: { alias: string, params: string[] }
  /**
   * The gate that decides whether the caller may use the local-LLM mode.
   *
   * Applied to the one route that turns it on — opening a delegated session. Everything else is
   * free: `cloud` is the default, and a project's own override is the platform's browser surface,
   * not the connector's.
   */
  localLlm?: { alias: string, params: string[] }
  /** Path prefix; defaults to `/connect`. */
  path?: string
}
