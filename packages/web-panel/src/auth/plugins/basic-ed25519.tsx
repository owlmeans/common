import type { Ed22519BasicAuthUIPluginForm as FormData } from '@owlmeans/client-panel/auth/plugins'
import type { AuthenticationControl, AuthenticationRenderer } from '@owlmeans/client-auth/manager'
import type { AppContext } from '../types.js'
import type { ClientModule } from '@owlmeans/client-module'
import type { AuthRequest } from '@owlmeans/auth-common'

import { Ed22519BasicAuthUIPluginFormSchema as Schema } from '@owlmeans/client-panel/auth/plugins'
import { AuthenticationStage, DISPATCHER } from '@owlmeans/auth'
import { Form } from '../../components/form/index.js'
import { TextInput } from '../../components/form/text/index.js'
import { useCallback } from 'react'
import LinearProgress from '@mui/material/LinearProgress'
import { BlockScaling } from '@owlmeans/client-panel'
import { useContext } from '@owlmeans/web-client'

export const Ed22519BasicAuthUIPlugin: AuthenticationRenderer = ({ type, stage, control }) => {
  const context = useContext()
  const submit = useCallback(createSubmit(context, control), [type])

  const content = () => {
    switch (stage) {
      case AuthenticationStage.Authenticate:
        return ['entityId', 'address', 'privateKey'].map(
          name => <TextInput key={name} name={name} label />
        )
      default:
        return <LinearProgress />
    }
  }

  return <Form decorate name="basic-ed25519" horizontal={BlockScaling.Wide}
    i18n={{ ns: 'lib', resource: 'client-panel-auth' }}
    validation={Schema} onSubmit={submit}>
    {content()}
  </Form>
}

const createSubmit = (context: AppContext, control: AuthenticationControl) => async (data: FormData) => {
  const token = await control.authenticate({
    entityId: data.entityId,
    userId: data.address,
    credential: data.privateKey
  })

  if (token.token === '') {
    return
  }

  const [url] = await context.module<ClientModule<string, AuthRequest>>(DISPATCHER)
    .call({ query: token })

  control.setStage?.(control.stage = AuthenticationStage.Authenticated)
  // Give some time - that is really not cenessary - actually we need 
  // to do it on the layout finished its stuff.
  // @TODO fix it for react native (we need some other solution for redirects context indepedent)
  setTimeout(() => window.location.href = url, 100)
}
