/**
 * The environment a locally-run target sees, composed for ONE directory.
 *
 * Same tables the publisher composes for a pod, with two differences that follow from where this
 * runs. The hosts are `localhost` — a loopback address, not a claimed preview hostname — and the
 * VALUES come from the target's own `.env` files rather than from slot metadata, because on a
 * developer's machine the platform provisions nothing: the database URL, the queue URL and the
 * OIDC identity are lines in a file the developer and the configure push both write.
 *
 * The defaults are laid down first and the `.env` is overlaid on top, so a user who set a value
 * gets the value they set. Callers that own a port — the boot check, the worker — spread their
 * override over the result, exactly as the publisher does.
 */
export interface TargetEnvHelper {
  /**
   * Runtime environment for the target's api and worker processes.
   *
   * Read at runtime, never baked into the bundle — the api resolves `DATABASE_URL`, `VALKEY_URL`
   * and the OIDC triple when it boots, which is why a configure push that lands after a build still
   * reaches it with nothing more than a restart.
   */
  backendEnv: () => Promise<Record<string, string>>
  /**
   * Build-time environment for the target's browser bundle.
   *
   * DELIBERATE DIFFERENCE from the publisher: `BACKEND_PORT` names the WEB port, not the api's.
   * A slot serves the app and its `/api` from one hostname behind one TLS front door, so the
   * publisher can leave the port blank and let the scheme imply it. A local run has two processes
   * on two loopback ports, and the local server proxies `/api` precisely so the browser stays
   * same-origin — pointing the bundle at 3000 instead would make every call cross-origin and put
   * the target's CORS configuration in the path of a developer's first page load.
   *
   * Composed from the WEB package's own `.env` and never from the root one. The publisher has the
   * same boundary as an allow-list (`frontendEnvVars` / `frontendSecrets`); here it is the file
   * split, and it is what keeps `DATABASE_URL` and `OIDC_SECRET` out of a bundle every visitor
   * downloads.
   */
  frontendEnv: () => Promise<Record<string, string>>
}
