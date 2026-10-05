import { AuthForbidden, AuthroizationType } from '@owlmeans/auth'

/**
 * A token may never mint another token.
 *
 * Minting is the one operation that turns a stolen credential into a permanent one: a token that
 * can create tokens survives the revocation of the token that leaked. Creating and revoking
 * therefore require a credential a person produced in a browser — which is also why the deployment
 * names these routes in the guard's deny list, so the refusal is a 401 at the boundary rather than
 * a check every future handler has to remember.
 *
 * Exported because an OAuth authorization server's consent-approval handler
 * (`@owlmeans/server-oauth`) mints tokens too and needs the exact same guard, over a session it
 * verified itself rather than a route this package bound.
 */
export const refuseTokenAuth = (req: { auth?: { type?: string } }, what: string): void => {
  if (req.auth?.type === AuthroizationType.AuthToken) {
    throw new AuthForbidden(what)
  }
}
