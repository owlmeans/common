import type { AuthenticationRendererProps } from '../../components/authentication/types.js'
import type { FC } from 'react'
import type { Connection } from '@owlmeans/socket'

export interface TunnelAuthenticationRenderer extends FC<TunnelAuthenticationRendererProps> {
}

export interface TunnelAuthenticationRendererProps extends AuthenticationRendererProps {
  conn: Connection | null
}
