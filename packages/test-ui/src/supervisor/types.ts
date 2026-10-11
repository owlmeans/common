import type { AuthRole } from '@owlmeans/auth'
import type { PageHelper } from '../page/types.js'

export interface PregenerateAuthTokenOptions {
  /** Target user id / email the token represents. */
  userId: string
  /**
   * Private key to sign the bearer with, e.g. `ed25519:<base64>` from
   * `.env.dev.secrets`. MUST be the key the target backend trusts as its own
   * signing key (it verifies bearers against `cfg.alias`/`cfg.service`).
   */
  pk: string
  scopes?: string[]
  role?: AuthRole
  entityId?: string
  profileId?: string
  /** `source` recorded in the Auth payload (usually the backend service alias). */
  source?: string
}

export interface SupervisorApiAuthOptions {
  /** Auth-manager API base URL (the backend serving /authentication/* and /authenticate). */
  apiBaseUrl: string
  /** Target user id / email to authenticate (and register on first use). */
  userId: string
  /** Supervisor private key, e.g. `ed25519:<base64>` from `.env.dev.secrets`. */
  pk: string
  /** Paths, overridable for non-default routing. */
  paths?: { init?: string, authenticate?: string, dispatch?: string }
  fetchImpl?: typeof fetch
}

/** Bearers for a backend, minted without a browser. */
export interface SupervisorAuthHelper {
  /**
   * Mint a ready-to-use `ED25519-BASIC-TOKEN ...` bearer offline, reusing
   * `@owlmeans/test-auth`'s `makeBearer`. This is the "set a token directly"
   * fast-path for e2e/integration tests: no UI, no live auth round-trip. The
   * backend accepts it because it is signed by the project's own trusted key.
   *
   * For a faithful end-to-end login (real supervisor plugin + registration), drive
   * {@link PageHelper.loginViaSupervisorForm} instead.
   */
  pregenerateAuthToken: (opts: PregenerateAuthTokenOptions) => Promise<string>
  /**
   * Pregenerate a real bearer by driving the live PK-based supervisor flow over the
   * backend API (no browser): `/authentication/init` -> sign the challenge with the
   * supervisor key -> `/authentication/authenticate` -> `/authenticate` (dispatcher
   * exchange). This is the faithful "set a token directly via API" path
   * (registers the user on first use), independent of any front-end routing.
   *
   * Returns the final `ED25519-BASIC-TOKEN ...` bearer the backend accepts.
   */
  authenticateViaSupervisorApi: (opts: SupervisorApiAuthOptions) => Promise<string>
}
