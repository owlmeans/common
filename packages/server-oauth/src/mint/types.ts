import type { IssueAccessTokenSubject } from '@owlmeans/server-auth-token'
import type { MintMeta, TokenOutcome } from '../handlers/types.js'

/** Minting the access token an approved OAuth request ends in. */
export interface OAuthMintHelper {
  /**
   * The name the token has in the person's own token list — "Viable MCP · my-laptop". It is the ONLY
   * thing that tells one connector's token from another when it is time to revoke one, so it names
   * the client and the place it runs rather than the protocol that issued it.
   */
  tokenNameOf: (meta: MintMeta) => string
  /**
   * Mint an access token for an approved request — shared by the code grant (at the token endpoint,
   * once PKCE and the redirect URI have been re-checked) and the device grant's consent-approval
   * handler (which mints immediately, since that request never comes back unauthenticated).
   */
  mint: (subject: IssueAccessTokenSubject, resource: string | undefined, meta: MintMeta) => Promise<TokenOutcome>
}
