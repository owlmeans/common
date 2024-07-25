import type { Ed22519BasicAuthUIPluginForm as FormData } from '@owlmeans/client-panel/auth/plugins'
import  { Ed22519BasicAuthUIPluginFormSchema as Schema } from '@owlmeans/client-panel/auth/plugins'
import { AuthenticationStage } from '@owlmeans/auth'
import type { AuthenticationRenderer } from '@owlmeans/client-auth/manager'
import { Form } from '../../components/form/index.js'
import { Text } from '../../components/form/text/index.js'
import { useCallback } from 'react'

export const Ed22519BasicAuthUIPlugin: AuthenticationRenderer = ({ type, stage, control }) => {
  const submit = useCallback(async (data: FormData) => {
    await control.authenticate({
      entityId: data.entityId,
      userId: data.address,
      credential: data.privateKey
    })
  }, [type])

  const content = () => {
    switch (stage) {
      case AuthenticationStage.Authenticate:
        return <>
          <Text name="entityId" label />
          <Text name="address" label />
          <Text name="privateKey" label />
        </>
      default:
        return <>Loading...</>
    }
  }

  return <Form decorate name="basic-ed25519" validation={Schema} onSubmit={submit}
    i18n={{ ns: 'lib', resource: 'client-panel-auth' }}>
    {content()}
  </Form>
}
