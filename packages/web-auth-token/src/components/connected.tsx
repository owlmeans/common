import type { FC } from 'react'
import { useAccessTokens } from '../hooks/use-access-tokens.js'
import { AccessTokensPanel } from './panel.js'
import type { ConnectedAccessTokensPanelProps } from './types.js'

/**
 * The panel wired to the token entrypoints of the current context.
 *
 * This is the whole feature in one element, and the only piece that talks to a server. Anything
 * that needs a different transport renders `AccessTokensPanel` against its own state instead.
 */
export const ConnectedAccessTokensPanel: FC<ConnectedAccessTokensPanelProps> = ({
  aliases, usageHint
}) => {
  const { items, issued, loading, error, create, revoke, dismissIssued } = useAccessTokens(aliases)

  return <AccessTokensPanel
    items={items}
    issued={issued}
    loading={loading}
    error={error}
    onCreate={create}
    onRevoke={revoke}
    onDismissIssued={dismissIssued}
    usageHint={usageHint}
  />
}
