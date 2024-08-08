import { AuthenticationType } from '@owlmeans/auth'
import { AuthenticationHOC } from './authentication/component.js'
import type { AuthenticationProps } from './authentication/types.js'
import type { FC } from 'react'
import { useMemo } from 'react'
import { useModule } from '@owlmeans/client'

export const TunnelConsumer: FC<Partial<AuthenticationProps>> = ({ ...props }) => {
  const mod = useModule()
  const Implementation = useMemo(
    () => AuthenticationHOC(undefined, AuthenticationType.WalletConsumer), []
  )

  return <Implementation {...mod} {...props} />
}
