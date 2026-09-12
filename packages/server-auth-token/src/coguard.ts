import { GUARD_AUTH_TOKEN } from '@owlmeans/auth-token'
import { decorateEntrypoint, mapProtocols } from '@owlmeans/entrypoint'
import type { EntrypointTree } from '@owlmeans/entrypoint'

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
export const withAuthTokenCoguard = <Tree extends EntrypointTree>(
  tree: Tree, guard: string = GUARD_AUTH_TOKEN,
): Tree => mapProtocols(tree, declaration => {
  if (declaration.guards.length < 1 || declaration.guards.includes(guard)) return declaration

  return decorateEntrypoint(declaration, { guards: [...declaration.guards, guard] })
})
