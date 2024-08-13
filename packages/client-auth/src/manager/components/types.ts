import type { AuthToken } from '@owlmeans/auth'
import type { WalletFacade } from '@owlmeans/did'
import type { AuthenticationProps } from './authentication/types.js'

export interface TunnelAuthenticationProps extends AuthenticationProps {
  callback: (token: AuthToken, wallet: WalletFacade) => Promise<boolean>
}
