import LinearProgress from '@mui/material/LinearProgress'
import { AuthenticationStage } from '@owlmeans/auth'
import type { RelyToken } from '@owlmeans/auth'
import type { TunnelAuthenticationRenderer } from '@owlmeans/client-auth/manager/plugins'
import { PinSchema } from '@owlmeans/client-auth/manager/plugins'
import { Form } from '../../components/form/component.js'
import { TextInput } from '../../components/form/text/component.js'
import { Text } from '../../components/text.js'
import { useMemo } from 'react'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'

export const TunnelConsumerUIPlugin: TunnelAuthenticationRenderer = ({ type, stage, control, submit }) => { // { type, stage, control, conn }
  const rely = useMemo(() => {
    if (control.allowance == null) {
      return null
    }
    return makeEnvelopeModel<RelyToken>(
      makeEnvelopeModel<string>(control.allowance.challenge, EnvelopeKind.Wrap).message(true)
      , EnvelopeKind.Wrap
    ).message()
  }, [stage])

  if (stage === AuthenticationStage.Authenticate) {
    return <Form decorate name={type} validation={PinSchema} onSubmit={submit}
      i18n={{ ns: "lib", resource: 'client-panel-auth' }}>
      <Text>{rely?.token}</Text>
      <TextInput name="pin" label hint />
    </Form>
  }

  return <LinearProgress />
}
