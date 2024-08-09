import type { AuthToken, WalletFacade } from '@owlmeans/auth'
import type { AuthenticationProps } from './authentication/types.js'

export interface TunnelAuthenticationProps extends AuthenticationProps {
  callback: (token: AuthToken, wallet: WalletFacade) => Promise<boolean>
}
