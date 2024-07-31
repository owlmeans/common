import type { AuthenticationControl, TAuthenticationHOC } from './types.js'
import type { AuthUIParams } from '@owlmeans/auth-common'
import { plugins } from '../../plugins/index.js'
import { AuthenticationStage, AuthenticationType } from '@owlmeans/auth'
import { useMemo, useState, useRef } from 'react'
import { makeControl } from './control.js'
import { useContext } from '@owlmeans/client'

export const AuthenticationHOC: TAuthenticationHOC = (Renderer, rendererType) => ({ type, params, callback, source }) => {
  const context = useContext()
  const _params: AuthUIParams = params
  type = type ?? _params.type ?? rendererType ?? AuthenticationType.BasicEd25519

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

    const control = makeControl(context, callback)
    control.type = type
    control.setStage = setStage
    control.source = source

    return control
  })())

  return <Implementation type={type} stage={stage} control={control} />
}
