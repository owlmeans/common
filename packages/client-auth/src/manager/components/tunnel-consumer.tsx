import { AuthenticationType } from '@owlmeans/auth'
import { AuthenticationHOC } from './authentication/component.js'
import type { FC } from 'react'
import { useMemo } from 'react'
import { useEntrypoint } from '@owlmeans/client'
import type { TunnelAuthenticationProps } from './types.js'

export const TunnelConsumer: FC<Partial<TunnelAuthenticationProps>> = ({ ...props }) => {
  const mod = useEntrypoint()
  const Implementation = useMemo(
    () => AuthenticationHOC(undefined, AuthenticationType.WalletConsumer), []
  )

  return <Implementation {...mod} {...props} type={AuthenticationType.WalletConsumer}/>
}
