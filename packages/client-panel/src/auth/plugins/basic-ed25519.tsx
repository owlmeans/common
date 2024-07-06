
import { AuthenticationStage } from '@owlmeans/auth'
import type { AuthenticationRenderer } from '@owlmeans/client-auth/manager'
import { Form } from '../../components/form/index.js'
import { Text } from '../../components/form/text/index.js'
import { SubmitButton } from '../../components/form/button/index.js'
import { useCallback } from 'react'
import type { Ed22519BasicAuthUIPluginForm } from './types.js'
import { defaultEd22519BasicAuthUIPlugin } from './consts.js'

export const Ed22519BasicAuthUIPlugin: AuthenticationRenderer = ({ type, stage, control }) => {
  const submit = useCallback(async (data: Ed22519BasicAuthUIPluginForm) => {
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
          <Text name="entityId" />
          <Text name="address" />
          <Text name="privateKey" />
          <SubmitButton label="login" onSubmit={submit} />
        </>
      default:
        return <>Loading...</>
    }
  }

  return <Form defaults={defaultEd22519BasicAuthUIPlugin}>{content()}</Form>
}
