
import { AUTHEN_INIT, AuthenticationType } from '@owlmeans/auth'
import type { AllowenceRequest, AllowenceResponse } from '@owlmeans/auth'
import { useContext } from '@owlmeans/client'
import type { AuthenticationRenderer } from '@owlmeans/client-auth'
import type { Module } from '@owlmeans/client-module'
import { useEffect } from 'react'

export const Ed22519BasicAuthUIPlugin: AuthenticationRenderer = () => {
  const context = useContext()
  useEffect(() => {
    new Promise(async (resolve) => {
      const requestBody: AllowenceRequest = {
        type: AuthenticationType.BasicEd25519
      }
      const result = await context.module<Module<AllowenceResponse>>(AUTHEN_INIT).call(context, {
        body: requestBody
      })
      console.log('>>>>>>>>>>>>>>>', result)
      resolve(void 0)
    })
  }, [])
  return <>Hello world 3</>
}
