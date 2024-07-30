import type { AuthenticationControl, TAuthenticationHOC } from './types.js'
import type { AuthUIParams } from '@owlmeans/auth-common'
import { plugins } from '../../plugins/index.js'
import { AuthenticationStage, AuthenticationType } from '@owlmeans/auth'
import { useMemo, useState, useRef } from 'react'
import { makeControl } from './control.js'
import { useContext } from '@owlmeans/client'

export const AuthenticationHOC: TAuthenticationHOC = Renderer => ({ type, params, callback }) => {
  const context = useContext()
  const _params: AuthUIParams = params
  type = type ?? _params.type ?? AuthenticationType.BasicEd25519

  const Implementation = useMemo(() => {
    console.log('SAFE: Cast component implementation in AuthenticationHOC')

    const Com = plugins[type]?.Implementation(Renderer)
    if (Com == null) {
      throw new SyntaxError(`Implementation for ${type} is not defined in AuthenticationHOC`)
    }
    return Com
  }, [type])

  const [stage, setStage] = useState<AuthenticationStage>(AuthenticationStage.Init)

  const { current: control } = useRef<AuthenticationControl>((() => {
    console.log('SAFE: Initialize authentication control in AuthenticationHOC')

    return makeControl(context, setStage, callback)
  })())

  return <Implementation type={type} stage={stage} control={control} />
}
