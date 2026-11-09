import type { Auth } from '@owlmeans/auth'
import type { LazyService } from '@owlmeans/context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'

/**
 * Called once a sign-in has become a session: the bearer exchange (`AuthService.authenticate`)
 * registered the session and signed its token. `auth` is a copy of what the token carries —
 * `userId` (the account), `profileId`, `entitySlug`, `sessionId`, `expiresAt`. Never called on a
 * token refresh.
 */
export interface AuthenticatedListener {
  (auth: Auth, ctx: ServerContext<ServerConfig>): Promise<void>
}

/**
 * Lifecycle notifications of the bearer exchange — the seam a deployment hangs sign-in side effects
 * on (a last-sign-in stamp, an audit line) without wrapping the auth service.
 *
 * Lazy, so a listener can be registered while the context is still being wired.
 */
export interface AuthEventsService extends LazyService {
  /** Called for every session exchange from now on, in registration order. */
  onAuthenticated: (listener: AuthenticatedListener) => void
  /**
   * Run every listener, one after another, each awaited. A listener that throws is logged and the
   * rest still run: a listener never fails the sign-in.
   */
  propagateAuthenticated: (auth: Auth) => Promise<void>
}
