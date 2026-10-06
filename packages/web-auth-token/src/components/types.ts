import type { AccessTokensAliases } from '../types.js'

export interface ConnectedAccessTokensPanelProps {
  /** Override where the three routes are mounted. Defaults to the `authToken` alias tree. */
  aliases?: AccessTokensAliases
  /** Already-translated copy shown beside a freshly issued token — see `AccessTokensPanelProps`. */
  usageHint?: string
}
