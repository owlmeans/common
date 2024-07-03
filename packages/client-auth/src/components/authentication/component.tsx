import type { AuthenticationControl, TAuthenticationHOC } from './types.js'
import { plugins } from '../../plugins/index.js'
import { AuthenticationStage, AuthenticationType } from '@owlmeans/auth'
import { useMemo, useState } from 'react'

export const AuthenticationHOC: TAuthenticationHOC = (Renderer) => ({ type }) => {
  type = type ?? AuthenticationType.BasicEd25519
  const Implementation = useMemo(() => {
    console.log('Cast component implementation in AuthenticationHOC')
    
    const Com = plugins[type]?.Implementation(Renderer)
    if (Com == null) {
      throw new SyntaxError(`Implementation for ${type} is not defined in AuthenticationHOC`)
    }
    return Com
  }, [type])

  const [stage, setStage] = useState<AuthenticationStage>(AuthenticationStage.Init)

  const manager = useMemo<AuthenticationControl>(() => {
    console.log('Initialize authentication manager in AuthenticationHOC')

    return {
      stage, type: AuthenticationType.BasicEd25519,
      requestAllowence: () => {
        setStage(AuthenticationStage.Allowence)
      },

      authenticate: () => {
      }
    }
  }, [type])

  return <Implementation type={type} stage={stage} control={manager} />
}
