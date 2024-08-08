import LinearProgress from '@mui/material/LinearProgress'
import { AUTH_SCOPE, AuthenticationStage, AuthRole } from '@owlmeans/auth'
import type { Auth, AuthCredentials, RelyToken } from '@owlmeans/auth'
import type { TunnelAuthenticationRenderer } from '@owlmeans/client-auth/manager/plugins'
import { Form } from '../../components/form/component.js'
import { TextInput } from '../../components/form/text/component.js'
import { Text } from '../../components/text.js'
import { useMemo } from 'react'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import type { Connection } from '@owlmeans/socket'
import type { JSONSchemaType } from 'ajv'
import type { AuthenticationControl } from '@owlmeans/client-auth/manager'
import { RELY_PIN_PERFIX } from '@owlmeans/auth-common'

export const TunnelConsumerUIPlugin: TunnelAuthenticationRenderer = ({ type, stage, control, conn }) => { // { type, stage, control, conn }
  const rely = useMemo(() => {
    if (control.allowance == null) {
      return null
    }
    return makeEnvelopeModel<RelyToken>(
      makeEnvelopeModel<string>(control.allowance.challenge, EnvelopeKind.Wrap).message(true)
      , EnvelopeKind.Wrap
    ).message()
  }, [stage])

  const submit = useMemo(() => conn != null ? makeSubmit(conn, control) : undefined, [conn])

  if (stage === AuthenticationStage.Authenticate) {
    return <Form decorate name={type} validation={PinSchema} onSubmit={submit}
      i18n={{ ns: "lib", resource: 'client-panel-auth' }}>
      <Text>{rely?.token}</Text>
      <TextInput name="pin" label />
    </Form>
  }

  return <LinearProgress />
}

const makeSubmit = (conn: Connection, control: AuthenticationControl) => async (data: PinForm) => {
  const auth = await conn.auth<AuthCredentials, Auth>(AuthenticationStage.Authenticate, {
    challenge: control.allowance?.challenge ?? '',
    credential: RELY_PIN_PERFIX + data.pin,
    type: control.type,
    role: AuthRole.Guest,
    userId: '',
    scopes: [AUTH_SCOPE]
  })

  console.log(auth)
}

interface PinForm {
  pin: string
}

const PinSchema: JSONSchemaType<PinForm> = {
  type: 'object',
  properties: {
    pin: { type: 'string', minLength: 2, maxLength: 12 }
  },
  required: ['pin']
}
