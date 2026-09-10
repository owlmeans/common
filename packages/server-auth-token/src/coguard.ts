import { GUARD_AUTH_TOKEN } from '@owlmeans/auth-token'

/**
 * Let an access token authenticate every route that already has a guard.
 *
 * An API client drives the same surface a browser does — projects, stories, files — so admitting
 * the token only on a dedicated prefix would mean a second copy of every route. The coguard is
 * appended, never substituted: the primary guard stays first and still claims its own credential,
 * and this one matches only a value carrying the deployment's token prefix.
 *
 * Routes that must stay behind an interactive session are named in the GUARD's deny list rather
 * than skipped here — a child entrypoint inherits every guard its ancestors declare and cannot
 * drop one, so the refusal has to live where the credential is inspected.
 */
export const setupAuthTokenCoguard = (
  entrypoints: Array<{ guards?: string[] }>, guard: string = GUARD_AUTH_TOKEN
): void => {
  entrypoints.forEach(entrypoint => {
    if (entrypoint.guards == null || entrypoint.guards.length < 1) return
    if (entrypoint.guards.includes(guard)) return
    entrypoint.guards = [...entrypoint.guards, guard]
  })
}
